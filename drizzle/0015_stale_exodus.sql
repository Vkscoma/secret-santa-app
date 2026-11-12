CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_user_id" text NOT NULL,
	"exchange_id" uuid,
	"type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error_at" timestamp,
	"error" text,
	"provider_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "email_log_status_check" CHECK ("email_log"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_recipient_created_idx" ON "email_log" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_log_exchange_type_idx" ON "email_log" USING btree ("exchange_id","type");