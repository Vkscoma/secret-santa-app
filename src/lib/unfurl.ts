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
  truncated?: boolean;
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
  truncated?: boolean;
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
  url.hostname = hostname;
  return url;
}

export function normalizeCacheKey(url: URL): string {
  return url.toString();
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
      family: pinned.family,
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
      const chunks: Buffer[] = [];
      let total = 0;
      const finish = (truncated = false) => {
        const body = new TextDecoder().decode(Buffer.concat(chunks), { stream: truncated });
        resolve({ statusCode, location, contentType, body: truncated ? dropPartialTrailingTag(body) : body, truncated });
      };
      res.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = maxBytes - total;
        chunks.push(bytes.subarray(0, Math.max(0, remaining)));
        total += Math.min(bytes.length, Math.max(0, remaining));
        if (total >= maxBytes) {
          // Keep useful metadata in the bounded prefix instead of discarding a large page.
          finish(true);
          res.destroy();
        }
      });
      res.on("end", () => finish());
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

function imageUrls(value: unknown, base: URL): string[] {
  const resolvedUrls: string[] = [];
  for (const candidate of Array.isArray(value) ? value : [value]) {
    const object = record(candidate);
    const raw = typeof candidate === "string" ? candidate : object?.url ?? object?.contentUrl ?? object?.["@id"];
    if (typeof raw !== "string") continue;
    try {
      const resolved = new URL(raw, base);
      resolved.hash = "";
      const normalized = normalizeUnfurlUrl(resolved.toString()).toString().slice(0, 2_000);
      if (!resolvedUrls.includes(normalized)) resolvedUrls.push(normalized);
    }
    catch { /* Try the next available image. */ }
  }
  return resolvedUrls;
}

