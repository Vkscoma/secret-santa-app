DROP INDEX "allowlist_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "allowlist_email_exchange_unique" ON "allowlist" USING btree ("email","exchange_id");