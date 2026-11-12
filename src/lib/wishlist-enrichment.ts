// Imported only by the enrichment API; never import this module from pages or actions.
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { PastedWishResult } from "@/lib/actions/wishlists";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { renderUnfurlPage } from "@/lib/playwright-unfurl";
import { wishlistItems, wishlists } from "@/lib/schema";
import { normalizeUnfurlUrl, unfurlUrl } from "@/lib/unfurl";
import { getCachedLinkPreview } from "@/lib/unfurl-preview";
import { requireEditableExchange } from "@/lib/wishlist-access";
import { storeProductImage } from "@/lib/wishlist-images";
const uuid = z.string().uuid();
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Metadata is optional: errors never remove the already saved wish. */
export async function enrichWishlistItem(input: { exchangeId: string; itemId: string; preserveTitle?: boolean }): Promise<PastedWishResult> {
  const parsed = z.object({ exchangeId: uuid, itemId: uuid, preserveTitle: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "This gift could not be previewed." };
  const { exchangeId, itemId, preserveTitle } = parsed.data;
  try {
    const session = await requireExchangeMember(exchangeId);
    await requireEditableExchange(exchangeId, session.user.id);
    const [item] = await db.select({ item: wishlistItems, revision: sql<string>`${wishlistItems}.xmin::text` }).from(wishlistItems).innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id)).where(and(eq(wishlistItems.id, itemId), eq(wishlists.userId, session.user.id), eq(wishlists.exchangeId, exchangeId))).limit(1);
    if (!item?.item.url) return { ok: false, error: "Add a link to this gift first." };
    if (!(await consumeAuthRateLimit(`wishlist-unfurl:${session.user.id}`))) return { ok: false, itemId, error: "The gift is saved. Try refreshing its link later." };
    const snapshot = item.item;
    const originalUrl = snapshot.url!;
    const metadata = await getCachedLinkPreview(originalUrl);
    let imageUrl: string | null = null;
    if (!snapshot.imageUrl && metadata.imageUrl) {
      try { imageUrl = await storeProductImage(metadata.imageUrl); } catch { /* Leave a usable placeholder. */ }
    }
    // Keep explicit source amount/currency separate from manually entered USD ranges.
    const canSetPrice = snapshot.priceMin === null && snapshot.priceMax === null && !snapshot.previewPrice && metadata.price !== null && metadata.currency !== null;
    const missingPrice = sql`${wishlistItems.priceMin} is null and ${wishlistItems.priceMax} is null and ${wishlistItems.previewPrice} is null`;
    const values = {
      ...(!preserveTitle && snapshot.previewTitlePending && metadata.title && metadata.fieldSources.title !== "url" ? {
        title: sql`case when ${wishlistItems.previewTitlePending} and ${wishlistItems}.xmin::text = ${item.revision} then ${metadata.title.slice(0, 200)} else ${wishlistItems.title} end`,
        previewTitlePending: false,
      } : {}),
      ...(imageUrl ? { imageUrl: sql`case when ${wishlistItems.imageUrl} is null then ${imageUrl} else ${wishlistItems.imageUrl} end` } : {}),
      ...(canSetPrice ? {
        previewPrice: sql`case when ${missingPrice} then ${metadata.price} else ${wishlistItems.previewPrice} end`,
        previewCurrency: sql`case when ${missingPrice} then ${metadata.currency} else ${wishlistItems.previewCurrency} end`,
        priceFetchedAt: sql`case when ${missingPrice} then ${metadata.fetchedAt}::timestamp else ${wishlistItems.priceFetchedAt} end`,
      } : {}),
      previewFinalUrl: metadata.debug.finalUrl,
    };
    // Apply each optional field atomically. Edits win while unrelated missing fields can still fill.
    // Title uses the exact PostgreSQL row revision, avoiding timestamp precision loss or same-ms edits.
    await db.update(wishlistItems).set(values).where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.url, originalUrl)));
    revalidatePath(`/wishlists/${exchangeId}`);
    revalidatePath(`/wishlists/${exchangeId}/recipient`);
    return metadata.reason ? { ok: false, itemId, error: "The gift is saved. You can name it or add an image manually." } : { ok: true, itemId };
  } catch {
    return { ok: false, itemId, error: "The gift is saved. You can edit its details manually." };
  }
}

