import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isEmailAllowlisted } from "@/lib/auth-access";
import { db } from "@/lib/db";
import { exchangeParticipants } from "@/lib/schema";
import { getClaimsVersion } from "@/lib/wishlist-browse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteProps = { params: Promise<{ exchangeId: string; ownerId: string }> };

const exchangeIdSchema = z.string().uuid();
// Matches the participant wishlist page's user ID validation.
const ownerIdSchema = z.string().min(1).max(160);

// Claim state is per-viewer and changes often: never let a browser or CDN cache it.
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function errorResponse(error: string, status: 401 | 403 | 404 | 500) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

/**
 * Lightweight poll target for ClaimsAutoRefresh. Checked in this order:
 * 404 malformed IDs → 401 no session → 403 not allowlisted → 404 the viewer's
 * own list → 403 viewer not a member → 404 owner not a participant.
 * Non-membership is 403 whether or not the exchange exists, so it reveals nothing.
 * Admins are treated like any member; assignments are not consulted.
 */
export async function GET(request: Request, { params }: RouteProps) {
  const { exchangeId: rawExchangeId, ownerId: rawOwnerId } = await params;
  const exchangeId = exchangeIdSchema.safeParse(rawExchangeId);
  const ownerId = ownerIdSchema.safeParse(rawOwnerId);
  if (!exchangeId.success || !ownerId.success) return errorResponse("Not found.", 404);

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return errorResponse("Sign in to see gift updates.", 401);
    if (!(await isEmailAllowlisted(session.user.email))) {
      return errorResponse("This account can’t view gift updates.", 403);
    }

    const viewerId = session.user.id;
    // Owners must never learn the claim state of their own list.
    if (viewerId === ownerId.data) return errorResponse("Not found.", 404);
    const memberRows = await db
      .select({ userId: exchangeParticipants.userId })
      .from(exchangeParticipants)
      .where(
        and(
          eq(exchangeParticipants.exchangeId, exchangeId.data),
          inArray(exchangeParticipants.userId, [viewerId, ownerId.data])
        )
      );
    const memberIds = new Set(memberRows.map(({ userId }) => userId));
    if (!memberIds.has(viewerId)) return errorResponse("You’re not part of this exchange.", 403);
    if (!memberIds.has(ownerId.data)) return errorResponse("Not found.", 404);

    const version = await getClaimsVersion(exchangeId.data, ownerId.data);
    return NextResponse.json({ version }, { headers: NO_STORE_HEADERS });
  } catch {
    return errorResponse("Gift updates aren’t available right now.", 500);
  }
}
