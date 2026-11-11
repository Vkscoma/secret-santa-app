import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { db } from "@/lib/db";
import { exchangeParticipants } from "@/lib/schema";
import { normalizeUnfurlUrl, UnfurlSafetyError } from "@/lib/unfurl";
import { getCachedLinkPreview } from "@/lib/unfurl-preview";

export const runtime = "nodejs";
export const maxDuration = 45;

const requestSchema = z.object({
  exchangeId: z.string().uuid(),
  url: z.string().trim().min(1).max(2_000),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Sign in to preview a link." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Send a valid link to preview." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the link and try again." }, { status: 400 });

  const [membership] = await db.select({ id: exchangeParticipants.id }).from(exchangeParticipants)
    .where(and(eq(exchangeParticipants.exchangeId, parsed.data.exchangeId), eq(exchangeParticipants.userId, session.user.id))).limit(1);
  if (!membership) return NextResponse.json({ error: "You are not a participant in this exchange." }, { status: 403 });
  if (!(await consumeAuthRateLimit(`wishlist-unfurl:${session.user.id}`))) {
    return NextResponse.json({ error: "You’ve requested several previews. Wait a minute and try again." }, { status: 429 });
  }

  let normalizedUrl: string;
  try { normalizedUrl = normalizeUnfurlUrl(parsed.data.url).toString(); }
  catch (error) {
    const message = error instanceof UnfurlSafetyError ? error.message : "This link can’t be previewed.";
    return NextResponse.json({ ok: false, error: message, reason: "invalid_url" }, { status: 400 });
  }

  try {
    const metadata = await getCachedLinkPreview(normalizedUrl);
    return NextResponse.json({ ok: true, data: metadata, metadata, confidence: metadata.confidence, fieldSources: metadata.fieldSources, reason: metadata.reason }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnfurlSafetyError) return NextResponse.json({ ok: false, error: error.message, reason: "invalid_url" }, { status: 400 });
    return NextResponse.json({ ok: false, error: "The preview could not be loaded. You can still save the link." }, { status: 503 });
  }
}