export type RefreshWishlistImageState = { message: string; error: boolean };

export async function refreshWishlistItemImage(_previous: RefreshWishlistImageState, formData: FormData): Promise<RefreshWishlistImageState> {
  const exchangeId = uuid.safeParse(field(formData, "exchangeId"));
  const itemId = uuid.safeParse(field(formData, "itemId"));
  if (!exchangeId.success || !itemId.success) return { message: "Could not refresh this product image.", error: true };

  const session = await requireExchangeMember(exchangeId.data);
  await requireEditableExchange(exchangeId.data, session.user.id);
  const [item] = await db.select({ id: wishlistItems.id, url: wishlistItems.url, imageUrl: wishlistItems.imageUrl, previewTitlePending: wishlistItems.previewTitlePending, revision: sql<string>`${wishlistItems}.xmin::text` })
    .from(wishlistItems)
    .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
    .where(and(eq(wishlistItems.id, itemId.data), eq(wishlists.exchangeId, exchangeId.data), eq(wishlists.userId, session.user.id)))
    .limit(1);
  if (!item) return { message: "Wishlist item not found.", error: true };
  if (!item.url) return { message: "Add a product link before refreshing its image.", error: true };
  if (!(await consumeAuthRateLimit(`wishlist-image-refresh:${session.user.id}`))) {
    return { message: "You’ve refreshed several images. Wait a minute and try again.", error: true };
  }

  try {
    const metadata = await unfurlUrl(normalizeUnfurlUrl(item.url).toString(), { render: (url) => renderUnfurlPage(url) });
    const titlePatch = item.previewTitlePending && metadata.title && metadata.fieldSources.title !== "url" ? {
      title: sql`case when ${wishlistItems.previewTitlePending} and ${wishlistItems}.xmin::text = ${item.revision} then ${metadata.title.slice(0, 200)} else ${wishlistItems.title} end`,
      previewTitlePending: false,
    } : {};
    if (!metadata.imageUrl) {
      if (titlePatch.title) {
        await db.update(wishlistItems).set(titlePatch).where(and(eq(wishlistItems.id, item.id), eq(wishlistItems.url, item.url)));
        revalidatePath(`/wishlists/${exchangeId.data}`);
        revalidatePath(`/wishlists/${exchangeId.data}/recipient`);
      }
      const message = metadata.reason === "blocked" ? "The store blocked the preview request. Your link is saved; add an image manually."
        : metadata.reason === "timeout" ? "The store took too long to respond. Your link is saved; try again or add an image manually."
        : metadata.reason === "not_html" ? "This link did not return a web page. Your link is saved; add an image manually."
        : "No usable product image was found on this page. Your link is saved; add an image manually.";
      return { message, error: true };
    }
    const imageUrl = await storeProductImage(metadata.imageUrl);
    await db.update(wishlistItems).set({ imageUrl, ...titlePatch }).where(and(eq(wishlistItems.id, item.id), eq(wishlistItems.url, item.url), item.imageUrl === null ? sql`${wishlistItems.imageUrl} is null` : eq(wishlistItems.imageUrl, item.imageUrl)));
    revalidatePath(`/wishlists/${exchangeId.data}`);
    revalidatePath(`/wishlists/${exchangeId.data}/recipient`);
    return { message: imageUrl === metadata.imageUrl ? "Image link refreshed." : "Product image refreshed and saved.", error: false };
  } catch (error) {
    return { message: error instanceof Error && error.name === "UnfurlSafetyError" ? error.message : "Could not read an image from this product link.", error: true };
  }
}

