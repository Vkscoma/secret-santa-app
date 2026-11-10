-- Reconcile the previously deployed schema with src/lib/schema.ts.
-- Keep legacy-only fields and unrelated tables to preserve earlier app data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.exchange)
    OR EXISTS (SELECT 1 FROM public.invite_links)
    OR EXISTS (SELECT 1 FROM public.assignment)
    OR EXISTS (SELECT 1 FROM public.audit_log) THEN
    RAISE EXCEPTION 'Reconciliation stopped: review exchange, invite, assignment, and audit data before migrating';
  END IF;
END $$;

DO $$
DECLARE role_type text;
BEGIN
  SELECT data_type INTO role_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='user' AND column_name='role';
  IF role_type='USER-DEFINED' THEN
    ALTER TABLE public."user" ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public."user" ALTER COLUMN role TYPE text USING role::text;
    ALTER TABLE public."user" ALTER COLUMN role SET DEFAULT 'user';
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user' AND column_name='sizes') = 'jsonb' THEN
    ALTER TABLE public."user" ALTER COLUMN sizes TYPE text USING
      CASE WHEN sizes IS NULL THEN NULL WHEN jsonb_typeof(sizes)='string' THEN sizes #>> '{}' ELSE sizes::text END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='allowlist' AND column_name='added_by_user_id') THEN
    ALTER TABLE public.allowlist RENAME COLUMN added_by_user_id TO added_by;
  END IF;
END $$;
ALTER TABLE public.allowlist ALTER COLUMN added_by DROP NOT NULL;
ALTER TABLE public.allowlist ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin' NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_rate_limits' AND column_name='count') THEN
    ALTER TABLE public.auth_rate_limits RENAME COLUMN count TO attempts;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_rate_limits' AND column_name='window_started_at') = 'timestamp with time zone' THEN
    ALTER TABLE public.auth_rate_limits ALTER COLUMN window_started_at TYPE timestamp USING window_started_at AT TIME ZONE 'UTC';
  END IF;
END $$;
ALTER TABLE public.auth_rate_limits ALTER COLUMN window_started_at DROP DEFAULT;
ALTER TABLE public.auth_rate_limits ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_links' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.invite_links RENAME COLUMN created_by_user_id TO created_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_links' AND column_name='exchange_name_snapshot') THEN
    ALTER TABLE public.invite_links ADD COLUMN exchange_name_snapshot text;
    UPDATE public.invite_links i SET exchange_name_snapshot=e.name FROM public.exchange e WHERE i.exchange_id=e.id;
    UPDATE public.invite_links SET exchange_name_snapshot='Secret Santa' WHERE exchange_name_snapshot IS NULL;
    ALTER TABLE public.invite_links ALTER COLUMN exchange_name_snapshot SET NOT NULL;
  END IF;
END $$;
ALTER TABLE public.invite_links ALTER COLUMN exchange_id SET NOT NULL;
ALTER TABLE public.invite_links ALTER COLUMN created_by DROP NOT NULL;
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_links' AND column_name='expires_at') = 'timestamp with time zone' THEN
    ALTER TABLE public.invite_links ALTER COLUMN expires_at TYPE timestamp USING expires_at AT TIME ZONE 'UTC';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_links' AND column_name='revoked_at') = 'timestamp with time zone' THEN
    ALTER TABLE public.invite_links ALTER COLUMN revoked_at TYPE timestamp USING revoked_at AT TIME ZONE 'UTC';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_links' AND column_name='created_at') = 'timestamp with time zone' THEN
    ALTER TABLE public.invite_links ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_links' AND column_name='updated_at') = 'timestamp with time zone' THEN
    ALTER TABLE public.invite_links ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_redemptions' AND column_name='redeemed_at') = 'timestamp with time zone' THEN
    ALTER TABLE public.invite_redemptions ALTER COLUMN redeemed_at TYPE timestamp USING redeemed_at AT TIME ZONE 'UTC';
  END IF;
END $$;

ALTER TABLE public.exchange
  ADD COLUMN IF NOT EXISTS budget_min integer,
  ADD COLUMN IF NOT EXISTS budget_max integer,
  ADD COLUMN IF NOT EXISTS exchange_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS time_zone text DEFAULT 'America/Los_Angeles' NOT NULL,
  ADD COLUMN IF NOT EXISTS auto_reveal boolean DEFAULT false NOT NULL;
ALTER TABLE public.exchange ALTER COLUMN exchange_at SET NOT NULL;
ALTER TABLE public.exchange DROP CONSTRAINT IF EXISTS exchange_year_unique;
DROP INDEX IF EXISTS public.exchange_year_unique;
CREATE INDEX IF NOT EXISTS exchange_year_idx ON public.exchange USING btree (year);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.exchange'::regclass AND conname='exchange_budget_range_check') THEN
    ALTER TABLE public.exchange ADD CONSTRAINT exchange_budget_range_check CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max);
  END IF;
END $$;

