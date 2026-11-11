-- Stop before changing the live schema if legacy wishlist/cache data needs a
-- reviewed mapping. The empty legacy tables can then be reconciled in place.
DO $$
DECLARE
	legacy_rows boolean;
BEGIN
	IF to_regclass('public.wishlist_item') IS NOT NULL THEN
		EXECUTE 'LOCK TABLE public.wishlist_item IN ACCESS EXCLUSIVE MODE';
	END IF;
	IF to_regclass('public.unfurl_cache') IS NOT NULL THEN
		EXECUTE 'LOCK TABLE public.unfurl_cache IN ACCESS EXCLUSIVE MODE';
	END IF;
	IF to_regclass('public.wishlist_item') IS NOT NULL THEN
		EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.wishlist_item LIMIT 1)' INTO legacy_rows;
		IF legacy_rows THEN
			RAISE EXCEPTION 'Wave 4 migration stopped: legacy wishlist_item rows need a reviewed data migration';
		END IF;
	END IF;
	IF to_regclass('public.unfurl_cache') IS NOT NULL THEN
		EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.unfurl_cache LIMIT 1)' INTO legacy_rows;
		IF legacy_rows THEN
			RAISE EXCEPTION 'Wave 4 migration stopped: legacy unfurl_cache rows need a reviewed expiry/price conversion';
		END IF;
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.wishlist (
	"id" uuid PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"surprise_me" boolean DEFAULT false NOT NULL,
	"likes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.unfurl_cache (
	"id" uuid PRIMARY KEY NOT NULL,
	"normalized_url" text NOT NULL,
	"title" text,
	"image_url" text,
	"site_name" text,
	"price" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "unfurl_cache_normalized_url_unique" UNIQUE("normalized_url")
);
--> statement-breakpoint
-- Preserve a legacy numeric price as text and add expiry for cache freshness.
DO $$
DECLARE
	price_type text;
BEGIN
	SELECT data_type INTO price_type
	FROM information_schema.columns
	WHERE table_schema = 'public' AND table_name = 'unfurl_cache' AND column_name = 'price';
	IF price_type IS NOT NULL AND price_type <> 'text' THEN
		ALTER TABLE public.unfurl_cache ALTER COLUMN price TYPE text USING price::text;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.unfurl_cache ADD COLUMN IF NOT EXISTS expires_at timestamp;
--> statement-breakpoint
UPDATE public.unfurl_cache
SET expires_at = COALESCE(expires_at, fetched_at + interval '6 hours')
WHERE expires_at IS NULL;
--> statement-breakpoint
ALTER TABLE public.unfurl_cache ALTER COLUMN expires_at SET NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.wishlist_item (
	"id" uuid PRIMARY KEY NOT NULL,
	"wishlist_id" uuid,
	"title" text NOT NULL,
	"url" text,
	"image_url" text,
	"store_name" text,
	"notes" text,
	"priority" text DEFAULT 'would_like' NOT NULL,
	"price_min" integer,
	"price_max" integer,
	"price_bucket" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS wishlist_id uuid;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS url text;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS store_name text;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS priority text DEFAULT 'would_like' NOT NULL;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS price_min integer;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS price_max integer;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ADD COLUMN IF NOT EXISTS price_bucket text;
--> statement-breakpoint
ALTER TABLE public.wishlist_item ALTER COLUMN wishlist_id SET NOT NULL;
--> statement-breakpoint
-- Legacy exchange_id/owner_id/price/link/site_name columns, FKs, and indexes
-- remain for data preservation. The app inserts through wishlist_id, so only
-- the legacy owner keys must become nullable.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wishlist_item' AND column_name = 'exchange_id') THEN
		ALTER TABLE public.wishlist_item ALTER COLUMN exchange_id DROP NOT NULL;
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wishlist_item' AND column_name = 'owner_id') THEN
		ALTER TABLE public.wishlist_item ALTER COLUMN owner_id DROP NOT NULL;
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.item_claim (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"giver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_exchange_id_exchange_id_fk' AND conrelid = 'public.wishlist'::regclass) THEN
		ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_exchange_id_exchange_id_fk FOREIGN KEY (exchange_id) REFERENCES public.exchange(id) ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_user_id_user_id_fk' AND conrelid = 'public.wishlist'::regclass) THEN
		ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE restrict ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_item_wishlist_id_wishlist_id_fk' AND conrelid = 'public.wishlist_item'::regclass) THEN
		ALTER TABLE public.wishlist_item ADD CONSTRAINT wishlist_item_wishlist_id_wishlist_id_fk FOREIGN KEY (wishlist_id) REFERENCES public.wishlist(id) ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_item_price_range_check' AND conrelid = 'public.wishlist_item'::regclass) THEN
		ALTER TABLE public.wishlist_item ADD CONSTRAINT wishlist_item_price_range_check CHECK (price_min IS NULL OR price_min >= 0);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_item_price_max_check' AND conrelid = 'public.wishlist_item'::regclass) THEN
		ALTER TABLE public.wishlist_item ADD CONSTRAINT wishlist_item_price_max_check CHECK (price_max IS NULL OR price_max >= 0);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_item_price_order_check' AND conrelid = 'public.wishlist_item'::regclass) THEN
		ALTER TABLE public.wishlist_item ADD CONSTRAINT wishlist_item_price_order_check CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_item_priority_check' AND conrelid = 'public.wishlist_item'::regclass) THEN
		ALTER TABLE public.wishlist_item ADD CONSTRAINT wishlist_item_priority_check CHECK (priority IN ('most_wanted', 'would_like', 'nice_to_have'));
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_claim_item_id_wishlist_item_id_fk' AND conrelid = 'public.item_claim'::regclass) THEN
		ALTER TABLE public.item_claim ADD CONSTRAINT item_claim_item_id_wishlist_item_id_fk FOREIGN KEY (item_id) REFERENCES public.wishlist_item(id) ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_claim_giver_id_user_id_fk' AND conrelid = 'public.item_claim'::regclass) THEN
		ALTER TABLE public.item_claim ADD CONSTRAINT item_claim_giver_id_user_id_fk FOREIGN KEY (giver_id) REFERENCES public."user"(id) ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unfurl_cache_normalized_url_unique" ON public.unfurl_cache USING btree (normalized_url);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_exchange_user_unique" ON public.wishlist USING btree (exchange_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wishlist_user_idx" ON public.wishlist USING btree (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wishlist_item_wishlist_order_idx" ON public.wishlist_item USING btree (wishlist_id, sort_order);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_claim_item_giver_unique" ON public.item_claim USING btree (item_id, giver_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_claim_giver_idx" ON public.item_claim USING btree (giver_id);
