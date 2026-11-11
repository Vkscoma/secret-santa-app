import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

export const UNFURL_MAX_BYTES = 2_000_000;
export const UNFURL_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FACEBOOK_CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type UnfurlField = "title" | "imageUrl" | "siteName" | "price" | "currency" | "description" | "variant" | "availability" | "canonicalUrl";
export type UnfurlConfidence = "high" | "medium" | "low";
export type UnfurlReason = "blocked" | "timeout" | "not_html" | "no_metadata" | "invalid_url";

export type UnfurlDebug = {
  httpStatus: number | null;
  challenge: boolean;
  finalUrl: string;
  fetchPath: "direct" | "facebook-crawler" | "playwright" | "none";
};

export type UnfurlMetadata = {
  normalizedUrl: string;
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
  price: string | null;
  currency: string | null;
  description: string | null;
  variant: string | null;
  availability: string | null;
  canonicalUrl: string | null;
  fieldSources: Partial<Record<UnfurlField, string>>;
  confidence: UnfurlConfidence;
  reason: UnfurlReason | null;
  isProductPage: boolean;
  debug: UnfurlDebug;
};

type DnsAddress = { address: string; family: number };
type ResolvedAddress = { address: string; family: 4 | 6 };
type HtmlResponse = {
  statusCode: number;
  location: string | null;
  contentType: string | null;
  body: string;
};

export type ImageValidationResponse = { valid: boolean; statusCode: number; contentType: string | null; size: number };

export function destroyRedirectResponse(response: { destroy: () => unknown }) {
  response.destroy();
}

export class UnfurlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnfurlSafetyError";
  }
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value >>> 0;
}

