import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
const { httpsRequestMock } = vi.hoisted(() => ({ httpsRequestMock: vi.fn() }));
vi.mock("node:https", async (importOriginal) => ({ ...await importOriginal<typeof import("node:https")>(), request: httpsRequestMock }));
import { destroyRedirectResponse, extractProductMetadata, isPublicAddress, normalizeCacheKey, normalizeUnfurlUrl, truncateHtmlToBytes, unfurlUrl, UnfurlSafetyError } from "./unfurl";
const base = new URL("https://shop.example/item?variant=blue");
const json = (product: unknown) => `<script type="application/ld+json">${JSON.stringify(product)}</script>`;
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const response = (body: string, statusCode = 200, location: string | null = null) => ({ body, statusCode, location, contentType: "text/html" });
const imageValidation = async () => ({ valid: true, statusCode: 200, contentType: "image/jpeg", size: 6000 });

describe("universal previews", () => {
  it("finds a title-matching product picture without social metadata on any hostname", () => {
    const html = `<title>Store: Interactive Talking Space Ranger Action Figure | Toys</title>
      <img src="/logo.png" alt="Store logo" width="400" height="400">
      <img src="/wrong.jpg" alt="Unrelated popular gift" width="800" height="800">
      <img src="/ranger.jpg" alt="Interactive Talking Space Ranger Action Figure">
      <img data-src="/ranger-story.jpg" src="/grey-pixel.gif" alt="Interactive Talking Space Ranger Action Figure">`;
    expect(extractProductMetadata(html, base)).toMatchObject({ imageUrl: "https://shop.example/ranger.jpg", title: "Store: Interactive Talking Space Ranger Action Figure | Toys" });
  });
  it("matches short product names outside main only when the image has suitable declared dimensions", () => {
    expect(extractProductMetadata('<title>Red Mug</title><img src="/mug.jpg" alt="Red Mug" width="600" height="600">', base).imageUrl).toBe("https://shop.example/mug.jpg");
    expect(extractProductMetadata('<title>Red Mug</title><img src="/mug.jpg" alt="Red Mug">', base).imageUrl).toBeUndefined();
  });
  it("uses generic itemprop, lazy main pictures, and link image_src after explicit metadata", () => {
    expect(extractProductMetadata('<title>Gift</title><meta itemprop="image" content="/product.jpg">', base).imageUrl).toBe("https://shop.example/product.jpg");
    expect(extractProductMetadata('<title>Gift</title><main><img src="/logo.jpg" alt="Logo"><img data-lazy-src="/lazy.jpg" width="600" height="600"></main>', base).imageUrl).toBe("https://shop.example/lazy.jpg");
    expect(extractProductMetadata('<title>Gift</title><link rel="image_src" href="/linked.jpg">', base).imageUrl).toBe("https://shop.example/linked.jpg");
    expect(extractProductMetadata('<meta property="og:image" content="/og.jpg"><main><img src="/main.jpg" width="800"></main>', base).imageUrl).toBe("https://shop.example/og.jpg");
  });
  it("does not mistake images inside scripts or tiny unrelated thumbnails for product pictures", () => {
    const html = `<title>Interactive Talking Space Ranger Action Figure</title><script>const fake='<img src="/fake.jpg" alt="Interactive Talking Space Ranger Action Figure">';</script><main><img src="/small.jpg" width="40" height="40"></main>`;
    expect(extractProductMetadata(html, base).imageUrl).toBeUndefined();
  });
  it("classifies a sparse successful page as no_metadata rather than blocked", async () => {
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response("<html><body>Hi</body></html>") });
    expect(result.reason).toBe("no_metadata"); expect(result.debug.httpStatus).toBe(200);
  });
  it("omits potentially ambiguous prices from a truncated page while retaining title and picture", async () => {
    const html = json({ "@type": "Product", name: "Ranger", image: "/gift.jpg", offers: { price: "25", priceCurrency: "USD" } });
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => ({ ...response(html), truncated: true }), validateImage: imageValidation });
    expect(result.title).toBe("Ranger"); expect(result.imageUrl).toBe("https://shop.example/gift.jpg");
    expect(result.price).toBeNull(); expect(result.currency).toBeNull();
    expect(result.fieldSources.price).toBeUndefined(); expect(result.debug.truncated).toBe(true);
  });
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
  it("truncates on a UTF-8 boundary and drops a partial trailing tag", () => {
    expect(truncateHtmlToBytes("<p>ok</p>", 100)).toEqual({ html: "<p>ok</p>", truncated: false });
    // "é" is two bytes; a 4-byte cut lands inside it.
    expect(truncateHtmlToBytes("<b>é</b>", 4)).toEqual({ html: "<b>", truncated: true });
    expect(truncateHtmlToBytes('<title>T</title><meta property="og:image" content="/cut.jpg">', 40)).toEqual({ html: "<title>T</title>", truncated: true });
  });
  it("keeps the bounded prefix of an oversized render and treats it as truncated", async () => {
    const head = `<meta property="og:title" content="Big Page"><meta property="og:image" content="/big.jpg">${json({ "@type": "Product", url: base.toString(), name: "Big", offers: { price: "10", priceCurrency: "USD" } })}`;
    const rendered = head + `<main>${"x".repeat(5_000)}</main>`;
    const result = await unfurlUrl(base.toString(), { lookup, maxBytes: 1_000, request: async () => response("", 403), render: async () => ({ html: rendered, finalUrl: base.toString(), statusCode: 200 }), validateImage: imageValidation });
    expect(result).toMatchObject({ title: "Big Page", imageUrl: "https://shop.example/big.jpg", price: null, currency: null, reason: null, debug: { fetchPath: "playwright", truncated: true } });
  });
  it("carries a renderer's own truncated flag through to price suppression", async () => {
    const html = `<meta property="og:title" content="Partial">${json({ "@type": "Product", url: base.toString(), name: "Partial", offers: { price: "10", priceCurrency: "USD" } })}`;
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response("", 403), render: async () => ({ html, finalUrl: base.toString(), statusCode: 200, truncated: true }) });
    expect(result).toMatchObject({ title: "Partial", price: null, debug: { truncated: true } });
  });
  it("reports a store that also refuses the real browser as blocked", async () => {
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response("", 403), render: async () => ({ html: "<title>Error</title><p>Forbidden</p>", finalUrl: base.toString(), statusCode: 403 }) });
    expect(result).toMatchObject({ title: "shop.example", reason: "blocked", debug: { fetchPath: "playwright", httpStatus: 403 } });
  });
  it("renders a script-only interstitial whose title is empty", async () => {
    const interstitial = `<!doctype html><html><head><title></title><style>body{margin:0}</style></head><body><script>${"var a=1;".repeat(500)}</script></body></html>`;
    const render = vi.fn(async () => ({ html: '<meta property="og:title" content="Slipper"><meta property="og:image" content="/slipper.jpg">', finalUrl: base.toString(), statusCode: 200 }));
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response(interstitial), render, validateImage: imageValidation });
    expect(render).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ title: "Slipper", imageUrl: "https://shop.example/slipper.jpg", reason: null, debug: { fetchPath: "playwright" } });
  });
  it("keeps a short page with a real title on the direct path", async () => {
    const render = vi.fn(async () => null);
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response("<title>A short note | Blog</title><p>Hi</p>"), render });
    expect(render).not.toHaveBeenCalled();
    expect(result).toMatchObject({ title: "A short note | Blog", debug: { fetchPath: "direct" } });
  });
  it("does not treat a product page that loads reCAPTCHA as a challenge", async () => {
    const html = '<meta property="og:title" content="Espresso Machine"><meta property="og:image" content="/espresso.jpg"><script src="https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js"></script>';
    const result = await unfurlUrl(base.toString(), { lookup, request: async () => response("", 403), render: async () => ({ html, finalUrl: base.toString(), statusCode: 200 }), validateImage: imageValidation });
    expect(result).toMatchObject({ title: "Espresso Machine", imageUrl: "https://shop.example/espresso.jpg", reason: null, debug: { challenge: false } });
  });
  it("ignores challenge words inside inline scripts but still flags challenge markup", async () => {
    const storefront = `<title>Girly Ghoul | Shop</title><script>const c=['g-recaptcha-response','h-captcha-response'];</script><style>.captcha{}</style><meta property="og:image" content="/ghoul.jpg">`;
    const allowed = await unfurlUrl(base.toString(), { lookup, request: async () => response(storefront), validateImage: imageValidation });
    expect(allowed).toMatchObject({ title: "Girly Ghoul | Shop", imageUrl: "https://shop.example/ghoul.jpg", reason: null, debug: { challenge: false } });
    const challenge = await unfurlUrl(base.toString(), { lookup, request: async () => response('<title>Shop</title><div id="px-captcha"></div><script src="https://captcha.example/c.js"></script>'), render: async () => null });
    expect(challenge).toMatchObject({ imageUrl: null, reason: "blocked", debug: { challenge: true } });
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
