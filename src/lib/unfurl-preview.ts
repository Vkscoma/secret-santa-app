import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { renderUnfurlPage } from "@/lib/playwright-unfurl";
import { unfurlCache } from "@/lib/schema";
import { normalizeCacheKey, normalizeUnfurlUrl, unfurlCacheTtlMs, unfurlUrl, type UnfurlMetadata } from "@/lib/unfurl";

export const LINK_PREVIEW_VERSION = 6;
export type CachedLinkPreview = UnfurlMetadata & { fetchedAt: string };

/** Only cache successful page metadata; a blocked request can be retried immediately. */
export async function getCachedLinkPreview(rawUrl: string): Promise<CachedLinkPreview> {
  const key = normalizeCacheKey(normalizeUnfurlUrl(rawUrl));
  const [cached] = await db.select().from(unfurlCache).where(and(eq(unfurlCache.normalizedUrl, key), gt(unfurlCache.expiresAt, new Date()))).limit(1);
  const snapshot = cached?.diagnostics?.preview as UnfurlMetadata | undefined;
  if (cached && cached.metadataVersion === LINK_PREVIEW_VERSION && snapshot) {
    return { ...snapshot, fetchedAt: cached.fetchedAt.toISOString() };
  }
  const metadata = await unfurlUrl(rawUrl, { render: (url) => renderUnfurlPage(url) });
  const now = new Date();
  if (!metadata.reason && Object.values(metadata.fieldSources).some((source) => source !== "url")) {
    const values = {
      title: metadata.title, imageUrl: metadata.imageUrl, siteName: metadata.siteName,
      price: metadata.price, currency: metadata.currency, description: metadata.description,
      variant: metadata.variant, availability: metadata.availability,
      diagnostics: { preview: metadata }, metadataVersion: LINK_PREVIEW_VERSION,
      fetchedAt: now, expiresAt: new Date(now.getTime() + unfurlCacheTtlMs),
    };
    await db.insert(unfurlCache).values({ normalizedUrl: key, ...values }).onConflictDoUpdate({ target: unfurlCache.normalizedUrl, set: values });
  }
  return { ...metadata, fetchedAt: now.toISOString() };
}
