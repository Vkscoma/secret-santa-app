import { NextResponse } from "next/server";
import { enrichWishlistItem } from "@/lib/actions/wishlists";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 45;

/** Run slow optional metadata independently from the client's server-action edit queue. */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ ok: false, error: "Sign in to preview a gift." }, { status: 401 });
    const body: unknown = await request.json();
    // The action validates every field and checks session, exchange membership and ownership.
    const result = await enrichWishlistItem(body as Parameters<typeof enrichWishlistItem>[0]);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "The gift is saved. Its details can be edited manually." }, { status: 400 });
  }
}