-- Match the current restrictive participant references. The deployed tables are
-- empty; dropping the older cascading rules prevents deleting a user from erasing
-- exchange history if these records are later populated.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, relname FROM pg_constraint
    JOIN pg_class ON pg_class.oid=conrelid
    JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
    WHERE nspname='public' AND contype='f'
      AND relname IN ('exchange_participant','assignment','exclusion')
      AND confrelid='public."user"'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.relname, c.conname);
  END LOOP;
  ALTER TABLE public.exchange_participant ADD CONSTRAINT exchange_participant_user_id_user_id_fk
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE RESTRICT;
  ALTER TABLE public.assignment ADD CONSTRAINT assignment_giver_id_user_id_fk
    FOREIGN KEY (giver_id) REFERENCES public."user"(id) ON DELETE RESTRICT;
  ALTER TABLE public.assignment ADD CONSTRAINT assignment_receiver_id_user_id_fk
    FOREIGN KEY (receiver_id) REFERENCES public."user"(id) ON DELETE RESTRICT;
  ALTER TABLE public.exclusion ADD CONSTRAINT exclusion_giver_id_user_id_fk
    FOREIGN KEY (giver_id) REFERENCES public."user"(id) ON DELETE RESTRICT;
  ALTER TABLE public.exclusion ADD CONSTRAINT exclusion_receiver_id_user_id_fk
    FOREIGN KEY (receiver_id) REFERENCES public."user"(id) ON DELETE RESTRICT;
END $$;

ALTER TABLE public.exchange_participant ADD COLUMN IF NOT EXISTS joined_at timestamp DEFAULT now() NOT NULL;
ALTER TABLE public.exclusion ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='actor_user_id') THEN
    ALTER TABLE public.audit_log RENAME COLUMN actor_user_id TO actor_id;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='target_id') = 'text' THEN
    ALTER TABLE public.audit_log ALTER COLUMN target_id TYPE uuid USING NULLIF(btrim(target_id), '')::uuid;
  END IF;
END $$;
ALTER TABLE public.audit_log ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
UPDATE public.audit_log SET metadata='{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE public.audit_log ALTER COLUMN metadata SET NOT NULL;

-- Replace the old non-nullable actor foreign keys with nullable SET NULL rules.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.allowlist'::regclass AND contype='f'
    AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.allowlist'::regclass AND attname='added_by')]::smallint[]
  LOOP EXECUTE format('ALTER TABLE public.allowlist DROP CONSTRAINT %I',c); END LOOP;
  ALTER TABLE public.allowlist ADD CONSTRAINT allowlist_added_by_user_id_fk FOREIGN KEY (added_by) REFERENCES public."user"(id) ON DELETE SET NULL;
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.invite_links'::regclass AND contype='f'
    AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.invite_links'::regclass AND attname='created_by')]::smallint[]
  LOOP EXECUTE format('ALTER TABLE public.invite_links DROP CONSTRAINT %I',c); END LOOP;
  ALTER TABLE public.invite_links ADD CONSTRAINT invite_links_created_by_user_id_fk FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.audit_log'::regclass AND contype='f'
    AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.audit_log'::regclass AND attname='actor_id')]::smallint[]
  LOOP EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I',c); END LOOP;
  ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_id_user_id_fk FOREIGN KEY (actor_id) REFERENCES public."user"(id) ON DELETE SET NULL;
END $$;

ALTER TABLE public.allowlist DROP CONSTRAINT IF EXISTS allowlist_email_unique;
ALTER TABLE public.allowlist DROP CONSTRAINT IF EXISTS allowlist_email_exchange_unique;
DROP INDEX IF EXISTS public.allowlist_email_unique;
DROP INDEX IF EXISTS public.allowlist_email_exchange_unique;
CREATE UNIQUE INDEX IF NOT EXISTS allowlist_email_exchange_unique ON public.allowlist USING btree(email,exchange_id) WHERE exchange_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS allowlist_global_email_unique ON public.allowlist USING btree(email) WHERE exchange_id IS NULL;
CREATE INDEX IF NOT EXISTS allowlist_exchange_idx ON public.allowlist USING btree(exchange_id);
CREATE INDEX IF NOT EXISTS invite_links_exchange_idx ON public.invite_links USING btree(exchange_id);
CREATE UNIQUE INDEX IF NOT EXISTS invite_redemptions_invite_user_unique ON public.invite_redemptions USING btree(invite_link_id,user_id);
CREATE INDEX IF NOT EXISTS invite_redemptions_user_idx ON public.invite_redemptions USING btree(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS exchange_participant_exchange_user_unique ON public.exchange_participant USING btree(exchange_id,user_id);
CREATE INDEX IF NOT EXISTS exchange_participant_user_idx ON public.exchange_participant USING btree(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS exclusion_exchange_giver_receiver_unique ON public.exclusion USING btree(exchange_id,giver_id,receiver_id);
CREATE INDEX IF NOT EXISTS exclusion_exchange_idx ON public.exclusion USING btree(exchange_id);
CREATE INDEX IF NOT EXISTS assignment_exchange_idx ON public.assignment USING btree(exchange_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log USING btree(created_at);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON public.audit_log USING btree(target_type,target_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.exclusion'::regclass AND conname='exclusion_no_self_check') THEN
    ALTER TABLE public.exclusion ADD CONSTRAINT exclusion_no_self_check CHECK (giver_id <> receiver_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignment'::regclass AND conname='assignment_no_self_check') THEN
    ALTER TABLE public.assignment ADD CONSTRAINT assignment_no_self_check CHECK (giver_id <> receiver_id);
  END IF;
END $$;
