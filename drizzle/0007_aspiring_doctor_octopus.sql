-- The deployed exchange table already has a required created_by column.
-- Add the compatible nullable column/FK only on databases built from the
-- tracked migrations that do not already have them.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'exchange' AND column_name = 'created_by'
	) THEN
		ALTER TABLE public.exchange ADD COLUMN created_by text;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.exchange'::regclass AND conname = 'exchange_created_by_user_id_fk'
	) THEN
		ALTER TABLE public.exchange ADD CONSTRAINT exchange_created_by_user_id_fk
			FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
	END IF;
END $$;
