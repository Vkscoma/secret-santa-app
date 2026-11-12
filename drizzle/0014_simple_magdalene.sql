CREATE TABLE "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	CONSTRAINT "message_sender_role_check" CHECK ("message"."sender_role" in ('giver', 'recipient')),
	CONSTRAINT "message_body_length_check" CHECK (char_length("message"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_assignment_sent_idx" ON "message" USING btree ("assignment_id","sent_at");