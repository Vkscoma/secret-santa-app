// Dependency-free so server actions and client code can share the check without pulling in Sharp.
const HOSTED_BLOB_SUFFIX = ".public.blob.vercel-storage.com";

/** True for an image already re-hosted by the wishlist image pipeline. Safe to call from client code. */
export function isWishlistBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(HOSTED_BLOB_SUFFIX);
  } catch { return false; }
}

/** Server only: whether image storage is configured (otherwise the upload API returns validated source URLs). */
export function hasWishlistBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
