import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
const { httpsRequestMock } = vi.hoisted(() => ({ httpsRequestMock: vi.fn() }));
vi.mock("node:https", async (importOriginal) => ({ ...await importOriginal<typeof import("node:https")>(), request: httpsRequestMock }));
import { destroyRedirectResponse, extractProductMetadata, isPublicAddress, normalizeCacheKey, normalizeUnfurlUrl, unfurlUrl, UnfurlSafetyError } from "./unfurl";
const base = new URL("https://shop.example/item?variant=blue");
const json = (product: unknown) => `<script type="application/ld+json">${JSON.stringify(product)}</script>`;
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const response = (body: string, statusCode = 200, location: string | null = null) => ({ body, statusCode, location, contentType: "text/html" });
const imageValidation = async () => ({ valid: true, statusCode: 200, contentType: "image/jpeg", size: 6000 });

describe("universal previews", () => {
  it("extracts independent OG fields before JSON-LD and keeps full publisher title", () => {
    const html = `<meta property="og:title" content="Fender Bass | Reverb">${json({ "@type": "Product", name: "Bass", image: "/bass.jpg" })}`;
    expect(extractProductMetadata(html, base)).toMatchObject({ title: "Fender Bass | Reverb", imageUrl: "https://shop.example/bass.jpg" });
  });
  it("uses OG image even when the title comes from matching structured data", () => {
    expect(extractProductMetadata(`<meta property="og:image" content="/preview.jpg">${json({ "@type": "Product", name: "Blue", image: "/other.jpg" })}`, base)).toMatchObject({ title: "Blue", imageUrl: "https://shop.example/preview.jpg" });
  });
  it("handles arrays, @graph and an explicit matching offer", () => {
    const product = { "@type": "Product", url: base.toString(), name: "Blue", image: [{ contentUrl: "/blue.jpg" }], offers: { "@type": "Offer", price: "42.50", priceCurrency: "USD" } };
    expect(extractProductMetadata(json([{ "@graph": [product] }]), base)).toMatchObject({ title: "Blue", price: "42.50", currency: "USD", imageUrl: "https://shop.example/blue.jpg" });
  });
  it("omits prices with missing currency, ambiguous offers, aggregate ranges, or unrelated products", () => {
    for (const offers of [{ price: "10" }, [{ price: "10", priceCurrency: "USD" }, { price: "20", priceCurrency: "USD" }], { "@type": "AggregateOffer", lowPrice: "10", highPrice: "20", priceCurrency: "USD" }]) {
      expect(extractProductMetadata(json({ "@type": "Product", name: "Gift", offers }), base).price).toBeUndefined();
    }
    expect(extractProductMetadata(json({ "@type": "Product", url: "/other", name: "Other", offers: { price: "10", priceCurrency: "USD" } }), base).price).toBeUndefined();
    expect(extractProductMetadata(json({ "@type": "Product", url: base.toString(), offers: { price: "10", priceCurrency: "USD", itemOffered: { "@id": "/different" } } }), base).price).toBeUndefined();
  });
  it("selects the linked variant without taking another variant's price", () => {
    const variants = ["blue", "red"].map((color) => ({ "@type": "Product", url: `https://shop.example/item?variant=${color}`, name: color, offers: { price: color === "blue" ? "10" : "20", priceCurrency: "USD" } }));
    expect(extractProductMetadata(json({ "@type": "ProductGroup", hasVariant: variants }), base)).toMatchObject({ title: "blue", price: "10" });
    expect(extractProductMetadata(json({ "@type": "ProductGroup", hasVariant: variants }), new URL("https://shop.example/item")).price).toBeUndefined();
  });
  it("accepts a canonical product picture without guessing a variant-specific price", () => {
    const result = extractProductMetadata(json({ "@type": "Product", url: "https://shop.example/item", name: "Product", image: "/product.jpg", offers: { price: "10", priceCurrency: "USD" } }), base);
    expect(result).toMatchObject({ title: "Product", imageUrl: "https://shop.example/product.jpg" });
    expect(result.price).toBeUndefined();
  });
  it("uses Twitter, full document title, and hostname fallbacks", () => {
    expect(extractProductMetadata('<meta name="twitter:title" content="Tweet"><meta name="twitter:image" content="//cdn.example/photo.jpg">', base)).toMatchObject({ title: "Tweet", imageUrl: "https://cdn.example/photo.jpg" });
    expect(extractProductMetadata("<title>A story | Publisher</title>", base).title).toBe("A story | Publisher");
    expect(extractProductMetadata("", base).title).toBe("shop.example");
  });
  it("ignores malformed JSON-LD blocks independently", () => {
    expect(extractProductMetadata('<script type="application/ld+json">oops</script>' + json({ "@type": "Product", name: "Gift" }), base).title).toBe("Gift");
  });
  it("uses one general request on a Reverb-style page and has no guessed price", async () => {
    const request = vi.fn(async () => response('<meta property="og:title" content="Bass | Reverb"><meta property="og:image" content="/bass.jpg">'));
    const result = await unfurlUrl("https://reverb.com/item/123-bass", { lookup, request, validateImage: imageValidation });
    expect(result).toMatchObject({ title: "Bass | Reverb", siteName: "reverb.com", imageUrl: "https://reverb.com/bass.jpg", price: null, currency: null });
    expect(request).toHaveBeenCalledOnce();
  });
  it("keeps article previews and failed-image placeholders usable", async () => {
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response('<title>An article | Blog</title><meta property="og:image" content="/bad.jpg">'), validateImage: async () => ({ valid: false, statusCode: 403, contentType: null, size: 0 }) });
    expect(result).toMatchObject({ title: "An article | Blog", imageUrl: null, price: null, isProductPage: false });
  });
  it("resolves images against final redirected URL while preserving requested variants in cache identity", async () => {
    const result = await unfurlUrl(base.toString(), { lookup, request: async (url) => url.pathname === "/item" ? response("", 302, "https://cdn.example/path/page") : response('<meta property="og:image" content="photo.jpg"><title>Redirected</title>'), validateImage: imageValidation });
    expect(result.imageUrl).toBe("https://cdn.example/path/photo.jpg");
    expect(result.debug.finalUrl).toBe("https://cdn.example/path/page");
    expect(result.normalizedUrl).toBe(base.toString());
  });
  it("retains hostname placeholders for challenge pages and timeouts", async () => {
    const blocked = await unfurlUrl(base.toString(), { lookup, request: async () => response("Access denied captcha", 403) });
    expect(blocked).toMatchObject({ title: "shop.example", imageUrl: null, reason: "blocked" });
    const timeout = await unfurlUrl(base.toString(), { lookup, request: async () => { throw new Error("timeout"); } });
    expect(timeout).toMatchObject({ title: "shop.example", imageUrl: null, reason: "timeout" });
  });
  it("accepts a valid tiny PNG thumbnail through the real image probe", async () => {
    const thumbnail = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    expect(thumbnail.byteLength).toBeLessThan(5000);
    httpsRequestMock.mockImplementationOnce((_url, options, callback) => {
      expect(options.method).toBe("HEAD");
      const request = Object.assign(new EventEmitter(), { end: () => {
        callback(Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "image/png", "content-length": String(thumbnail.byteLength) }, destroy: vi.fn() }));
      } });
      return request;
    });
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response('<meta property="og:image" content="https://cdn.example/tiny.png"><title>Tiny thumbnail</title>') });
    expect(result.imageUrl).toBe("https://cdn.example/tiny.png");
    expect(httpsRequestMock).toHaveBeenCalledOnce();
  });
  it("uses optional generic rendered metadata for JavaScript shells", async () => {
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response("<div id='root'></div>"), render: async () => '<meta property="og:title" content="Rendered"><meta property="og:image" content="/render.jpg">', validateImage: imageValidation });
    expect(result).toMatchObject({ title: "Rendered", imageUrl: "https://shop.example/render.jpg", debug: { fetchPath: "playwright" } });
  });
});

