ALTER TABLE "unfurl_cache" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "unfurl_cache" ADD COLUMN "availability" text;--> statement-breakpoint
ALTER TABLE "unfurl_cache" ADD COLUMN "diagnostics" jsonb;