function ipv4InSubnet(address: string, subnet: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const base = ipv4Number(subnet);
  if (value === null || base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function ipv6Words(input: string): number[] | null {
  let address = input.toLowerCase().split("%")[0] ?? "";
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const v4 = address.slice(lastColon + 1);
    const value = ipv4Number(v4);
    if (value === null) return null;
    address = `${address.slice(0, lastColon)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 && missing < 1) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  const words = parts.map((part) => /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : -1);
  return words.length === 8 && words.every((word) => word >= 0) ? words : null;
}

function ipv6IsPublic(address: string): boolean {
  const words = ipv6Words(address);
  if (!words) return false;
  // Permit only global unicast (2000::/3), then exclude special-use/documentation blocks.
  if ((words[0]! & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && words[1]! <= 0x01ff) return false; // IETF special-purpose 2001::/23
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false; // documentation
  if (words[0] === 0x2001 && words[1] === 0x0002) return false; // benchmarking 2001:2::/48
  if (words[0] === 0x3fff) return false; // documentation 3fff::/20
  if (words[0] === 0x5f00) return false; // SRv6 5f00::/16
  if (words[0] === 0x2002) return false; // 6to4 embeds an IPv4 destination
  return true;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked: [string, number][] = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([subnet, prefix]) => ipv4InSubnet(address, subnet, prefix));
  }
  if (family === 6) return ipv6IsPublic(address);
  return false;
}

function hostnameOf(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

export function normalizeUnfurlUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnfurlSafetyError("Enter a valid product URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnfurlSafetyError("Only HTTP and HTTPS links can be previewed.");
  }
  if (url.username || url.password) throw new UnfurlSafetyError("URLs with embedded credentials are not allowed.");
  const hostname = hostnameOf(url);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UnfurlSafetyError("This host cannot be previewed.");
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new UnfurlSafetyError("Only standard web ports can be previewed.");
  }
  if (isIP(hostname) && !isPublicAddress(hostname)) throw new UnfurlSafetyError("Private or reserved network addresses are blocked.");
  url.hash = "";
  url.hostname = hostname;
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_[^=]+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url;
}

export function normalizeCacheKey(url: URL): string {
  const copy = new URL(url.toString());
  if (copy.pathname.length > 1) copy.pathname = copy.pathname.replace(/\/+$/, "");
  return copy.toString();
}

function readHtml(url: URL, pinned: ResolvedAddress, timeoutMs: number, maxBytes: number, userAgent = BROWSER_UA, allowJson = false, extraHeaders: Record<string, string> = {}): Promise<HtmlResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const targetHost = hostnameOf(url);
    const lookup = ((host: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      if (host.toLowerCase() !== targetHost) {
        callback(Object.assign(new Error("Unexpected host lookup"), { code: "EINVAL" }), "", 0);
        return;
      }
      callback(null, pinned.address, pinned.family);
    }) as LookupFunction;
    const req = transport(url, {
      method: "GET",
      agent: false,
      lookup,
      headers: {
        Accept: allowJson ? "application/json,application/hal+json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": userAgent,
        "Upgrade-Insecure-Requests": "1",
        "Accept-Encoding": "identity",
        Connection: "close",
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(timeoutMs),
    }, (res) => {
      const statusCode = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      const contentType = typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : null;
      const contentLength = Number(res.headers["content-length"] ?? 0);
      if (statusCode >= 300 && statusCode < 400) {
        destroyRedirectResponse(res);
        resolve({ statusCode, location, contentType, body: "" });
        return;
      }
      if (!contentType?.toLowerCase().includes("text/html") && !(allowJson && /(?:application\/(?:hal\+)?json|\+json)/i.test(contentType ?? ""))) {
        res.destroy();
        resolve({ statusCode, location, contentType, body: "" });
        return;
      }
      const contentEncoding = res.headers["content-encoding"];
      if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
        res.destroy();
        resolve({ statusCode, location, contentType, body: "" });
        return;
      }
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        res.destroy();
        reject(new Error("Response is too large."));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > maxBytes) {
          res.destroy(new Error("Response is too large."));
          return;
        }
        chunks.push(bytes);
      });
      res.on("end", () => resolve({ statusCode, location, contentType, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Math.min(Number(dec), 0x10ffff)))
    .replace(/&#x([\da-f]+);?/gi, (_, hex: string) => String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function plainText(value: string): string {
  return decodeEntities(value.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = plainText(value);
  return cleaned ? cleaned.slice(0, 1_000) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function attrsOf(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const attr of source.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    values.set(attr[1]!.toLowerCase(), decodeEntities(attr[2] ?? attr[3] ?? attr[4] ?? ""));
  }
  return values;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|\s|[-'])\p{L}/gu, (match) => match.toUpperCase());
}

function storeFromHost(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length > 2 && labels.at(-1)?.length === 2 && ["co", "com", "org", "net", "gov", "ac"].includes(labels.at(-2) ?? "")) labels.splice(-2);
  else labels.pop();
  return titleCase(labels.join(" ").replace(/[-_]+/g, " ")) || titleCase(host.replace(/^www\./, ""));
}

export function titleFromSlug(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => {
    let value = segment;
    try { value = decodeURIComponent(segment); } catch { /* Keep the source segment. */ }
    return value.replace(/\.[a-z0-9]{1,6}$/i, "").replace(/^\d{5,}(?:[-_]+|$)/, "").replace(/[-_]+/g, " ").trim();
  }).filter(Boolean);
  const longest = segments.sort((a, b) => b.length - a.length)[0];
  return longest ? titleCase(longest) : null;
}

function metaTags(html: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = attrsOf(match[1]!);
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    const value = attrs.get("content");
    if (key && value && !values.has(key)) values.set(key, value);
  }
  return values;
}

function imageUrl(value: unknown, base: URL): string | null {
  return imageUrls(value, base)[0] ?? null;
}

function imageUrls(value: unknown, base: URL): string[] {
  const resolvedUrls: string[] = [];
  for (const candidate of Array.isArray(value) ? value : [value]) {
    const object = record(candidate);
    const raw = typeof candidate === "string" ? candidate : object?.url ?? object?.contentUrl ?? object?.["@id"];
    if (typeof raw !== "string") continue;
    try {
      const resolved = new URL(raw, base);
      if (resolved.protocol === "http:") resolved.protocol = "https:";
      resolved.hash = "";
      const normalized = normalizeUnfurlUrl(resolved.toString()).toString().slice(0, 2_000);
      if (!resolvedUrls.includes(normalized)) resolvedUrls.push(normalized);
    }
    catch { /* Try the next available image. */ }
  }
  return resolvedUrls;
}

type ImageCandidate = { url: string; score: number; source: string };
const imageNoise = /(?:logo|icon|sprite|badge|avatar|placeholder|pixel|tracking|spinner|loading)/i;
const IMAGE_NOISE_PENALTY = 10_000_000;
const MAX_IMAGE_CANDIDATES = 10;
const IMAGE_VALIDATION_BUDGET_MS = 4_000;
const IMAGE_STAGE_RANK = { structured: 6_000_000, meta: 5_000_000, amazon: 4_000_000, microdata: 3_000_000, heuristic: 2_000_000 };
const MAX_IMAGE_SIZE_SCORE = 100_000;

function imageCandidatesFromHtml(html: string, base: URL): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  const push = (value: unknown, score: number, source: string, marker = "") => {
    for (const url of imageUrls(value, base)) {
      if (!candidates.some((candidate) => candidate.url === url) && candidates.length < 100) {
        candidates.push({ url, score: score - (imageNoise.test(marker) || imageNoise.test(url) ? IMAGE_NOISE_PENALTY : 0), source });
      }
    }
  };

  for (const product of jsonLdChildren(html)) push(product.image, IMAGE_STAGE_RANK.structured, "structured-data", cleanText(product.name) ?? "");

  const meta = metaTags(html);
  push(meta.get("og:image:secure_url"), IMAGE_STAGE_RANK.meta, "meta", meta.get("og:image:secure_url") ?? "");
  push(meta.get("og:image"), IMAGE_STAGE_RANK.meta, "meta", meta.get("og:image") ?? "");
  push(meta.get("twitter:image"), IMAGE_STAGE_RANK.meta, "meta", meta.get("twitter:image") ?? "");
  const imageLink = html.match(/<link\b([^>]*\brel\s*=\s*["'][^"']*image_src[^"']*["'][^>]*)>/i)?.[1];
  if (imageLink) push(attrsOf(imageLink).get("href"), IMAGE_STAGE_RANK.meta, "meta", imageLink);

  const images = [...html.matchAll(/<img\b([^>]*)>/gi)].map((match) => {
    const attrs = attrsOf(match[1]!);
    const marker = `${attrs.get("id") ?? ""} ${attrs.get("class") ?? ""} ${attrs.get("alt") ?? ""} ${attrs.get("src") ?? ""} ${attrs.get("data-src") ?? ""}`;
    const isAmazonPrimary = /#landingImage|#imgBlkFront/i.test(marker);
    const hasImageProp = /(?:^|\s)image(?:\s|$)/i.test(attrs.get("itemprop") ?? "");
    const sizes = imageCandidatesFromAttrs(attrs);
    return { attrs, marker, isAmazonPrimary, hasImageProp, sizes, index: match.index! };
  });

  const host = hostnameOf(base);
  const amazonPrimary = images.find(({ attrs, marker }) =>
    /(?:^|\s)(?:landingImage|imgBlkFront)(?:\s|$)/i.test(`${attrs.get("id") ?? ""} ${attrs.get("class") ?? ""} ${marker}`),
  );
  if (/amazon\./i.test(host) || amazonPrimary) {
    const landing = images.find(({ attrs }) => /landingImage/i.test(attrs.get("id") ?? "")) ?? amazonPrimary;
    const front = images.find(({ attrs }) => /imgBlkFront/i.test(attrs.get("id") ?? ""));
    for (const { attrs, sizes } of [landing, front].filter((item): item is NonNullable<typeof item> => Boolean(item))) {
      const oldHires = attrs.get("data-old-hires");
      if (oldHires) push(oldHires, IMAGE_STAGE_RANK.amazon + MAX_IMAGE_SIZE_SCORE * 2, "amazon", oldHires);
      const dynamic = sizes.filter(({ src }) => Boolean(attrs.get("data-a-dynamic-image")?.includes(src)));
      for (const candidate of dynamic.sort((a, b) => b.size - a.size)) push(candidate.src, IMAGE_STAGE_RANK.amazon + Math.min(candidate.size, MAX_IMAGE_SIZE_SCORE), "amazon", candidate.src);
    }
  }

  const productRanges: [number, number][] = [];
  for (const match of html.matchAll(/<main\b[^>]*>[\s\S]*?<\/main\s*>/gi)) productRanges.push([match.index!, match.index! + match[0].length]);
  const productContainerOpen = /<(div|section|article)\b([^>]*(?:\bid\s*=\s*["'][^"']*(?:product|pdp|listing|item-detail)[^"']*["']|\bclass\s*=\s*["'][^"']*(?:product|pdp|listing|item-detail)[^"']*["'])[^>]*)>/gi;
  for (const match of html.matchAll(productContainerOpen)) {
    const tag = match[1]!;
    const close = new RegExp(`<\\/${tag}\\s*>`, "ig");
    close.lastIndex = match.index! + match[0].length;
    const end = close.exec(html);
    if (end) productRanges.push([match.index!, end.index + end[0].length]);
  }
  const isInProductArea = (index: number) => productRanges.some(([start, end]) => index >= start && index < end);
  const genericImages: ImageCandidate[] = [];
  const hasProductAreaImages = images.some((image) => isInProductArea(image.index));
  const preferredImages = hasProductAreaImages ? images.filter((image) => isInProductArea(image.index)) : images;
  for (const { attrs, marker, hasImageProp, sizes } of preferredImages) {
    if (hasImageProp) {
      const propValue = attrs.get("content") ?? attrs.get("src") ?? attrs.get("data-src") ?? attrs.get("data-lazy-src") ?? attrs.get("href");
      if (propValue) push(propValue, IMAGE_STAGE_RANK.microdata, "microdata", marker);
    }
    const declaredWidth = Number.parseInt(attrs.get("width") ?? "0", 10);
    const declaredHeight = Number.parseInt(attrs.get("height") ?? "0", 10);
    if ((declaredWidth && declaredWidth < 200) || (declaredHeight && declaredHeight < 200)) continue;
    for (const candidate of sizes) {
      const url = imageUrl(candidate.src, base);
      if (url) genericImages.push({ url, score: IMAGE_STAGE_RANK.heuristic + Math.min(candidate.size, MAX_IMAGE_SIZE_SCORE) + (hasImageProp ? 50_000 : 0) - (imageNoise.test(marker || url) ? IMAGE_NOISE_PENALTY : 0), source: "heuristic" });
    }
  }
  genericImages.sort((a, b) => b.score - a.score);
  for (const candidate of genericImages) if (!candidates.some(({ url }) => url === candidate.url)) candidates.push(candidate);
  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_IMAGE_CANDIDATES);
}

function imageCandidatesFromAttrs(attrs: Map<string, string>): { src: string; size: number }[] {
  const candidates: { src: string; size: number }[] = [];
  const oldHires = attrs.get("data-old-hires");
  if (oldHires) candidates.push({ src: oldHires, size: Number.MAX_SAFE_INTEGER });

  // Amazon exposes its actual product images in this JSON attribute, often
  // while `src` points at a tiny placeholder or thumbnail.
  const dynamicImages = attrs.get("data-a-dynamic-image");
  if (dynamicImages) {
    try {
      const parsed: unknown = JSON.parse(dynamicImages);
      const entries = record(parsed);
      if (entries) {
        for (const [src, dimensions] of Object.entries(entries)) {
          const size = Array.isArray(dimensions) && dimensions.length >= 2
            ? Number(dimensions[0]) * Number(dimensions[1])
            : 0;
          if (Number.isFinite(size) && size > 0) candidates.push({ src, size });
        }
      }
    } catch { /* Ignore malformed image metadata and keep checking attributes. */ }
  }

  // Prefer the largest declared srcset candidate rather than its first entry.
  for (const srcset of [attrs.get("data-srcset"), attrs.get("srcset")]) {
    if (!srcset) continue;
    for (const candidate of srcset.split(",")) {
      const match = candidate.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      if (!match) continue;
      const descriptor = Number(match[2]);
      candidates.push({ src: match[1]!, size: match[3]!.toLowerCase() === "w" ? descriptor * descriptor : descriptor * 1_000_000 });
    }
  }

  const regular = attrs.get("data-old-hires") ?? attrs.get("data-src") ?? attrs.get("data-lazy-src") ?? attrs.get("data-original") ?? attrs.get("src");
  if (regular) {
    const w = Number.parseInt(attrs.get("width") ?? "0", 10);
    const h = Number.parseInt(attrs.get("height") ?? "0", 10);
    candidates.push({ src: regular, size: (w || 300) * (h || 300) });
  }
  return candidates;
}

type ProductFields = Partial<Record<UnfurlField, string>>;
type ExtractedFields = ProductFields & { isProductPage?: boolean; canonicalUrl?: string; imageCandidates?: ImageCandidate[] };

function jsonLdChildren(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const object = record(value);
    if (!object) return;
    const rawType = object["@type"];
    const types = typeof rawType === "string" ? [rawType] : Array.isArray(rawType) ? rawType : [];
    if (types.some((type) => typeof type === "string" && ["product", "productgroup"].includes(type.toLowerCase()))) found.push(object);
    for (const child of Object.values(object)) if (child && typeof child === "object") visit(child);
  };
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { visit(JSON.parse(script[1]!.replace(/^\s*<!--|-->\s*$/g, ""))); } catch { /* Ignore malformed JSON-LD. */ }
  }
  return found;
}

function offersOf(product: Record<string, unknown>) {
  const offers = product.offers ?? product.aggregateOffer;
  return (Array.isArray(offers) ? offers : [offers]).map(record).filter((value): value is Record<string, unknown> => Boolean(value));
}

function productFields(product: Record<string, unknown>, base: URL): ProductFields {
  const offer = offersOf(product).find((item) => item.price !== undefined || item.lowPrice !== undefined) ?? offersOf(product)[0];
  const brand = product.brand;
  const image = imageUrl(product.image, base);
  const name = cleanText(product.name ?? product.title);
  const description = cleanText(product.description);
  const price = offer?.price ?? offer?.lowPrice;
  const currency = cleanText(offer?.priceCurrency);
  const availability = cleanText(offer?.availability)?.split(/[\/#]/).at(-1);
  return {
    ...(name ? { title: name } : {}),
    ...(image ? { imageUrl: image } : {}),
    ...(cleanText(record(brand)?.name ?? brand) ? { siteName: cleanText(record(brand)?.name ?? brand)! } : {}),
    ...(description ? { description } : {}),
    ...(price !== undefined && price !== null ? { price: String(price) } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(availability ? { availability } : {}),
  };
}

function variantFromJsonLd(products: Record<string, unknown>[], url: URL): Record<string, unknown> | null {
  const variants = products.flatMap((product) => Array.isArray(product.hasVariant) ? product.hasVariant : product.hasVariant ? [product.hasVariant] : []).map(record).filter((v): v is Record<string, unknown> => Boolean(v));
  const requested = ["variant", "variantId", "sku", "id", "productId"].flatMap((key) => url.searchParams.getAll(key)).filter(Boolean).map((value) => value!.toLowerCase());
  return (requested.length ? variants.find((variant) => [variant.sku, variant.id, variant.productID, variant.productId, variant.url, variant["@id"]].some((value) => value !== undefined && requested.includes(String(value).toLowerCase()))) : null) ?? variants[0] ?? null;
}

function structuredFields(html: string, base: URL): ExtractedFields {
  const products = jsonLdChildren(html);
  if (!products.length) return {};
  const selected = variantFromJsonLd(products, base);
  const ordered = selected ? [selected, ...products] : products;
  const result: ExtractedFields = { isProductPage: true };
  for (const product of ordered) {
    for (const [key, value] of Object.entries(productFields(product, base))) {
      if (!result[key as UnfurlField] && value) result[key as UnfurlField] = value;
    }
  }
  const variant = selected ? cleanText(selected.name ?? selected.sku ?? selected.productID) : null;
  if (variant) result.variant = variant;
  return result;
}

function microdataFields(html: string, base: URL): ExtractedFields {
  if (!(/itemscope\b[^>]*itemtype\s*=\s*["'][^"']*product/i.test(html) || /typeof\s*=\s*["'][^"']*product/i.test(html))) return {};
  const prop = (name: string) => {
    const rx = new RegExp(`<([a-z0-9]+)\\b([^>]*(?:\\bitemprop|\\bproperty)\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'][^>]*)>([\\s\\S]*?)(?:<\\/\\1\\s*>|(?=</))`, "i");
    const match = html.match(rx);
    if (!match) return null;
    const attrs = attrsOf(match[2]!);
    return attrs.get("content") ?? attrs.get("src") ?? attrs.get("href") ?? cleanText(match[3]);
  };
  const title = prop("name"), image = prop("image"), brand = prop("brand"), price = prop("price"), currency = prop("priceCurrency");
  const safeImage = image ? imageUrl(image, base) : null;
  return {
    isProductPage: true,
    ...(title ? { title } : {}),
    ...(safeImage ? { imageUrl: safeImage } : {}),
    ...(brand ? { siteName: brand } : {}),
    ...(price ? { price } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
  };
}

function metaFields(html: string, base: URL): ExtractedFields {
  const meta = metaTags(html);
  const canonicalTag = html.match(/<link\b([^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*)>/i)?.[1];
  const canonicalUrl = canonicalTag ? attrsOf(canonicalTag).get("href") : null;
  const img = imageCandidatesFromHtml(html, base)[0]?.url ?? null;
  const title = cleanText(meta.get("og:title") ?? meta.get("twitter:title"));
  const brand = cleanText(meta.get("product:brand"));
  const site = cleanText(meta.get("og:site_name"));
  const price = cleanText(meta.get("product:price:amount") ?? meta.get("og:price:amount"));
  const currency = cleanText(meta.get("product:price:currency") ?? meta.get("og:price:currency"));
  const description = cleanText(meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"));
  return {
    ...(meta.get("og:type")?.toLowerCase().includes("product") ? { isProductPage: true } : {}),
    ...(title ? { title } : {}), ...(img ? { imageUrl: img } : {}),
    ...(brand || site ? { siteName: brand ?? site! } : {}),
    ...(price ? { price } : {}), ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(description ? { description } : {}), ...(canonicalUrl ? { canonicalUrl } : {}),
  };
}

export function extractProductMetadata(html: string, base: URL): ExtractedFields {
  // Structured data gets first claim on each field; other metadata only fills gaps.
  const output: ExtractedFields = {};
  for (const [source, fields] of [["structured", structuredFields(html, base)], ["microdata", microdataFields(html, base)], ["meta", metaFields(html, base)]] as const) {
    void source;
    for (const [key, value] of Object.entries(fields)) {
      if (key === "isProductPage") output.isProductPage ||= Boolean(value);
      else if (!output[key as keyof ExtractedFields] && value) (output as Record<string, unknown>)[key] = value;
    }
  }
  const heuristic = heuristicFields(html, base);
  for (const [key, value] of Object.entries(heuristic)) {
    if (!output[key as keyof ExtractedFields] && value) (output as Record<string, unknown>)[key] = value;
  }
  return output;
}

function embeddedFields(html: string, base: URL): ExtractedFields {
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = attrsOf(script[1]!);
    const id = attrs.get("id") ?? "";
    if (!/next_data|initial_state|product|__data|json/i.test(id) && !attrs.get("type")?.includes("json")) continue;
    try {
      const root = JSON.parse(script[2]!);
      const queue: unknown[] = [root];
      for (let count = 0; queue.length && count < 1_000; count += 1) {
        const item = queue.shift();
        if (Array.isArray(item)) { queue.push(...item); continue; }
        const object = record(item);
        if (!object) continue;
        if ((typeof object.name === "string" || typeof object.title === "string") && (object.price !== undefined || object.image || object.imageUrl || object.brand)) {
          const fields = productFields(object, base);
          const fallbackTitle = cleanText(object.name ?? object.title);
          const fallbackPrice = object.price !== undefined ? String(object.price) : null;
          const fallbackImage = imageUrl(object.imageUrl, base);
          if (!fields.title && fallbackTitle) fields.title = fallbackTitle;
          if (!fields.price && fallbackPrice) fields.price = fallbackPrice;
          if (!fields.imageUrl && fallbackImage) fields.imageUrl = fallbackImage;
          return { ...fields, isProductPage: true };
        }
        queue.push(...Object.values(object).filter((value) => value && typeof value === "object"));
      }
    } catch { /* Ignore unrelated scripts. */ }
  }
  return {};
}

function parsePrice(text: string, lang: string, url: URL): { price: string; currency: string } | null {
  const match = text.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
  const host = hostnameOf(url);
  let currency = "USD";
  if (/€/.test(text)) currency = "EUR";
  else if (/£/.test(text)) currency = "GBP";
  else if (/[¥￥]/.test(text)) currency = "JPY";
  else if (/\bCAD\b|CA\s?\$/.test(text) || host.endsWith(".ca") || /en-CA/i.test(lang)) currency = "CAD";
  else if (/\bAUD\b|AU\s?\$/.test(text) || host.endsWith(".com.au") || /en-AU/i.test(lang)) currency = "AUD";
  else if (/\b(EUR|GBP|JPY|CAD|AUD|USD)\b/i.test(text)) currency = text.match(/\b(EUR|GBP|JPY|CAD|AUD|USD)\b/i)![1]!.toUpperCase();
  return { price: String(amount), currency };
}

function heuristicFields(html: string, base: URL): ExtractedFields {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ?? html;
  const h1 = cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1] ?? "");
  const docTitle = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  const pageMeta = metaTags(html);
  const site = pageMeta.get("og:site_name") ?? pageMeta.get("product:brand") ?? storeFromHost(hostnameOf(base));
  const suffix = new RegExp(`\\s*(?:[|–—-])\\s*${site.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "i");
  const title = h1 || (docTitle ? cleanText(docTitle.replace(suffix, "")) : null);
  const image = imageCandidatesFromHtml(html, base)[0]?.url ?? null;
  let price: { price: string; currency: string } | null = null;
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)/i)?.[1] ?? "";
  for (const tag of main.matchAll(/<(span|div|p|meta|ins|strong|b)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const attrs = attrsOf(tag[2]!);
    const marker = `${attrs.get("class") ?? ""} ${attrs.get("id") ?? ""} ${attrs.get("itemprop") ?? ""}`;
    if (!/price|amount/i.test(marker) || /compare|strike|old|was-price/i.test(marker)) continue;
    const priceText = tag[3]!.replace(/<(?:del|s|strike)\b[^>]*>[\s\S]*?<\/(?:del|s|strike)\s*>/gi, " ");
    price = parsePrice(attrs.get("content") ?? cleanText(priceText) ?? "", attrs.get("lang") ?? lang, base);
    if (price) break;
  }
  return { ...(title ? { title } : {}), ...(image ? { imageUrl: image } : {}), ...(price ? price : {}) };
}

export type UnfurlDependencies = {
  lookup?: (hostname: string) => Promise<DnsAddress[]>;
  request?: (url: URL, address: ResolvedAddress, timeoutMs: number, maxBytes: number, userAgent?: string, allowJson?: boolean, headers?: Record<string, string>) => Promise<HtmlResponse>;
  timeoutMs?: number;
  maxBytes?: number;
  render?: (url: URL) => Promise<string | null | { html: string; finalUrl: string; statusCode: number | null }>;
  validateImage?: (url: string, timeoutMs?: number) => Promise<ImageValidationResponse>;
};

type PageFetch = { html: string | null; finalUrl: URL; blocked: boolean; challenge: boolean; statusCode: number | null; fetchPath: UnfurlDebug["fetchPath"]; notHtml: boolean };

async function withinTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Link preview timed out.")), Math.max(timeoutMs, 1)); })]);
  } finally { if (timer) clearTimeout(timer); }
}

function isChallengePage(html: string): boolean {
  return /checking your browser|verify you are human|captcha|attention required|cloudflare ray id|unusual traffic|robot check|access denied/i.test(html.slice(0, 30_000));
}

function isUnderfilledPage(html: string): boolean {
  return plainText(html).length < 2_000;
}

type ProbeResult = { statusCode: number; contentType: string | null; contentLength: number; location: string | null; bytesRead: number };

function probeRequest(url: URL, address: ResolvedAddress, method: "HEAD" | "GET", timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const host = hostnameOf(url);
    const lookup = ((requested: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      if (requested.toLowerCase() !== host) return callback(Object.assign(new Error("Unexpected image host lookup"), { code: "EINVAL" }), "", 0);
      callback(null, address.address, address.family);
    }) as LookupFunction;
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = transport(url, {
      method,
      agent: false,
      lookup,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8", ...(method === "GET" ? { Range: "bytes=0-8191" } : {}) },
    }, (res) => {
      const result: ProbeResult = {
        statusCode: res.statusCode ?? 0,
        contentType: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : null,
        contentLength: Number(res.headers["content-length"] ?? 0),
        location: typeof res.headers.location === "string" ? res.headers.location : null,
        bytesRead: 0,
      };
      if (method === "HEAD" || result.statusCode >= 300 && result.statusCode < 400) {
        res.destroy();
        resolve(result);
        return;
      }
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (error && result.bytesRead <= 5_000) reject(error);
        else resolve(result);
      };
      res.on("data", (chunk: Buffer | string) => {
        result.bytesRead += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
        if (result.bytesRead > 8_192) { res.destroy(); finish(); }
      });
      res.on("end", () => finish());
      res.on("error", finish);
    });
    req.on("error", reject);
    req.end();
  });
}

async function probeProductImage(rawUrl: string, lookup: NonNullable<UnfurlDependencies["lookup"]>, timeoutMs: number): Promise<ImageValidationResponse> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let current: URL;
  try { current = normalizeUnfurlUrl(rawUrl); }
  catch { return { valid: false, statusCode: 0, contentType: null, size: 0 }; }
  const visited = new Set<string>();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const key = normalizeCacheKey(current);
    if (visited.has(key)) break;
    visited.add(key);
    const host = hostnameOf(current), family = isIP(host);
    let addresses: DnsAddress[];
    try { addresses = family ? [{ address: host, family }] : await withinTimeout(lookup(host), remaining()); }
    catch { break; }
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new UnfurlSafetyError("This image host resolves to a private or reserved network address.");
    const selected = { address: addresses[0]!.address, family: addresses[0]!.family as 4 | 6 };
    let response: ProbeResult;
    try { response = await probeRequest(current, selected, "HEAD", remaining()); }
    catch { return { valid: false, statusCode: 0, contentType: null, size: 0 }; }
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      try { current = normalizeUnfurlUrl(new URL(response.location, current).toString()); } catch { break; }
      continue;
    }
    const headValid = response.statusCode === 200 && Boolean(response.contentType?.toLowerCase().startsWith("image/")) && response.contentLength > 5_000;
    if (headValid) return { valid: true, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength };
    if (Date.now() >= deadline) return { valid: false, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength };
    try { response = await probeRequest(current, selected, "GET", remaining()); }
    catch { return { valid: false, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength }; }
    const getValid = [200, 206].includes(response.statusCode) && Boolean(response.contentType?.toLowerCase().startsWith("image/")) && response.bytesRead > 5_000;
    return { valid: getValid, statusCode: response.statusCode, contentType: response.contentType, size: Math.max(response.contentLength, response.bytesRead) };
  }
  return { valid: false, statusCode: 0, contentType: null, size: 0 };
}

async function guardedFetch(rawUrl: URL, deps: Required<Pick<UnfurlDependencies, "lookup" | "request" | "timeoutMs" | "maxBytes">>, allowJson = false, requestHeaders: Record<string, string> = {}): Promise<PageFetch> {
  let current = normalizeUnfurlUrl(rawUrl.toString());
  const visited = new Set<string>();
  const deadline = Date.now() + deps.timeoutMs;
  let fetchPath: UnfurlDebug["fetchPath"] = "direct";
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const key = normalizeCacheKey(current);
    if (visited.has(key)) throw new UnfurlSafetyError("The preview URL contains a redirect loop.");
    visited.add(key);
    const host = hostnameOf(current), family = isIP(host);
    let addresses: DnsAddress[];
    try {
      const left = deadline - Date.now(); if (left <= 0) return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: null, fetchPath, notHtml: false };
      addresses = family ? [{ address: host, family }] : await withinTimeout(deps.lookup(host), left);
    } catch { return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: null, fetchPath, notHtml: false }; }
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new UnfurlSafetyError("This host resolves to a private or reserved network address.");
    const selected = addresses[0]!;
    const requestOnce = async (ua: string) => {
      const left = deadline - Date.now(); if (left <= 0) return null;
      try { return await withinTimeout(deps.request(current, { address: selected.address, family: selected.family as 4 | 6 }, left, deps.maxBytes, ua, allowJson, requestHeaders), left); }
      catch { return null; }
    };
    let response = await requestOnce(BROWSER_UA);
    if (!response) return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: null, fetchPath, notHtml: false };
    const blockedStatus = [403, 429, 503].includes(response.statusCode);
    const challengeDetected = isChallengePage(response.body);
    const underfilled = !allowJson && Boolean(response.contentType?.toLowerCase().includes("text/html")) && response.statusCode >= 200 && response.statusCode < 300 && isUnderfilledPage(response.body);
    if (blockedStatus || challengeDetected || underfilled) {
      fetchPath = "facebook-crawler";
      response = await requestOnce(FACEBOOK_CRAWLER_UA);
    }
    if (!response) return { html: null, finalUrl: current, blocked: blockedStatus || challengeDetected || underfilled, challenge: challengeDetected, statusCode: null, fetchPath, notHtml: false };
    const stillChallenge = isChallengePage(response.body);
    const stillBlocked = [403, 429, 503].includes(response.statusCode);
    const stillUnderfilled = !allowJson && Boolean(response.contentType?.toLowerCase().includes("text/html")) && response.statusCode >= 200 && response.statusCode < 300 && isUnderfilledPage(response.body);
    if (stillBlocked || stillChallenge || stillUnderfilled) return { html: response.body || null, finalUrl: current, blocked: true, challenge: stillChallenge, statusCode: response.statusCode, fetchPath, notHtml: false };
    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location) return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: response.statusCode, fetchPath, notHtml: false };
      if (redirects === MAX_REDIRECTS) throw new UnfurlSafetyError("This link redirects too many times.");
      try { current = normalizeUnfurlUrl(new URL(response.location, current).toString()); }
      catch (error) { if (error instanceof UnfurlSafetyError) throw error; throw new UnfurlSafetyError("The redirect URL is invalid."); }
      continue;
    }
    const type = response.contentType?.toLowerCase() ?? "";
    if (response.statusCode < 200 || response.statusCode >= 300 || (!type.includes("text/html") && !(allowJson && /(?:application\/(?:hal\+)?json|\+json)/i.test(type))) || Buffer.byteLength(response.body, "utf8") > deps.maxBytes) {
      return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: response.statusCode, fetchPath, notHtml: response.statusCode >= 200 && response.statusCode < 300 };
    }
    return { html: response.body, finalUrl: current, blocked: false, challenge: false, statusCode: response.statusCode, fetchPath, notHtml: false };
  }
  return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: null, fetchPath, notHtml: false };
}

export async function fetchHtml(rawUrl: string | URL, dependencies: UnfurlDependencies = {}): Promise<PageFetch> {
  const requestedUrl = normalizeUnfurlUrl(rawUrl.toString());
  const deps = {
    lookup: dependencies.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true })),
    request: dependencies.request ?? readHtml,
    timeoutMs: dependencies.timeoutMs ?? UNFURL_TIMEOUT_MS,
    maxBytes: dependencies.maxBytes ?? UNFURL_MAX_BYTES,
  };
  let page: PageFetch;
  try {
    page = await guardedFetch(requestedUrl, deps);
  } catch (error) {
    if (error instanceof UnfurlSafetyError) throw error;
    page = { html: null, finalUrl: requestedUrl, blocked: false, challenge: false, statusCode: null, fetchPath: "none", notHtml: false };
  }
  const needsRendered = page.blocked || !page.html || isUnderfilledPage(page.html);
  if (!needsRendered || !dependencies.render) return page;
  try {
    const rendered = await dependencies.render(requestedUrl);
    const renderedObject = typeof rendered === "string" ? null : rendered;
    const renderedHtml = typeof rendered === "string" ? rendered : renderedObject?.html;
    if (!renderedHtml) return page;
    const challenge = isChallengePage(renderedHtml);
    if (challenge) return { ...page, html: null, blocked: true, challenge: true, statusCode: renderedObject?.statusCode ?? page.statusCode, fetchPath: "playwright" };
    return {
      ...page,
      html: renderedHtml,
      finalUrl: renderedObject ? normalizeUnfurlUrl(renderedObject.finalUrl) : page.finalUrl,
      blocked: false,
      challenge: false,
      statusCode: renderedObject?.statusCode ?? page.statusCode,
      fetchPath: "playwright",
      notHtml: false,
    };
  } catch { return page; }
}

function reverbListingId(url: URL): string | null {
  if (!/(?:^|\.)reverb\.com$/i.test(hostnameOf(url))) return null;
  return url.pathname.match(/^\/item\/(\d+)(?:-|\/|$)/i)?.[1] ?? null;
}

function reverbListingFields(payload: Record<string, unknown>, base: URL): ExtractedFields {
  const price = record(payload.price);
  const photos = Array.isArray(payload.photos) ? payload.photos.map(record).filter((photo): photo is Record<string, unknown> => Boolean(photo)) : [];
  const images = photos.flatMap((photo) => {
    const links = record(photo._links) ?? record(photo.links);
    const ordered = ["fullsize", "large_crop", "large", "photo", "thumbnail"]
      .map((key) => record(links?.[key])?.href ?? photo[key] ?? (key === "photo" ? photo.href ?? photo.url : null))
      .filter((value): value is string => typeof value === "string");
    return ordered.map((value) => imageUrl(value, base)).filter((value): value is string => Boolean(value));
  });
  const make = cleanText(payload.make ?? payload.brand);
  const title = cleanText(payload.title ?? [make, cleanText(payload.model)].filter(Boolean).join(" "));
  const description = cleanText(payload.description);
  const shop = cleanText(payload.shop_name ?? record(payload.shop)?.name);
  const amount = cleanText(price?.amount);
  const currency = cleanText(price?.currency);
  return {
    isProductPage: true,
    ...(title ? { title } : {}),
    ...(make || shop ? { siteName: make ?? shop! } : {}),
    ...(description ? { description } : {}),
    ...(amount ? { price: amount } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(images[0] ? { imageUrl: images[0] } : {}),
    imageCandidates: images.map((url, index) => ({ url, score: 10_000_000 - index, source: "platform-reverb" })),
  };
}

async function fetchReverbFields(url: URL, deps: Required<Pick<UnfurlDependencies, "lookup" | "request" | "timeoutMs" | "maxBytes">>): Promise<ExtractedFields> {
  const id = reverbListingId(url);
  if (!id) return {};
  const apiUrl = new URL(`/api/listings/${id}`, "https://api.reverb.com");
  const headers = {
    Accept: "application/hal+json",
    "Content-Type": "application/hal+json",
    "Accept-Version": "3.0",
    ...(process.env.REVERB_API_TOKEN ? { Authorization: `Bearer ${process.env.REVERB_API_TOKEN}` } : {}),
  };
  try {
    const response = await guardedFetch(apiUrl, deps, true, headers);
    if (!response.html) return {};
    return reverbListingFields(record(JSON.parse(response.html)) ?? {}, url);
  } catch { return {}; }
}

function addFields(result: UnfurlMetadata, fields: ExtractedFields, source: string) {
  const keys: UnfurlField[] = ["title", "imageUrl", "siteName", "price", "currency", "description", "variant", "availability", "canonicalUrl"];
  for (const key of keys) {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (!result[key] || result.fieldSources[key] === "url") {
      result[key] = value.trim().slice(0, key === "description" ? 1_000 : 2_000);
      result.fieldSources[key] = source;
    }
  }
  if (fields.isProductPage) result.isProductPage = true;
}

function applyHtmlStages(result: UnfurlMetadata, html: string, base: URL, prefix = "") {
  const embedded = embeddedFields(html, base);
  addFields(result, embedded, `${prefix}platform-json`);
  const structured = structuredFields(html, base);
  for (const [key, value] of Object.entries(structured)) if (key !== "isProductPage") addFields(result, { [key]: value } as ExtractedFields, `${prefix}structured-data`);
  if (structured.isProductPage) result.isProductPage = true;
  const microdata = microdataFields(html, base);
  for (const [key, value] of Object.entries(microdata)) if (key !== "isProductPage") addFields(result, { [key]: value } as ExtractedFields, `${prefix}microdata`);
  if (microdata.isProductPage) result.isProductPage = true;
  const meta = metaFields(html, base);
  for (const [key, value] of Object.entries(meta)) {
    if (key === "isProductPage") continue;
    if (key === "canonicalUrl" && typeof value === "string") {
      try { addFields(result, { canonicalUrl: normalizeUnfurlUrl(new URL(value, base).toString()).toString() }, `${prefix}meta`); }
      catch { /* Ignore invalid canonical URLs. */ }
    } else addFields(result, { [key]: value } as ExtractedFields, `${prefix}meta`);
  }
  if (meta.isProductPage) result.isProductPage = true;
  const pathIsProduct = /\/products\/[^/]+/i.test(base.pathname);
  const shopify = /cdn\.shopify\.com|Shopify\.shop/i.test(html) || pathIsProduct;
  if (shopify && pathIsProduct) result.isProductPage = true;
  return shopify && pathIsProduct;
}

function confidenceOf(sources: Partial<Record<UnfurlField, string>>): UnfurlConfidence {
  const entries = Object.values(sources);
  if (entries.some((source) => source?.includes("structured-data") || source?.includes("microdata") || source?.startsWith("platform-") || source?.includes("shopify") || source?.includes("meta"))) return "high";
  if (entries.some((source) => source === "heuristic" || source?.includes("ai") || source?.startsWith("rendered:"))) return "medium";
  return "low";
}

export function urlFallbackMetadata(rawUrl: string): UnfurlMetadata {
  const url = normalizeUnfurlUrl(rawUrl);
  const normalizedUrl = normalizeCacheKey(url);
  const store = storeFromHost(hostnameOf(url));
  return {
    normalizedUrl,
    title: titleFromSlug(url) ?? store,
    imageUrl: null,
    siteName: store,
    price: null,
    currency: null,
    description: null,
    variant: null,
    availability: null,
    canonicalUrl: null,
    fieldSources: { title: "url", siteName: "url" },
    confidence: "low",
    reason: "no_metadata",
    isProductPage: false,
    debug: { httpStatus: null, challenge: false, finalUrl: normalizedUrl, fetchPath: "none" },
  };
}

export async function unfurlUrl(rawUrl: string, dependencies: UnfurlDependencies = {}): Promise<UnfurlMetadata> {
  const timeoutMs = dependencies.timeoutMs ?? UNFURL_TIMEOUT_MS;
  const maxBytes = dependencies.maxBytes ?? UNFURL_MAX_BYTES;
  const deps = {
    lookup: dependencies.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true })),
    request: dependencies.request ?? readHtml,
    timeoutMs, maxBytes,
  };
  const result = urlFallbackMetadata(rawUrl);
  const requestedUrl = normalizeUnfurlUrl(rawUrl);
  const page = await fetchHtml(requestedUrl, dependencies);
  result.debug = { httpStatus: page.statusCode, challenge: page.challenge, finalUrl: page.finalUrl.toString(), fetchPath: page.fetchPath };

  const platformImages: ImageCandidate[] = [];
  const reverb = await fetchReverbFields(requestedUrl, deps);
  if (reverb.imageCandidates) platformImages.push(...reverb.imageCandidates);
  addFields(result, reverb, "platform-reverb-api");

  const html = page.challenge || [403, 429, 503].includes(page.statusCode ?? -1) ? null : page.html;
  if (html) {
    const pathShopify = /\/products\/([^/?#]+)/i.test(page.finalUrl.pathname);
    const shopifyFingerprint = /cdn\.shopify\.com|Shopify\.shop/i.test(html);
    if (pathShopify || shopifyFingerprint) {
      const handle = page.finalUrl.pathname.match(/\/products\/([^/?#]+)/i)?.[1];
      if (handle) {
        const productUrl = new URL(`/products/${encodeURIComponent(handle)}.js`, page.finalUrl.origin);
        try {
          const productResponse = await guardedFetch(productUrl, deps, true);
          const product = productResponse.html ? record(JSON.parse(productResponse.html)) : null;
          if (product) {
            const variants = Array.isArray(product.variants) ? product.variants.map(record).filter((value): value is Record<string, unknown> => Boolean(value)) : [];
            const requestedVariant = page.finalUrl.searchParams.get("variant") ?? page.finalUrl.searchParams.get("sku");
            const selected = variants.find((variant) => [variant.id, variant.sku].some((id) => String(id ?? "") === requestedVariant)) ?? variants.find((variant) => variant.available === true) ?? variants[0];
            const variantImage = selected?.featured_image ?? selected?.image;
            const allImages = [variantImage, product.featured_image, ...(Array.isArray(product.images) ? product.images : [])]
              .flatMap((value) => imageUrl(value, page.finalUrl) ?? []);
            for (const [index, url] of allImages.entries()) platformImages.push({ url, score: 12_000_000 - index, source: "platform-shopify" });
            const cents = selected?.price ?? product.price;
            const fields: ExtractedFields = {
              ...(cleanText(product.title) ? { title: cleanText(product.title)! } : {}),
              ...(cleanText(product.vendor) ? { siteName: cleanText(product.vendor)! } : {}),
              ...(cleanText(product.description) ? { description: cleanText(product.description)! } : {}),
              ...(selected && cleanText(selected.title) && selected.title !== "Default Title" ? { variant: cleanText(selected.title)! } : {}),
              ...(typeof cents === "number" ? { price: String(cents / 100), currency: cleanText(product.currency)?.toUpperCase() ?? "USD" } : {}),
              ...(allImages[0] ? { imageUrl: allImages[0] } : {}),
              isProductPage: true,
            };
            addFields(result, fields, "platform-shopify");
          }
        } catch { /* The optional Shopify endpoint may be unavailable. */ }
      }
    }
    applyHtmlStages(result, html, page.finalUrl, page.fetchPath === "playwright" ? "rendered:" : "");
  }

  if (html) addFields(result, heuristicFields(html, page.finalUrl), page.fetchPath === "playwright" ? "rendered:heuristic" : "heuristic");

  const candidates = [
    ...platformImages,
    ...(html ? imageCandidatesFromHtml(html, page.finalUrl) : []),
    ...(result.imageUrl ? [{ url: result.imageUrl, score: 0, source: result.fieldSources.imageUrl ?? "metadata" }] : []),
  ].filter((candidate, index, all) => all.findIndex((other) => other.url === candidate.url) === index).slice(0, MAX_IMAGE_CANDIDATES);
  result.imageUrl = null;
  delete result.fieldSources.imageUrl;
  const validateImage = dependencies.validateImage ?? (dependencies.request
    ? async (_url: string, _budgetMs?: number): Promise<ImageValidationResponse> => ({ valid: true, statusCode: 200, contentType: "image/jpeg", size: 6_000 })
    : (url: string) => probeProductImage(url, deps.lookup, timeoutMs));
  const validationDeadline = Date.now() + IMAGE_VALIDATION_BUDGET_MS;
  for (const candidate of candidates) {
    const budgetMs = validationDeadline - Date.now();
    if (budgetMs <= 0) break;
    try {
      const checked = await withinTimeout(validateImage(candidate.url, budgetMs), budgetMs);
      if (!checked.valid) continue;
      result.imageUrl = candidate.url;
      result.fieldSources.imageUrl = candidate.source;
      break;
    } catch { /* Reject unsafe or unavailable image candidates and try the next one. */ }
  }

  result.confidence = confidenceOf(result.fieldSources);
  const hasPageFields = Object.values(result.fieldSources).some((source) => source !== "url");
  result.reason = hasPageFields ? null : page.blocked || page.challenge ? "blocked" : page.notHtml ? "not_html" : page.statusCode === null ? "timeout" : "no_metadata";
  return result;
}

export const unfurlCacheTtlMs = CACHE_TTL_MS;