describe("public destination safety", () => {
  it("preserves every original query parameter and fragment", () => {
    const raw = "https://shop.example/item/?variant=blue&utm_source=gift&b=2&a=1#size-large";
    expect(normalizeCacheKey(normalizeUnfurlUrl(raw))).toBe(raw);
    expect(normalizeCacheKey(normalizeUnfurlUrl(raw))).not.toBe(normalizeCacheKey(normalizeUnfurlUrl(raw.replace("blue", "red"))));
  });
  it("destroys redirect response bodies", () => { const destroy = vi.fn(); destroyRedirectResponse({ destroy }); expect(destroy).toHaveBeenCalledOnce(); });
  it.each(["0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.20", "198.18.0.1", "203.0.113.10", "224.0.0.1", "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2001:2::1", "3fff::1", "5f00::1", "2002:7f00:1::1"])("blocks %s", (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (address) => expect(isPublicAddress(address)).toBe(true));
  it.each(["ftp://example.com", "http://localhost", "http://127.0.0.1", "https://user:password@example.com", "https://example.com:8443"])("rejects %s", (url) => expect(() => normalizeUnfurlUrl(url)).toThrow(UnfurlSafetyError));
  it("rejects mixed public and private DNS answers", async () => {
    await expect(unfurlUrl(base.toString(), { lookup: async () => [...await lookup(), { address: "192.168.1.20", family: 4 }], request: vi.fn() })).rejects.toThrow(/private or reserved/);
  });
  it("rejects private redirect targets before connecting", async () => {
    const request = vi.fn(async () => response("", 302, "http://127.0.0.1/admin"));
    await expect(unfurlUrl(base.toString(), { lookup, request })).rejects.toThrow(/Private or reserved/);
    expect(request).toHaveBeenCalledOnce();
  });
  it("caps redirects at five", async () => {
    const request = vi.fn(async (url: URL) => response("", 302, `/step${url.pathname}`));
    await expect(unfurlUrl(base.toString(), { lookup, request })).rejects.toThrow(/redirects too many/);
    expect(request).toHaveBeenCalledTimes(6);
  });
});