type ExtractedFields = Partial<Record<UnfurlField, string>> & { isProductPage?: boolean };
type PreviewFields = { fields: ExtractedFields; sources: Partial<Record<UnfurlField, string>>; images: { url: string; source: string }[] };
const IMAGE_VALIDATION_BUDGET_MS = 4_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function jsonLdProducts(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const object = record(value);
    if (!object) return;
    const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
    if (types.some((type) => typeof type === "string" && /(?:^|[/#])Product(?:Group)?$/i.test(type))) found.push(object);
    for (const child of Object.values(object)) if (child && typeof child === "object") visit(child);
  };
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { visit(JSON.parse(script[1]!.replace(/^\s*<!--|-->\s*$/g, ""))); } catch { /* Each block is independent. */ }
  }
  return found;
}

function identityUrls(object: Record<string, unknown>, base: URL): URL[] {
  return [object.url, object["@id"]].flatMap((value) => {
    const raw = typeof value === "string" ? value : record(value)?.["@id"];
    if (typeof raw !== "string") return [];
    try { return [new URL(raw, base)]; } catch { return []; }
  });
}

function matchesPage(candidate: URL, pages: URL[]): boolean {
  return pages.some((page) => {
    if (candidate.origin !== page.origin || candidate.pathname !== page.pathname || candidate.search !== page.search) return false;
    // JSON-LD commonly identifies the page's product using a local #product ID.
    return candidate.hash === page.hash || !page.hash && /^(?:#product|#\/schema\/product\/[^/]*)?$/i.test(candidate.hash);
  });
}

function matchingProduct(products: Record<string, unknown>[], base: URL, requested: URL): Record<string, unknown> | null {
  const pages = [base, requested];
  const matches = products.filter((product) => identityUrls(product, base).some((url) => matchesPage(url, pages)));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    const leaves = matches.filter((product) => !product.hasVariant);
    return leaves.length === 1 ? leaves[0]! : null;
  }
  // A lone product's canonical URL often omits incoming parameters. Its title
  // and picture can describe this page, but its price needs stricter matching.
  if (products.length === 1) {
    const identities = identityUrls(products[0]!, base);
    if (!identities.length || identities.some((url) => pages.some((page) => url.origin === page.origin && url.pathname === page.pathname))) return products[0]!;
  }
  return null;
}

function productOffer(product: Record<string, unknown>, base: URL, requested: URL): Record<string, unknown> | null {
  if (product.hasVariant) return null;
  const pricePages = requested.origin === base.origin && requested.pathname === base.pathname && requested.search !== base.search ? [requested] : [base, requested];
  const offers = (Array.isArray(product.offers) ? product.offers : [product.offers]).map(record).filter((offer): offer is Record<string, unknown> => Boolean(offer));
  const valid = offers.filter((offer) => {
    const offeredItem = record(offer.itemOffered);
    const offeredUrls = offeredItem ? identityUrls(offeredItem, base) : typeof offer.itemOffered === "string" ? identityUrls({ "@id": offer.itemOffered }, base) : [];
    if (offeredUrls.length && !offeredUrls.some((url) => matchesPage(url, pricePages))) return false;
    const type = offer["@type"];
    if (type && !(Array.isArray(type) ? type : [type]).some((value) => typeof value === "string" && /(?:^|[/#])Offer$/i.test(value))) return false;
    const amount = typeof offer.price === "number" ? offer.price : typeof offer.price === "string" && /^\d+(?:\.\d+)?$/.test(offer.price.trim()) ? Number(offer.price) : NaN;
    return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000 && typeof offer.priceCurrency === "string" && /^[A-Z]{3}$/i.test(offer.priceCurrency.trim());
  });
  const matching = valid.filter((offer) => identityUrls(offer, base).some((url) => matchesPage(url, pricePages)));
  if (matching.length === 1) return matching[0]!;
  const productUrls = identityUrls(product, base);
  if (productUrls.length && !productUrls.some((url) => matchesPage(url, pricePages))) return null;
  if (offers.length !== 1 || valid.length !== 1) return null;
  const urls = identityUrls(valid[0]!, base);
  return !urls.length || urls.some((url) => matchesPage(url, pricePages)) ? valid[0]! : null;
}

/** Generic semantic fallback for pages that publish no social/structured picture. */
function htmlImageCandidates(html: string, base: URL, title: string | undefined): { url: string; source: string }[] {
  const content = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(/<(?:script|style)\b[^>]*>[\s\S]*$/gi, " ");
  const main = content.match(/<main\b[^>]*>([\s\S]*?)(?:<\/main\s*>|$)/i);
  const mainStart = main?.index ?? -1, mainEnd = mainStart + (main?.[0].length ?? 0);
  const tokens = (value: string) => new Set((plainText(value).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((word) => !["the", "and", "for", "with", "from", "image", "photo", "picture", "product"].includes(word)));
  const titleWords = tokens(title ?? "");
  const candidates: { url: string; score: number; source: string }[] = [];
  let inspected = 0;
  for (const tag of content.matchAll(/<(?:img|meta|link)\b([^>]+)>/gi)) {
    if (++inspected > 2_000) break;
    const attrs = attrsOf(tag[1]!);
    const semantic = /(?:^|\s)image(?:\s|$)/i.test(attrs.get("itemprop") ?? "") || attrs.get("rel")?.toLowerCase() === "image_src";
    const alt = tokens(attrs.get("alt") ?? "");
    const overlap = [...alt].filter((word) => titleWords.has(word)).length;
    const width = Number.parseFloat(attrs.get("width") ?? "0"), height = Number.parseFloat(attrs.get("height") ?? "0");
    const relevant = overlap / Math.max(alt.size, 1) >= 0.7 && (overlap >= 4 || overlap >= 2 && width >= 200 && height >= 200);
    const inMain = mainStart >= 0 && tag.index >= mainStart && tag.index < mainEnd;
    if (!semantic && !relevant && !inMain) continue;
    if (!semantic && ((width > 0 && width < 200) || (height > 0 && height < 200))) continue;
    const sources = [attrs.get("content"), attrs.get("href"), attrs.get("data-src"), attrs.get("data-lazy-src"), attrs.get("src")].filter((value): value is string => Boolean(value));
    for (const entry of (attrs.get("srcset") ?? attrs.get("data-srcset") ?? "").split(",")) {
      const src = entry.trim().split(/\s+/)[0]; if (src) sources.push(src);
    }
    for (const raw of sources) {
      if (/logo|icon|sprite|badge|avatar|placeholder|(?:grey[-_]?pixel|transparent|spacer)\./i.test(`${raw} ${attrs.get("alt") ?? ""}`)) continue;
      for (const url of imageUrls(raw, base)) candidates.push({ url, source: semantic ? "microdata" : "html-image", score: (semantic ? 10_000 : relevant ? 5_000 + overlap : 1_000) + Math.min(width * height / 1_000_000, 100) });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).filter((candidate, index, all) => all.findIndex((other) => other.url === candidate.url) === index).slice(0, 6);
}

function previewFields(html: string, base: URL, requested = base): PreviewFields {
  const meta = metaTags(html);
  const product = matchingProduct(jsonLdProducts(html), base, requested);
  const fields: ExtractedFields = { siteName: hostnameOf(requested).replace(/^www\./, ""), isProductPage: Boolean(product) };
  const sources: Partial<Record<UnfurlField, string>> = { siteName: "url" };
  const set = (key: UnfurlField, value: unknown, source: string) => {
    const text = cleanText(value);
    if (!fields[key] && text) { fields[key] = text; sources[key] = source; }
  };
  set("title", meta.get("og:title"), "open-graph");
  if (product) set("title", product.name, "structured-data");
  set("title", meta.get("twitter:title"), "twitter");
  set("title", html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1], "html-title");
  set("title", hostnameOf(requested).replace(/^www\./, ""), "url");
  const images = [
    ...imageUrls(meta.get("og:image:secure_url"), base).map((url) => ({ url, source: "open-graph" })),
    ...imageUrls(meta.get("og:image"), base).map((url) => ({ url, source: "open-graph" })),
    ...(product ? imageUrls(product.image, base).map((url) => ({ url, source: "structured-data" })) : []),
    ...imageUrls(meta.get("twitter:image") ?? meta.get("twitter:image:src"), base).map((url) => ({ url, source: "twitter" })),
    ...htmlImageCandidates(html, base, fields.title),
  ].filter((candidate, index, all) => all.findIndex((other) => other.url === candidate.url) === index).slice(0, 10);
  if (images[0]) { fields.imageUrl = images[0].url; sources.imageUrl = images[0].source; }
  set("description", meta.get("og:description") ?? product?.description ?? meta.get("twitter:description"), "metadata");
  if (product) {
    const offer = productOffer(product, base, requested);
    if (offer) {
      fields.price = String(offer.price).trim(); fields.currency = String(offer.priceCurrency).trim().toUpperCase();
      sources.price = sources.currency = "structured-data";
      set("availability", offer.availability, "structured-data");
    }
  }
  return { fields, sources, images };
}

export function extractProductMetadata(html: string, base: URL): ExtractedFields {
  return previewFields(html, base).fields;
}

export type UnfurlDependencies = {
  lookup?: (hostname: string) => Promise<DnsAddress[]>;
  request?: (url: URL, address: ResolvedAddress, timeoutMs: number, maxBytes: number, userAgent?: string, allowJson?: boolean, headers?: Record<string, string>) => Promise<HtmlResponse>;
  timeoutMs?: number;
  maxBytes?: number;
  render?: (url: URL) => Promise<string | null | { html: string; finalUrl: string; statusCode: number | null; truncated?: boolean }>;
  validateImage?: (url: string, timeoutMs?: number) => Promise<ImageValidationResponse>;
};

type PageFetch = { html: string | null; finalUrl: URL; blocked: boolean; challenge: boolean; statusCode: number | null; fetchPath: UnfurlDebug["fetchPath"]; notHtml: boolean; truncated?: boolean };

async function withinTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Link preview timed out.")), Math.max(timeoutMs, 1)); })]);
  } finally { if (timer) clearTimeout(timer); }
}

const CHALLENGE_MARKERS = /checking your browser|verify you are human|captcha|attention required|cloudflare ray id|unusual traffic|robot check|access denied/i;
// Bot interstitials do not carry a page's own social or structured metadata.
const PREVIEW_METADATA = /<meta\b[^>]*(?:og:title|og:image|twitter:title|twitter:image)|application\/ld\+json/i;
// Inline script/style bodies are code, not page copy: storefronts routinely
// mention form fields such as "h-captcha-response" there. Opening tags and
// their attributes (e.g. id="px-captcha", a captcha script src) are kept.
const INLINE_CODE_BODIES = /(<(script|style)\b[^>]*>)[\s\S]*?(?:<\/\2\s*>|$)/gi;

/**
 * A challenge marker only counts when the page lacks its own preview metadata:
 * real product pages routinely load reCAPTCHA scripts or mention captcha form
 * fields, while interstitials (Cloudflare, Akamai, PerimeterX) carry none.
 */
function isChallengePage(html: string): boolean {
  return CHALLENGE_MARKERS.test(html.slice(0, 30_000).replace(INLINE_CODE_BODIES, "$1")) && !PREVIEW_METADATA.test(html);
}

/** Drop a tag left open by a byte cut so downstream regex parsers never see a half attribute. */
function dropPartialTrailingTag(html: string): string {
  const open = html.lastIndexOf("<");
  return open > html.lastIndexOf(">") ? html.slice(0, open) : html;
}

/**
 * Bound HTML to `maxBytes` of UTF-8. The cut never splits a multi-byte
 * character (the streaming decoder holds back an incomplete sequence) and never
 * leaves a partial trailing tag.
 */
export function truncateHtmlToBytes(html: string, maxBytes: number): { html: string; truncated: boolean } {
  const bytes = Buffer.from(html, "utf8");
  if (bytes.byteLength <= maxBytes) return { html, truncated: false };
  const prefix = new TextDecoder().decode(bytes.subarray(0, maxBytes), { stream: true });
  return { html: dropPartialTrailingTag(prefix), truncated: true };
}

// Only a title with text counts: script-only interstitials ship an empty <title></title>.
function isUnderfilledPage(html: string): boolean {
  return plainText(html).length < 2_000 && !/<meta\b[^>]*(?:og:title|og:image|twitter:title)|<title\b[^>]*>\s*[^<\s]|application\/ld\+json/i.test(html);
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
      family: address.family,
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
        if (error && result.bytesRead === 0) reject(error);
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
    if (response.contentLength > MAX_IMAGE_BYTES) return { valid: false, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength };
    const headValid = response.statusCode === 200 && Boolean(response.contentType?.toLowerCase().startsWith("image/")) && response.contentLength > 0 && response.contentLength <= MAX_IMAGE_BYTES;
    if (headValid) return { valid: true, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength };
    if (Date.now() >= deadline) return { valid: false, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength };
    try { response = await probeRequest(current, selected, "GET", remaining()); }
    catch { return { valid: false, statusCode: response.statusCode, contentType: response.contentType, size: response.contentLength }; }
    const getValid = [200, 206].includes(response.statusCode) && Boolean(response.contentType?.toLowerCase().startsWith("image/")) && response.bytesRead > 0 && response.contentLength <= MAX_IMAGE_BYTES;
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
    if (!response) return { html: null, finalUrl: current, blocked: blockedStatus || challengeDetected, challenge: challengeDetected, statusCode: null, fetchPath, notHtml: false };
    const stillChallenge = isChallengePage(response.body);
    const stillBlocked = [403, 429, 503].includes(response.statusCode);
    const stillUnderfilled = !allowJson && Boolean(response.contentType?.toLowerCase().includes("text/html")) && response.statusCode >= 200 && response.statusCode < 300 && isUnderfilledPage(response.body);
    if (stillBlocked || stillChallenge || stillUnderfilled) return { html: response.body || null, finalUrl: current, blocked: stillBlocked || stillChallenge, challenge: stillChallenge, statusCode: response.statusCode, fetchPath, notHtml: false, truncated: response.truncated ?? false };
    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location) return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: response.statusCode, fetchPath, notHtml: false, truncated: response.truncated ?? false };
      if (redirects === MAX_REDIRECTS) throw new UnfurlSafetyError("This link redirects too many times.");
      try { current = normalizeUnfurlUrl(new URL(response.location, current).toString()); }
      catch (error) { if (error instanceof UnfurlSafetyError) throw error; throw new UnfurlSafetyError("The redirect URL is invalid."); }
      continue;
    }
    const type = response.contentType?.toLowerCase() ?? "";
    if (response.statusCode < 200 || response.statusCode >= 300 || (!type.includes("text/html") && !(allowJson && /(?:application\/(?:hal\+)?json|\+json)/i.test(type))) || Buffer.byteLength(response.body, "utf8") > deps.maxBytes) {
      return { html: null, finalUrl: current, blocked: false, challenge: false, statusCode: response.statusCode, fetchPath, notHtml: response.statusCode >= 200 && response.statusCode < 300 };
    }
    return { html: response.body, finalUrl: current, blocked: false, challenge: false, statusCode: response.statusCode, fetchPath, notHtml: false, truncated: response.truncated ?? false };
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
    const rendered = await withinTimeout(dependencies.render(requestedUrl), 20_000);
    const renderedObject = typeof rendered === "string" ? null : rendered;
    const renderedHtml = typeof rendered === "string" ? rendered : renderedObject?.html;
    if (!renderedHtml) return page;
    // Oversized renders keep their bounded prefix: metadata lives in <head>.
    const bounded = truncateHtmlToBytes(renderedHtml, deps.maxBytes);
    const challenge = isChallengePage(bounded.html);
    const statusCode = renderedObject?.statusCode ?? page.statusCode;
    if (challenge) return { ...page, html: null, blocked: true, challenge: true, statusCode, fetchPath: "playwright" };
    return {
      ...page,
      html: bounded.html,
      finalUrl: renderedObject ? normalizeUnfurlUrl(renderedObject.finalUrl) : page.finalUrl,
      // unfurlUrl discards HTML served with these statuses, so report the block rather than "no metadata".
      blocked: [403, 429, 503].includes(statusCode ?? -1),
      challenge: false,
      statusCode,
      fetchPath: "playwright",
      notHtml: false,
      // Price uniqueness cannot be trusted when markup was omitted (see unfurlUrl).
      truncated: bounded.truncated || (renderedObject?.truncated ?? false),
    };
  } catch { return page; }
}

export function urlFallbackMetadata(rawUrl: string): UnfurlMetadata {
  const url = normalizeUnfurlUrl(rawUrl);
  const hostname = hostnameOf(url).replace(/^www\./, "");
  return {
    normalizedUrl: normalizeCacheKey(url), title: hostname, imageUrl: null, siteName: hostname,
    price: null, currency: null, description: null, variant: null, availability: null,
    canonicalUrl: null, fieldSources: { title: "url", siteName: "url" }, confidence: "low",
    reason: "no_metadata", isProductPage: false,
    debug: { httpStatus: null, challenge: false, finalUrl: url.toString(), fetchPath: "none" },
  };
}

export async function unfurlUrl(rawUrl: string, dependencies: UnfurlDependencies = {}): Promise<UnfurlMetadata> {
  const result = urlFallbackMetadata(rawUrl);
  const requestedUrl = normalizeUnfurlUrl(rawUrl);
  const page = await fetchHtml(requestedUrl, dependencies);
  result.debug = { httpStatus: page.statusCode, challenge: page.challenge, finalUrl: page.finalUrl.toString(), fetchPath: page.fetchPath, truncated: page.truncated ?? false };
  const html = page.challenge || [403, 429, 503].includes(page.statusCode ?? -1) ? null : page.html;
  if (html) {
    const preview = previewFields(html, page.finalUrl, requestedUrl);
    Object.assign(result, preview.fields);
    result.fieldSources = preview.sources;
    if (page.truncated) {
      // Omitted markup might contain other variants/offers; do not infer price uniqueness.
      result.price = null; result.currency = null;
      delete result.fieldSources.price; delete result.fieldSources.currency;
    }
    result.imageUrl = null;
    delete result.fieldSources.imageUrl;
    const lookup = dependencies.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
    const validate = dependencies.validateImage ?? ((url: string, budgetMs?: number) => probeProductImage(url, lookup, budgetMs ?? IMAGE_VALIDATION_BUDGET_MS));
    const deadline = Date.now() + IMAGE_VALIDATION_BUDGET_MS;
    for (const candidate of preview.images) {
      const budget = deadline - Date.now();
      if (budget <= 0) break;
      try {
        if (!(await withinTimeout(validate(candidate.url, budget), budget)).valid) continue;
        result.imageUrl = candidate.url;
        result.fieldSources.imageUrl = candidate.source;
        break;
      } catch { /* An unavailable image must never prevent saving the link. */ }
    }
  }
  const hasPageFields = Object.values(result.fieldSources).some((source) => source !== "url");
  result.confidence = hasPageFields ? "high" : "low";
  result.reason = hasPageFields ? null : page.blocked || page.challenge ? "blocked" : page.notHtml ? "not_html" : page.statusCode === null ? "timeout" : "no_metadata";
  return result;
}

export const unfurlCacheTtlMs = CACHE_TTL_MS;

/** Raw transports exposed only for deterministic native socket regression tests. */
export const unfurlTransportInternals = { readHtml, probeRequest };
