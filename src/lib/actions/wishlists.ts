"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  assignments,
  exchanges,
  itemClaims,
  exchangeParticipants,
  wishlistItems,
  wishlists,
} from "@/lib/schema";
import { normalizeUnfurlUrl } from "@/lib/url-safety";
import { requireEditableExchange } from "@/lib/wishlist-access";
import { hasWishlistBlobToken, isWishlistBlobUrl } from "@/lib/wishlist-image-url";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const uuid = z.string().uuid();
const optionalPrice = z.preprocess(
  (value) => value === "" || value === null ? null : Number(value),
  z.number().int().min(0).max(1_000_000).nullable(),
);
const wishlistItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2_000),
  imageUrl: z.string().trim().max(2_000),
  storeName: z.string().trim().max(100),
  notes: z.string().trim().max(1_000),
  priority: z.enum(["most_wanted", "would_like", "nice_to_have"]),
  priceMin: optionalPrice,
  priceMax: optionalPrice,
});

function optionalExternalUrl(value: string, label: string): string | null {
  if (!value) return null;
  try {
    normalizeUnfurlUrl(value);
    return value;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "Enter a valid web link."}`);
  }
}

const UNPROCESSED_IMAGE_ERROR = "Product image: upload the image or paste its link again so it can be saved.";

/**
 * Images must arrive already re-hosted by POST /api/wishlist-images/upload, so a direct action call
 * cannot store an arbitrary remote image. An unchanged stored image (e.g. legacy) stays editable, and
 * without image storage the upload API returns the validated source URL, so any safe URL is accepted.
 */
function isAcceptedImageUrl(imageUrl: string | null | undefined, storedImageUrl?: string | null): boolean {
  if (!imageUrl || !hasWishlistBlobToken() || isWishlistBlobUrl(imageUrl)) return true;
  return storedImageUrl !== undefined && storedImageUrl !== null && imageUrl === storedImageUrl;
}

function requireAcceptedImageUrl(imageUrl: string | null, storedImageUrl?: string | null) {
  if (!isAcceptedImageUrl(imageUrl, storedImageUrl)) throw new Error(UNPROCESSED_IMAGE_ERROR);
}

function priceBucket(minimum: number | null, maximum: number | null): string | null {
  const value = maximum ?? minimum;
  if (value === null) return null;
  if (value < 25) return "under_25";
  if (value < 50) return "25_49";
  if (value < 100) return "50_99";
  return "100_plus";
}

function parseItem(formData: FormData) {
  const result = wishlistItemSchema.safeParse({
    title: field(formData, "title"),
    url: field(formData, "url"),
    imageUrl: field(formData, "imageUrl"),
    storeName: field(formData, "storeName"),
    notes: field(formData, "notes"),
    priority: field(formData, "priority"),
    priceMin: field(formData, "priceMin"),
    priceMax: field(formData, "priceMax"),
  });
  if (!result.success) throw new Error("Check the gift details and try again.");
  if (result.data.priceMin !== null && result.data.priceMax !== null && result.data.priceMin > result.data.priceMax) {
    throw new Error("The maximum price must be at least the minimum price.");
  }
  return {
    ...result.data,
    url: optionalExternalUrl(result.data.url, "Product link"),
    imageUrl: optionalExternalUrl(result.data.imageUrl, "Product image"),
    storeName: result.data.storeName || null,
    notes: result.data.notes || null,
    priceBucket: priceBucket(result.data.priceMin, result.data.priceMax),
  };
}

async function ensureWishlist(exchangeId: string, userId: string) {
  await db.insert(wishlists).values({ exchangeId, userId }).onConflictDoNothing();
  const [wishlist] = await db.select({ id: wishlists.id }).from(wishlists)
    .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, userId))).limit(1);
  if (!wishlist) throw new Error("Could not open your wishlist.");
  return wishlist.id;
}

const pastedWishSchema = z.object({
  exchangeId: uuid,
  itemId: uuid,
  url: z.string().trim().min(1).max(2_000),
  details: z.object({
    title: z.string().trim().max(200).optional(), notes: z.string().trim().max(1_000).optional(),
    imageUrl: z.string().trim().max(2_000).optional(), storeName: z.string().trim().max(100).optional(),
    priceMin: z.number().int().min(0).max(1_000_000).nullable().optional(),
    priceMax: z.number().int().min(0).max(1_000_000).nullable().optional(),
    priority: z.enum(["most_wanted", "would_like", "nice_to_have"]).optional(),
  }).optional(),
});
export type PastedWishResult = { ok: boolean; itemId?: string; error?: string };

/** The caller generates one UUID for a paste intent and reuses it for every retry. */
export async function createPastedWishlistItem(input: z.input<typeof pastedWishSchema>): Promise<PastedWishResult> {
  const parsed = pastedWishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the link and gift details." };
  const { exchangeId, itemId, url, details } = parsed.data;
  if (!isAcceptedImageUrl(details?.imageUrl)) return { ok: false, error: UNPROCESSED_IMAGE_ERROR };
  try {
    const validated = normalizeUnfurlUrl(url);
    const session = await requireExchangeMember(exchangeId);
    await requireEditableExchange(exchangeId, session.user.id);
    const wishlistId = await ensureWishlist(exchangeId, session.user.id);
    const [existing] = await db.select({ id: wishlistItems.id, wishlistId: wishlistItems.wishlistId, url: wishlistItems.url }).from(wishlistItems).where(eq(wishlistItems.id, itemId)).limit(1);
    if (existing) return existing.wishlistId === wishlistId && existing.url === url
      ? { ok: true, itemId } : { ok: false, error: "This save could not be retried. Paste the link again." };
    if (!(await consumeAuthRateLimit(`wishlist-paste:${session.user.id}`))) return { ok: false, error: "Please wait a minute before adding more links." };
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: details?.title || validated.hostname, url, imageUrl: details?.imageUrl || "", storeName: details?.storeName || validated.hostname, notes: details?.notes || "", priority: details?.priority || "would_like", priceMin: details?.priceMin ?? "", priceMax: details?.priceMax ?? "" })) form.set(key, String(value));
    const item = parseItem(form);
    const [last] = await db.select({ sortOrder: wishlistItems.sortOrder }).from(wishlistItems).where(eq(wishlistItems.wishlistId, wishlistId)).orderBy(desc(wishlistItems.sortOrder)).limit(1);
    const [inserted] = await db.insert(wishlistItems).values({ ...item, id: itemId, wishlistId, previewTitlePending: !details?.title, sortOrder: (last?.sortOrder ?? -1) + 1 }).onConflictDoNothing({ target: wishlistItems.id }).returning({ id: wishlistItems.id });
    if (inserted) await db.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
    // A concurrent request with the same UUID must belong to this exact wish.
    const [saved] = await db.select({ wishlistId: wishlistItems.wishlistId, url: wishlistItems.url }).from(wishlistItems).where(eq(wishlistItems.id, itemId)).limit(1);
    if (!saved || saved.wishlistId !== wishlistId || saved.url !== url) return { ok: false, error: "This gift could not be saved. Paste the link again." };
    revalidatePath(`/wishlists/${exchangeId}`);
    return { ok: true, itemId };
  } catch {
    return { ok: false, error: "Could not save this link. Check it and try again." };
  }
}

export async function createWishlistItem(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const session = await requireExchangeMember(exchangeId);
  await requireEditableExchange(exchangeId, session.user.id);
  const item = parseItem(formData);
  requireAcceptedImageUrl(item.imageUrl);
  const wishlistId = await ensureWishlist(exchangeId, session.user.id);
  const [last] = await db.select({ sortOrder: wishlistItems.sortOrder }).from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, wishlistId)).orderBy(desc(wishlistItems.sortOrder)).limit(1);
  await db.insert(wishlistItems).values({ ...item, wishlistId, sortOrder: (last?.sortOrder ?? -1) + 1 });
  await db.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
  revalidatePath(`/wishlists/${exchangeId}`);
}

export async function updateWishlistItem(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const itemId = uuid.parse(field(formData, "itemId"));
  const session = await requireExchangeMember(exchangeId);
  await requireEditableExchange(exchangeId, session.user.id);
  const item = parseItem(formData);
  const [owned] = await db.select({ id: wishlistItems.id, url: wishlistItems.url, imageUrl: wishlistItems.imageUrl }).from(wishlistItems)
    .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
    .where(and(eq(wishlistItems.id, itemId), eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id))).limit(1);
  if (!owned) throw new Error("Wishlist item not found.");
  requireAcceptedImageUrl(item.imageUrl, owned.imageUrl);
  const clearSourcePrice = owned.url !== item.url || item.priceMin !== null || item.priceMax !== null;
  await db.update(wishlistItems).set({
    ...item,
    previewTitlePending: false,
    ...(clearSourcePrice ? { priceFetchedAt: null, previewPrice: null, previewCurrency: null } : {}),
    ...(owned.url !== item.url ? { previewFinalUrl: null } : {}),
  }).where(eq(wishlistItems.id, itemId));
  await db.update(wishlists).set({ updatedAt: new Date() }).where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id)));
  revalidatePath(`/wishlists/${exchangeId}`);
  revalidatePath(`/wishlists/${exchangeId}/recipient`);
}

export async function deleteWishlistItem(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const itemId = uuid.parse(field(formData, "itemId"));
  const session = await requireExchangeMember(exchangeId);
  await requireEditableExchange(exchangeId, session.user.id);
  const [owned] = await db.select({ id: wishlistItems.id, wishlistId: wishlistItems.wishlistId }).from(wishlistItems)
    .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
    .where(and(eq(wishlistItems.id, itemId), eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id))).limit(1);
  if (!owned) throw new Error("Wishlist item not found.");
  await db.delete(wishlistItems).where(eq(wishlistItems.id, itemId));
  await db.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, owned.wishlistId));
  revalidatePath(`/wishlists/${exchangeId}`);
  revalidatePath(`/wishlists/${exchangeId}/recipient`);
}

export async function moveWishlistItem(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const itemId = uuid.parse(field(formData, "itemId"));
  const direction = z.enum(["up", "down"]).parse(field(formData, "direction"));
  const session = await requireExchangeMember(exchangeId);
  await requireEditableExchange(exchangeId, session.user.id);
  const rows = await db.select({ id: wishlistItems.id, sortOrder: wishlistItems.sortOrder, wishlistId: wishlistItems.wishlistId }).from(wishlistItems)
    .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
    .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id)))
    .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt));
  const index = rows.findIndex(({ id }) => id === itemId);
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0) throw new Error("Wishlist item not found.");
  if (otherIndex >= 0 && otherIndex < rows.length) {
    const current = rows[index]!;
    const other = rows[otherIndex]!;
    await db.transaction(async (tx) => {
      await tx.update(wishlistItems).set({ sortOrder: other.sortOrder }).where(eq(wishlistItems.id, current.id));
      await tx.update(wishlistItems).set({ sortOrder: current.sortOrder }).where(eq(wishlistItems.id, other.id));
      await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, current.wishlistId));
    });
  }
  revalidatePath(`/wishlists/${exchangeId}`);
}

export async function saveWishlistPreferences(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const session = await requireExchangeMember(exchangeId);
  await requireEditableExchange(exchangeId, session.user.id);
  const values = z.object({
    surpriseMe: z.boolean(),
    likes: z.string().trim().max(1_000),
  }).parse({ surpriseMe: formData.get("surpriseMe") === "on", likes: field(formData, "likes") });
  await db.insert(wishlists).values({ exchangeId, userId: session.user.id, surpriseMe: values.surpriseMe, likes: values.likes || null })
    .onConflictDoUpdate({ target: [wishlists.exchangeId, wishlists.userId], set: { surpriseMe: values.surpriseMe, likes: values.likes || null } });
  revalidatePath(`/wishlists/${exchangeId}`);
}

export async function copyPreviousWishlist(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const session = await requireExchangeMember(exchangeId);
  await requireEditableExchange(exchangeId, session.user.id);
  await db.transaction(async (tx) => {
    const [exchange] = await tx.select({ year: exchanges.year }).from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    const [previousExchange] = await tx.select({ id: exchanges.id }).from(exchanges)
      .innerJoin(exchangeParticipants, eq(exchangeParticipants.exchangeId, exchanges.id))
      .where(and(eq(exchangeParticipants.userId, session.user.id), lt(exchanges.year, exchange.year)))
      .orderBy(desc(exchanges.year)).limit(1);
    if (!previousExchange) throw new Error("No earlier exchange wishlist is available to copy.");
    const [source] = await tx.select().from(wishlists)
      .where(and(eq(wishlists.exchangeId, previousExchange.id), eq(wishlists.userId, session.user.id))).limit(1);
    if (!source) throw new Error("No wishlist was saved for the earlier exchange.");
    const [target] = await tx.insert(wishlists).values({
      exchangeId,
      userId: session.user.id,
      surpriseMe: source.surpriseMe,
      likes: source.likes,
    }).onConflictDoNothing().returning({ id: wishlists.id });
    const targetId = target?.id ?? (await tx.select({ id: wishlists.id }).from(wishlists)
      .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id))).limit(1))[0]?.id;
    if (!targetId) throw new Error("Could not create the current wishlist.");
    const existing = await tx.select({ id: wishlistItems.id }).from(wishlistItems).where(eq(wishlistItems.wishlistId, targetId)).limit(1);
    if (existing.length) throw new Error("Copy-forward is only available while the current wishlist is empty.");
    const previousItems = await tx.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, source.id)).orderBy(asc(wishlistItems.sortOrder));
    if (previousItems.length) {
      await tx.insert(wishlistItems).values(previousItems.map(({ title, url, imageUrl, storeName, notes, priority, priceMin, priceMax, priceBucket, sortOrder }) => ({
        wishlistId: targetId,
        title,
        url,
        imageUrl,
        storeName,
        notes,
        priority,
        priceMin,
        priceMax,
        priceBucket,
        sortOrder,
      })));
    }
    await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, targetId));
  });
  revalidatePath(`/wishlists/${exchangeId}`);
}

export async function toggleWishlistClaim(formData: FormData) {
  const exchangeId = uuid.parse(field(formData, "exchangeId"));
  const itemId = uuid.parse(field(formData, "itemId"));
  const session = await requireExchangeMember(exchangeId);
  await db.transaction(async (tx) => {
    // Redraw locks this row before deleting assignments and claims. Taking the
    // same lock first serializes toggles with redraw and makes the checks current.
    const [exchange] = await tx.select({ status: exchanges.status }).from(exchanges)
      .where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    if (exchange.status === "closed") throw new Error("This exchange is closed.");
    const [membership] = await tx.select({ id: exchangeParticipants.id }).from(exchangeParticipants)
      .where(and(eq(exchangeParticipants.exchangeId, exchangeId), eq(exchangeParticipants.userId, session.user.id))).limit(1);
    if (!membership) throw new Error("You are not a participant in this exchange.");
    const [target] = await tx.select({ ownerId: wishlists.userId }).from(wishlistItems)
      .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
      .where(and(eq(wishlistItems.id, itemId), eq(wishlists.exchangeId, exchangeId))).limit(1);
    if (!target) throw new Error("Wishlist item not found.");
    if (target.ownerId === session.user.id) throw new Error("You can’t claim an item from your own wishlist.");
    const [assignment] = await tx.select({ id: assignments.id }).from(assignments)
      .where(and(eq(assignments.exchangeId, exchangeId), eq(assignments.giverId, session.user.id), eq(assignments.receiverId, target.ownerId))).limit(1);
    if (!assignment) throw new Error("Only the assigned giver can view and claim this wishlist.");
    const [existing] = await tx.select({ id: itemClaims.id }).from(itemClaims)
      .where(and(eq(itemClaims.itemId, itemId), eq(itemClaims.giverId, session.user.id))).limit(1);
    if (existing) await tx.delete(itemClaims).where(eq(itemClaims.id, existing.id));
    else await tx.insert(itemClaims).values({ itemId, giverId: session.user.id }).onConflictDoNothing();
  });
  revalidatePath(`/wishlists/${exchangeId}/recipient`);
  revalidatePath("/");
}
