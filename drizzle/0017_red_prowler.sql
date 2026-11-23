DELETE FROM item_claim a USING item_claim b
WHERE a.item_id = b.item_id AND (a.created_at, a.id) > (b.created_at, b.id);
--> statement-breakpoint
DROP INDEX "item_claim_item_giver_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "item_claim_item_unique" ON "item_claim" USING btree ("item_id");
