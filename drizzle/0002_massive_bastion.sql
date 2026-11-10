CREATE TABLE "allowlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"exchange_id" uuid,
	"added_by" text,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limits_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"exchange_id" uuid NOT NULL,
	"exchange_name_snapshot" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp,
	"max_uses" integer,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invite_link_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "shipping_address" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sizes" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "allowlist" ADD CONSTRAINT "allowlist_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invite_link_id_invite_links_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."invite_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allowlist_email_unique" ON "allowlist" USING btree ("email");--> statement-breakpoint
CREATE INDEX "allowlist_exchange_idx" ON "allowlist" USING btree ("exchange_id");--> statement-breakpoint
CREATE INDEX "invite_links_exchange_idx" ON "invite_links" USING btree ("exchange_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_redemptions_invite_user_unique" ON "invite_redemptions" USING btree ("invite_link_id","user_id");--> statement-breakpoint
CREATE INDEX "invite_redemptions_user_idx" ON "invite_redemptions" USING btree ("user_id");