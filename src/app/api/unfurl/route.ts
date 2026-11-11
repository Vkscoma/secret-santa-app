import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { db } from "@/lib/db";
import { renderUnfurlPage } from "@/lib/playwright-unfurl";
import { exchangeParticipants, unfurlCache } from "@/lib/schema";
import { normalizeCacheKey, normalizeUnfurlUrl, unfurlCacheTtlMs, unfurlUrl, urlFallbackMetadata, UnfurlSafetyError } from "@/lib/unfurl";

export const runtime = "nodejs";
export const maxDuration = 45;
const METADATA_VERSION = 4;

const requestSchema = z.object({
  exchangeId: z.string().uuid(),
  url: z.string().trim().min(1).max(2_000),
});

function fallbackMetadata(normalizedUrl: string) {
  return urlFallbackMetadata(normalizedUrl);
}

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
  try { normalizedUrl = normalizeCacheKey(normalizeUnfurlUrl(parsed.data.url)); }
  catch (error) {
    const message = error instanceof UnfurlSafetyError ? error.message : "This link can’t be previewed.";
    return NextResponse.json({ ok: false, error: message, reason: "invalid_url" }, { status: 400 });
  }

  const [cached] = await db.select().from(unfurlCache)
    .where(and(eq(unfurlCache.normalizedUrl, normalizedUrl), gt(unfurlCache.expiresAt, new Date()))).limit(1);
  if (cached && cached.metadataVersion >= METADATA_VERSION) {
    const diagnostics = cached.diagnostics ?? {};
    const metadata = {
      normalizedUrl,
      title: cached.title,
      imageUrl: cached.imageUrl,
      siteName: cached.siteName,
      price: cached.price,
      currency: cached.currency,
      description: cached.description,
      variant: cached.variant,
      availability: cached.availability,
      canonicalUrl: diagnostics.canonicalUrl ?? null,
      fieldSources: diagnostics.fieldSources ?? { title: "cache", siteName: "cache" },
      confidence: diagnostics.confidence ?? "low",
      reason: diagnostics.reason ?? null,
      isProductPage: diagnostics.isProductPage ?? false,
      debug: diagnostics.debug ?? { httpStatus: null, challenge: false, finalUrl: normalizedUrl, fetchPath: "none" },
    };
    return NextResponse.json({ ok: true, data: metadata, metadata, confidence: metadata.confidence, fieldSources: metadata.fieldSources, reason: metadata.reason }, { headers: { "Cache-Control": "no-store" } });
  }

  let metadata;
  try { metadata = await unfurlUrl(normalizedUrl, { render: (url) => renderUnfurlPage(url) }); }
  catch (error) {
    if (error instanceof UnfurlSafetyError) return NextResponse.json({ ok: false, error: error.message, reason: "invalid_url" }, { status: 400 });
    metadata = fallbackMetadata(normalizedUrl);
  }
  const hasHtmlMetadata = Object.values(metadata.fieldSources).some((source) => source !== "url");
  if (hasHtmlMetadata && metadata.reason !== "blocked" && metadata.reason !== "timeout" && metadata.reason !== "not_html") {
    const now = new Date();
    const cacheValues = {
    title: metadata.title,
    imageUrl: metadata.imageUrl,
    siteName: metadata.siteName,
    price: metadata.price,
    currency: metadata.currency,
    description: metadata.description,
    variant: metadata.variant,
    availability: metadata.availability,
    diagnostics: { fieldSources: metadata.fieldSources, confidence: metadata.confidence, reason: metadata.reason, isProductPage: metadata.isProductPage, canonicalUrl: metadata.canonicalUrl, debug: metadata.debug },
    metadataVersion: METADATA_VERSION,
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + unfurlCacheTtlMs),
    };
    await db.insert(unfurlCache).values({ normalizedUrl, ...cacheValues }).onConflictDoUpdate({ target: unfurlCache.normalizedUrl, set: cacheValues });
  }
  return NextResponse.json({ ok: true, data: metadata, metadata, confidence: metadata.confidence, fieldSources: metadata.fieldSources, reason: metadata.reason }, { headers: { "Cache-Control": "no-store" } });
}
