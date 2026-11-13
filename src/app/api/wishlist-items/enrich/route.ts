import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enrichWishlistItem, refreshWishlistItemImage } from "@/lib/wishlist-enrichment";

export const runtime = "nodejs";
export const maxDuration = 45;

/** Run slow optional metadata independently from the client's server-action edit queue. */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ ok: false, error: "Sign in to preview a gift." }, { status: 401 });
    const body: unknown = await request.json();
    const parsed = z.object({
      exchangeId: z.string().uuid(), itemId: z.string().uuid(),
      preserveTitle: z.boolean().optional(), mode: z.enum(["enrich", "refresh-image"]).optional(),
    }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Check the gift details." }, { status: 400 });
    // Both operations recheck exchange membership, editability and item ownership.
    if (parsed.data.mode === "refresh-image") {
      const form = new FormData();
      form.set("exchangeId", parsed.data.exchangeId);
      form.set("itemId", parsed.data.itemId);
      const result = await refreshWishlistItemImage({ message: "", error: false }, form);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const { exchangeId, itemId, preserveTitle } = parsed.data;
    const result = await enrichWishlistItem(preserveTitle === undefined ? { exchangeId, itemId } : { exchangeId, itemId, preserveTitle });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "The gift is saved. Its details can be edited manually." }, { status: 400 });
  }
}
