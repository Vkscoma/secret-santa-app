CREATE TYPE "public"."exchange_status" AS ENUM('open', 'drawn', 'revealed', 'closed');--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"giver_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_no_self_check" CHECK ("assignment"."giver_id" <> "assignment"."receiver_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_participant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"exchange_at" timestamp with time zone NOT NULL,
	"time_zone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"notes" text,
	"status" "exchange_status" DEFAULT 'open' NOT NULL,
	"auto_reveal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_budget_range_check" CHECK ("exchange"."budget_min" is null or "exchange"."budget_max" is null or "exchange"."budget_min" <= "exchange"."budget_max")
);
--> statement-breakpoint
CREATE TABLE "exclusion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"giver_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exclusion_no_self_check" CHECK ("exclusion"."giver_id" <> "exclusion"."receiver_id")
);
--> statement-breakpoint
DROP INDEX "allowlist_email_exchange_unique";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_giver_id_user_id_fk" FOREIGN KEY ("giver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_receiver_id_user_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_participant" ADD CONSTRAINT "exchange_participant_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_participant" ADD CONSTRAINT "exchange_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion" ADD CONSTRAINT "exclusion_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion" ADD CONSTRAINT "exclusion_giver_id_user_id_fk" FOREIGN KEY ("giver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion" ADD CONSTRAINT "exclusion_receiver_id_user_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_exchange_giver_unique" ON "assignment" USING btree ("exchange_id","giver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_exchange_receiver_unique" ON "assignment" USING btree ("exchange_id","receiver_id");--> statement-breakpoint
CREATE INDEX "assignment_exchange_idx" ON "assignment" USING btree ("exchange_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_participant_exchange_user_unique" ON "exchange_participant" USING btree ("exchange_id","user_id");--> statement-breakpoint
CREATE INDEX "exchange_participant_user_idx" ON "exchange_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exchange_year_idx" ON "exchange" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX "exclusion_exchange_giver_receiver_unique" ON "exclusion" USING btree ("exchange_id","giver_id","receiver_id");--> statement-breakpoint
CREATE INDEX "exclusion_exchange_idx" ON "exclusion" USING btree ("exchange_id");--> statement-breakpoint
ALTER TABLE "allowlist" ADD CONSTRAINT "allowlist_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allowlist_global_email_unique" ON "allowlist" USING btree ("email") WHERE "allowlist"."exchange_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "allowlist_email_exchange_unique" ON "allowlist" USING btree ("email","exchange_id") WHERE "allowlist"."exchange_id" is not null;