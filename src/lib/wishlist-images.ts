import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { isPublicAddress, normalizeUnfurlUrl, UnfurlSafetyError } from "@/lib/unfurl";

export const MAX_WISHLIST_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"]);

type ImageResponse = { statusCode: number; location: string | null; contentType: string | null; body: Buffer };
type Address = { address: string; family: number };

function hostOf(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

async function publicAddress(hostname: string): Promise<Address> {
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await dnsLookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new UnfurlSafetyError("This image host resolves to a private or reserved network address.");
  }
  return addresses[0]!;
}

function getPinnedImage(url: URL, address: Address): Promise<ImageResponse> {
  return new Promise((resolve, reject) => {
    const host = hostOf(url);
    const lookup = ((hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      if (hostname.toLowerCase() !== host) {
        callback(Object.assign(new Error("Unexpected image host lookup."), { code: "EINVAL" }), "", 0);
        return;
      }
      callback(null, address.address, address.family);
    }) as import("node:net").LookupFunction;
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(url, {
      method: "GET",
      agent: false,
      lookup,
      family: address.family,
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { Accept: "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5", "User-Agent": "SecretSantaWishlistImage/1.0" },
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = typeof response.headers.location === "string" ? response.headers.location : null;
      const contentType = typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : null;
      const length = Number(response.headers["content-length"] ?? 0);
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.destroy();
        resolve({ statusCode, location, contentType, body: Buffer.alloc(0) });
        return;
      }
      if (statusCode !== 200 || !contentType?.toLowerCase().startsWith("image/")) {
        response.destroy();
        resolve({ statusCode, location: null, contentType, body: Buffer.alloc(0) });
        return;
      }
      if (length > MAX_REMOTE_IMAGE_BYTES) {
        response.destroy();
        reject(new Error("The product image is too large to save."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_REMOTE_IMAGE_BYTES) {
          response.destroy(new Error("The product image is too large to save."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ statusCode, location: null, contentType, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function downloadRemoteImage(rawUrl: string): Promise<Buffer> {
  let url = normalizeUnfurlUrl(rawUrl);
  const visited = new Set<string>();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const key = url.toString();
    if (visited.has(key)) throw new UnfurlSafetyError("The image URL contains a redirect loop.");
    visited.add(key);
    const address = await publicAddress(hostOf(url));
    const response = await getPinnedImage(url, address);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      if (redirects === MAX_REDIRECTS) throw new UnfurlSafetyError("The image URL redirects too many times.");
      url = normalizeUnfurlUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.statusCode !== 200 || !response.contentType?.toLowerCase().startsWith("image/")) {
      throw new Error("The product image URL did not return an image.");
    }
    if (!response.body.byteLength) throw new Error("The product image is too small to save.");
    return response.body;
  }
  throw new Error("The image URL redirects too many times.");
}

function convertToWebp(input: Buffer) {
  return sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

export function isWishlistBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch { return false; }
}

export function hasWishlistBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function saveWebp(input: Buffer): Promise<string> {
  if (!hasWishlistBlobToken()) throw new Error("Wishlist image storage is not configured. Add BLOB_READ_WRITE_TOKEN to enable uploads.");
  const webp = await convertToWebp(input);
  const blob = await put(`wishlist-images/${crypto.randomUUID()}.webp`, webp, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/webp",
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

/** Stores verified user uploads as normalized, metadata-stripped WebP images. */
export async function storeUploadedWishlistImage(input: Buffer): Promise<string> {
  if (!input.byteLength || input.byteLength > MAX_WISHLIST_UPLOAD_BYTES) throw new Error("Choose an image under 5 MB.");
  const metadata = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).metadata();
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) throw new Error("Choose a supported image file.");
  return saveWebp(input);
}

/** Validates and stores a remote product image, keeping its source URL only if Blob is not configured. */
export async function storeProductImage(rawUrl: string): Promise<string> {
  const normalized = normalizeUnfurlUrl(rawUrl).toString();
  if (isWishlistBlobUrl(normalized)) return normalized;
  const image = await downloadRemoteImage(normalized);
  const decoded = await sharp(image, { limitInputPixels: 40_000_000, failOn: "error" }).metadata();
  if (!decoded.format || !ALLOWED_FORMATS.has(decoded.format)) throw new Error("The product URL did not return a supported image.");
  if (!hasWishlistBlobToken()) return normalized;
  try { return await saveWebp(image); }
  catch {
    // A transient Blob outage must not prevent a wishlist item from saving.
    return normalized;
  }
}

export const wishlistImageInternals = { convertToWebp, downloadRemoteImage, publicAddress, getPinnedImage };
