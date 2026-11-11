import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { db } from "@/lib/db";
import { exchanges, exchangeParticipants, wishlistItems, wishlists } from "@/lib/schema";
import { hasWishlistBlobToken, MAX_WISHLIST_UPLOAD_BYTES, storeUploadedWishlistImage } from "@/lib/wishlist-images";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Sign in to upload an image." }, { status: 401 });
  if (!hasWishlistBlobToken()) return NextResponse.json({ error: "Image storage is not configured yet." }, { status: 503 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Choose a valid image file." }, { status: 400 }); }
  const exchangeId = z.string().uuid().safeParse(form.get("exchangeId"));
  const itemIdValue = form.get("itemId");
  const itemId = itemIdValue ? z.string().uuid().safeParse(itemIdValue) : null;
  const file = form.get("file");
  if (!exchangeId.success || (itemId && !itemId.success) || !(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choose a valid image file." }, { status: 400 });
  }
  if (file.size > MAX_WISHLIST_UPLOAD_BYTES) return NextResponse.json({ error: "Choose an image under 5 MB." }, { status: 413 });
  const [membership] = await db.select({ id: exchangeParticipants.id }).from(exchangeParticipants).where(and(
    eq(exchangeParticipants.exchangeId, exchangeId.data), eq(exchangeParticipants.userId, session.user.id),
  )).limit(1);
  if (!membership) return NextResponse.json({ error: "You are not a participant in this exchange." }, { status: 403 });
  const [exchange] = await db.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId.data)).limit(1);
  if (!exchange || exchange.status === "closed") return NextResponse.json({ error: "This exchange is closed; its wishlist is read-only." }, { status: 403 });
  if (itemId?.success) {
    const [owned] = await db.select({ id: wishlistItems.id }).from(wishlistItems)
      .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
      .where(and(eq(wishlistItems.id, itemId.data), eq(wishlists.exchangeId, exchangeId.data), eq(wishlists.userId, session.user.id))).limit(1);
    if (!owned) return NextResponse.json({ error: "Wishlist item not found." }, { status: 404 });
  }
  if (!(await consumeAuthRateLimit(`wishlist-image-upload:${session.user.id}`))) {
    return NextResponse.json({ error: "You’ve uploaded several images. Wait a minute and try again." }, { status: 429 });
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const url = await storeUploadedWishlistImage(bytes);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image upload failed." }, { status: 400 });
  }
}
