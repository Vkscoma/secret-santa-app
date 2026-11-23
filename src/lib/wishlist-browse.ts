import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { RecipientGiftItem } from "@/components/secret-santa/recipient-gift-card";
import { db } from "@/lib/db";
import { exchangeParticipants, itemClaims, user, wishlistItems, wishlists } from "@/lib/schema";

export type ClaimState = "available" | "mine" | "taken";

/** md5 of an empty string: the version of a wishlist with no claimed items. */
export const EMPTY_CLAIMS_VERSION = "d41d8cd98f00b204e9800998ecf8427e";

/**
 * Opaque fingerprint of which items on one owner's wishlist are claimed. It is
 * built only from sorted claimed item IDs, so it never reveals givers or timing,
 * and is identical however Postgres scans the rows.
 */
export async function getClaimsVersion(exchangeId: string, ownerId: string): Promise<string> {
  const [row] = await db
    .select({
      version: sql<string>`md5(coalesce(string_agg(${itemClaims.itemId}::text, ',' order by ${itemClaims.itemId}), ''))`,
    })
    .from(itemClaims)
    .innerJoin(wishlistItems, eq(itemClaims.itemId, wishlistItems.id))
    .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
    .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, ownerId)));
  // An aggregate without GROUP BY always yields one row; the fallback is defensive.
  return row?.version ?? EMPTY_CLAIMS_VERSION;
}

/** Returns anonymous claim states and never reads claims for the viewer's own items. */
export async function getClaimStates(
  viewerId: string,
  itemIds: string[]
): Promise<Map<string, ClaimState>> {
  if (!itemIds.length) return new Map();
  const rows = await db
    .select({
      itemId: wishlistItems.id,
      isClaimed: sql<boolean>`${itemClaims.id} is not null`,
      isMine: sql<boolean>`${itemClaims.giverId} = ${viewerId}`,
    })
    .from(wishlistItems)
    .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
    .leftJoin(itemClaims, eq(itemClaims.itemId, wishlistItems.id))
    .where(and(inArray(wishlistItems.id, itemIds), sql`${wishlists.userId} <> ${viewerId}`));
  const states = new Map<string, ClaimState>();
  for (const { itemId, isClaimed, isMine } of rows) {
    states.set(itemId, isMine ? "mine" : isClaimed ? "taken" : "available");
  }
  return states;
}

export async function listBrowsableParticipants(exchangeId: string, viewerId: string) {
  const rows = await db
    .select({
      userId: user.id,
      displayName: user.displayName,
      name: user.name,
      itemCount: count(wishlistItems.id),
      surpriseMe: wishlists.surpriseMe,
    })
    .from(exchangeParticipants)
    .innerJoin(user, eq(exchangeParticipants.userId, user.id))
    .leftJoin(
      wishlists,
      and(eq(wishlists.exchangeId, exchangeParticipants.exchangeId), eq(wishlists.userId, user.id))
    )
    .leftJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
    .where(
      and(
        eq(exchangeParticipants.exchangeId, exchangeId),
        sql`${exchangeParticipants.userId} <> ${viewerId}`
      )
    )
    .groupBy(user.id, user.displayName, user.name, wishlists.surpriseMe)
    .orderBy(asc(user.displayName), asc(user.name));
  const people = rows.map(({ userId, displayName, name, itemCount, surpriseMe }) => ({
    userId,
    firstName: displayName?.trim().split(/\s+/)[0] || name.trim().split(/\s+/)[0] || "Participant",
    itemCount: Number(itemCount),
    surpriseMe: surpriseMe ?? false,
    lastInitial: name.trim().split(/\s+/).at(-1)?.[0] ?? "",
  }));
  const nameCounts = new Map<string, number>();
  for (const person of people)
    nameCounts.set(person.firstName, (nameCounts.get(person.firstName) ?? 0) + 1);
  return people.map(({ lastInitial, ...person }) => ({
    ...person,
    firstName:
      (nameCounts.get(person.firstName) ?? 0) > 1 && lastInitial
        ? `${person.firstName} ${lastInitial}.`
        : person.firstName,
  }));
}

export async function getBrowsableWishlist(
  exchangeId: string,
  viewerId: string,
  ownerId: string
): Promise<null | {
  firstName: string;
  sizes: string | null;
  likes: string | null;
  surpriseMe: boolean;
  items: RecipientGiftItem[];
}> {
  if (ownerId === viewerId) return null;
  const [owner] = await db
    .select({
      userId: user.id,
      displayName: user.displayName,
      name: user.name,
      sizes: user.sizes,
      likes: wishlists.likes,
      surpriseMe: wishlists.surpriseMe,
      wishlistId: wishlists.id,
    })
    .from(exchangeParticipants)
    .innerJoin(user, eq(exchangeParticipants.userId, user.id))
    .leftJoin(
      wishlists,
      and(eq(wishlists.exchangeId, exchangeParticipants.exchangeId), eq(wishlists.userId, user.id))
    )
    .where(
      and(eq(exchangeParticipants.exchangeId, exchangeId), eq(exchangeParticipants.userId, ownerId))
    )
    .limit(1);
  if (!owner) return null;
  const items = owner.wishlistId
    ? await db
        .select({
          id: wishlistItems.id,
          title: wishlistItems.title,
          url: wishlistItems.url,
          storeName: wishlistItems.storeName,
          imageUrl: wishlistItems.imageUrl,
          notes: wishlistItems.notes,
          priority: wishlistItems.priority,
          priceMin: wishlistItems.priceMin,
          priceMax: wishlistItems.priceMax,
          previewPrice: wishlistItems.previewPrice,
          previewCurrency: wishlistItems.previewCurrency,
          priceFetchedAt: wishlistItems.priceFetchedAt,
          previewTitlePending: wishlistItems.previewTitlePending,
        })
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, owner.wishlistId))
        .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt))
    : [];
  return {
    firstName:
      owner.displayName?.trim().split(/\s+/)[0] ||
      owner.name.trim().split(/\s+/)[0] ||
      "Participant",
    sizes: owner.sizes,
    likes: owner.likes,
    surpriseMe: owner.surpriseMe ?? false,
    items,
  };
}
