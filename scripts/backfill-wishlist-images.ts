import "dotenv/config";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../src/lib/db";
import { wishlistItems } from "../src/lib/schema";
import { storeProductImage } from "../src/lib/wishlist-images";
import { unfurlUrl } from "../src/lib/unfurl";
import { renderUnfurlPage } from "../src/lib/playwright-unfurl";


async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required; no backfill was run.");
  }
  const candidates = await db.select({ id: wishlistItems.id, url: wishlistItems.url }).from(wishlistItems)
    .where(and(isNull(wishlistItems.imageUrl), isNotNull(wishlistItems.url)));
  console.log(`Found ${candidates.length} linked wishlist items without images.`);
  if (!apply) {
    console.log("Dry run only. Add --apply to fetch and save product images.");
    return;
  }
  let saved = 0;
  for (const item of candidates) {
    if (!item.url) continue;
    try {
      const metadata = await unfurlUrl(item.url, { render: (url) => renderUnfurlPage(url) });
      if (!metadata.imageUrl) continue;
      const imageUrl = await storeProductImage(metadata.imageUrl);
      if (imageUrl === metadata.imageUrl) continue;
      const result = await db.update(wishlistItems).set({ imageUrl }).where(and(
        eq(wishlistItems.id, item.id), eq(wishlistItems.url, item.url), isNull(wishlistItems.imageUrl), isNotNull(wishlistItems.url),
      )).returning({ id: wishlistItems.id });
      if (result.length) saved += 1;
    } catch (error) {
      console.warn(`Skipped ${item.id}: ${error instanceof Error ? error.message : "image extraction failed"}`);
    }
  }
  console.log(`Saved ${saved} image${saved === 1 ? "" : "s"}.`);
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
