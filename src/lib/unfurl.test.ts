import { describe, expect, it, vi } from "vitest";
import {
  extractProductMetadata,
  destroyRedirectResponse,
  isPublicAddress,
  normalizeCacheKey,
  normalizeUnfurlUrl,
  UNFURL_MAX_BYTES,
  UNFURL_TIMEOUT_MS,
  UnfurlSafetyError,
  unfurlUrl,
} from "./unfurl";

describe("unfurl URL guards", () => {
  it("destroys redirect responses instead of consuming their bodies", () => {
    const response = { destroy: vi.fn() };
    destroyRedirectResponse(response);
    expect(response.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.20.0.1", "192.168.1.1", "198.18.0.1", "203.0.113.10", "224.0.0.1",
    "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2001:2::1",
    "3fff::1", "5f00::1", "2002:7f00:1::1",
  ])("blocks non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "ftp://example.com/book", "http://localhost/admin", "https://api.localhost/", "http://127.0.0.1/",
    "https://user:password@example.com/", "https://example.com:8443/",
  ])("rejects unsafe URL %s", (value) => {
    expect(() => normalizeUnfurlUrl(value)).toThrow(UnfurlSafetyError);
  });

  it("normalizes tracking parameters, fragments, default ports, and query order for cache keys", () => {
    const first = normalizeUnfurlUrl("HTTPS://Shop.Example:443/item/?utm_source=mail&b=2&a=1#details");
    const second = normalizeUnfurlUrl("https://shop.example/item?a=1&b=2");
    expect(normalizeCacheKey(first)).toBe("https://shop.example/item?a=1&b=2");
    expect(normalizeCacheKey(first)).toBe(normalizeCacheKey(second));
  });

  it("rejects a hostname if any DNS answer points at a private network", async () => {
    await expect(unfurlUrl("https://shop.example", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.20", family: 4 },
      ],
      request: vi.fn(),
    })).rejects.toThrow(/private or reserved/);
  });
});

describe("metadata extraction", () => {
  it("prefers JSON-LD Product.name, then Open Graph, Twitter, and title", () => {
    const html = `<html><head>
      <title>Document title</title><meta name="twitter:title" content="Twitter title">
      <meta property="og:title" content="Open Graph title">
      <script type="application/ld+json">{"@type":"Product","name":"JSON &amp; JSON-LD","description":"Blue, medium","offers":{"price":"42.50","priceCurrency":"USD"},"image":{"url":"/item.jpg"}}</script>
      <meta property="og:site_name" content="Shop &amp; Co">
    </head></html>`;
    expect(extractProductMetadata(html, new URL("https://shop.example/item"))).toMatchObject({
      title: "JSON & JSON-LD",
      imageUrl: "https://shop.example/item.jpg",
      siteName: "Shop & Co",
      price: "42.50",
      currency: "USD",
      description: "Blue, medium",
    });
  });

  it("uses Open Graph, Twitter, and document title fallbacks in order", () => {
    const base = new URL("https://shop.example");
    expect(extractProductMetadata('<meta property="og:title" content="OG"><title>Page</title>', base).title).toBe("OG");
    expect(extractProductMetadata('<meta name="twitter:title" content="Twitter"><title>Page</title>', base).title).toBe("Twitter");
    expect(extractProductMetadata("<title>Page &amp; one</title>", base).title).toBe("Page & one");
  });

  it("drops non-web and private literal image links", () => {
    const base = new URL("https://shop.example");
    expect(extractProductMetadata('<meta property="og:image" content="javascript:alert(1)">', base).imageUrl).toBeUndefined();
    expect(extractProductMetadata('<meta property="og:image" content="http://127.0.0.1/admin">', base).imageUrl).toBeUndefined();
    expect(extractProductMetadata('<meta property="og:image" content="http://localhost/image.jpg">', base).imageUrl).toBeUndefined();
    expect(extractProductMetadata('<meta property="og:image" content="https://cdn.example:8443/image.jpg">', base).imageUrl).toBeUndefined();
  });

  it("merges JSON-LD @graph and selects the URL-matching ProductGroup variant", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"ProductGroup","name":"Trail Bottle","brand":{"@type":"Brand","name":"North Star"},"hasVariant":[
      {"@type":"Product","name":"Trail Bottle - Blue","sku":"blue","image":[{"@type":"ImageObject","url":"/blue.jpg"}],"offers":[{"price":"24.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}]},
      {"@type":"Product","name":"Trail Bottle - Red","sku":"red"}
    ]}]}</script>`;
    const fields = extractProductMetadata(html, new URL("https://shop.example/products/bottle?variant=blue"));
    expect(fields).toMatchObject({ title: "Trail Bottle - Blue", imageUrl: "https://shop.example/blue.jpg", siteName: "North Star", price: "24.99", currency: "USD", availability: "InStock", variant: "Trail Bottle - Blue", isProductPage: true });
  });

  it("extracts product fields from Microdata", () => {
    const fields = extractProductMetadata(`<div itemscope itemtype="https://schema.org/Product">
      <span itemprop="name">Handmade ceramic mug</span><span itemprop="image">/mug.jpg</span><span itemprop="brand">Clay House</span>
      <span itemprop="price">38.00</span><span itemprop="priceCurrency">USD</span></div>`, new URL("https://clay.example/mug"));
    expect(fields).toMatchObject({ title: "Handmade ceramic mug", imageUrl: "https://clay.example/mug.jpg", siteName: "Clay House", price: "38.00", currency: "USD", isProductPage: true });
  });

  it("fills fields from Open Graph product metadata", () => {
    const fields = extractProductMetadata(`<meta property="og:type" content="product"><meta property="og:title" content="Surf Green Bass">
      <meta property="og:image" content="https://cdn.example/bass.jpg"><meta property="og:site_name" content="Fender Shop">
      <meta property="product:price:amount" content="1450"><meta property="product:price:currency" content="USD"><meta property="og:description" content="Used, very good condition">`, new URL("https://reverb.com/item/123"));
    expect(fields).toMatchObject({ title: "Surf Green Bass", imageUrl: "https://cdn.example/bass.jpg", siteName: "Fender Shop", price: "1450", currency: "USD", description: "Used, very good condition", isProductPage: true });
  });

  it("extracts an OG-only image", () => {
    const fields = extractProductMetadata('<meta property="og:image" content="//cdn.example/product.jpg">', new URL("https://shop.example/products/gift"));
    expect(fields.imageUrl).toBe("https://cdn.example/product.jpg");
  });

  it("extracts the first image from a JSON-LD image array", () => {
    const fields = extractProductMetadata('<script type="application/ld+json">{"@type":"Product","name":"Lamp","image":[{"@type":"ImageObject","url":"/lamp.jpg"},{"contentUrl":"/lamp-side.jpg"}]}</script>', new URL("https://shop.example/products/lamp"));
    expect(fields.imageUrl).toBe("https://shop.example/lamp.jpg");
  });

  it("tries later JSON-LD image array candidates when the first image is invalid", async () => {
    const attempted: string[] = [];
    const metadata = await unfurlUrl("https://shop.example/products/lamp", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({ statusCode: 200, location: null, contentType: "text/html", body: `<script type="application/ld+json">{"@type":"Product","image":["/broken.jpg",{"@type":"ImageObject","contentUrl":"/working.jpg"}]}</script>${" ".repeat(2_100)}` }),
      validateImage: async (url) => {
        attempted.push(url);
        return { valid: url.endsWith("working.jpg"), statusCode: url.endsWith("working.jpg") ? 200 : 404, contentType: "image/jpeg", size: 6_000 };
      },
    });
    expect(attempted).toContain("https://shop.example/broken.jpg");
    expect(metadata.imageUrl).toBe("https://shop.example/working.jpg");
  });

  it("reads lazy-loaded product image sources", () => {
    const fields = extractProductMetadata('<main><img alt="Handmade mug" data-lazy-src="/mug-large.jpg" width="800" height="800"></main>', new URL("https://shop.example/products/mug"));
    expect(fields.imageUrl).toBe("https://shop.example/mug-large.jpg");
  });

  it("skips a store-logo OG image in favor of the product image", () => {
    const fields = extractProductMetadata('<meta property="og:image" content="https://shop.example/assets/store-logo.png"><main><img src="/products/bottle.jpg" alt="Blue bottle" width="800" height="800"></main>', new URL("https://shop.example/products/bottle"));
    expect(fields.imageUrl).toBe("https://shop.example/products/bottle.jpg");
  });

  it("skips a noisy JSON-LD image URL in favor of the product image", async () => {
    const metadata = await unfurlUrl("https://shop.example/item", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({ statusCode: 200, location: null, contentType: "text/html", body: `<script type="application/ld+json">{"@type":"Product","name":"Blue bottle","image":"/assets/store-logo.png"}</script><main><img src="/products/bottle.jpg" alt="Blue bottle" width="800" height="800"></main>${" ".repeat(2_100)}` }),
      validateImage: async () => ({ valid: true, statusCode: 200, contentType: "image/jpeg", size: 6_000 }),
    });
    expect(metadata.imageUrl).toBe("https://shop.example/products/bottle.jpg");
  });

  it("prefers Amazon's full-size image over its thumbnail and placeholder src", () => {
    const fields = extractProductMetadata(`<main><h1>Squishmallows Spider</h1>
      <img id="landingImage" src="https://images.example/placeholder.jpg" data-old-hires="https://images.example/full-size.jpg" width="500" height="500">
    </main>`, new URL("https://www.amazon.com/dp/B012345678"));
    expect(fields.imageUrl).toBe("https://images.example/full-size.jpg");
  });

  it("prefers Amazon data-old-hires before dynamic-image fallbacks", () => {
    const dynamicImages = JSON.stringify({ "https://images.example/dynamic.jpg": [1600, 1600] });
    const fields = extractProductMetadata(`<main><img id="landingImage" data-old-hires="https://images.example/old-hires.jpg" data-a-dynamic-image='${dynamicImages}' width="700"></main>`, new URL("https://www.amazon.com/dp/B012345678"));
    expect(fields.imageUrl).toBe("https://images.example/old-hires.jpg");
  });

  it("chooses the largest image from Amazon's dynamic image map", () => {
    const dynamicImages = JSON.stringify({
      "https://images.example/small.jpg": [75, 75],
      "https://images.example/large.jpg": [1200, 1200],
    });
    const fields = extractProductMetadata(`<main><img id="landingImage" src="https://images.example/tiny.jpg" data-a-dynamic-image='${dynamicImages}'></main>`, new URL("https://www.amazon.com/dp/B012345678"));
    expect(fields.imageUrl).toBe("https://images.example/large.jpg");
  });

  it.each([
    ['<script type="application/ld+json">{"@type":"Product","image":"/schema-product.jpg"}</script>', "/schema-product.jpg", new URL("https://shop.example/item")],
    ['<meta property="og:image" content="/og-product.jpg">', "/og-product.jpg", new URL("https://shop.example/item")],
    ['<img id="landingImage" data-old-hires="/amazon-product.jpg" width="600">', "/amazon-product.jpg", new URL("https://www.amazon.com/dp/B0123")],
  ])("does not let huge generic images outrank product image stages", (productMarkup, expected, base) => {
    const fields = extractProductMetadata(`<img src="/giant-banner.jpg" width="999999" height="999999">${productMarkup}`, base);
    expect(fields.imageUrl).toBe(new URL(expected, base).toString());
  });

  it("prefers the product container image over a huge header banner", () => {
    const fields = extractProductMetadata('<header><img src="/header-banner.jpg" width="999999" height="999999"></header><main><img src="/product.jpg" width="300" height="300" alt="Product"></main>', new URL("https://shop.example/item"));
    expect(fields.imageUrl).toBe("https://shop.example/product.jpg");
  });

  it("chooses the highest-resolution srcset image", () => {
    const fields = extractProductMetadata(`<main><img src="https://images.example/small.jpg" srcset="https://images.example/small.jpg 100w, https://images.example/large.jpg 800w"></main>`, new URL("https://shop.example/products/gift"));
    expect(fields.imageUrl).toBe("https://images.example/large.jpg");
  });

});

describe("guarded unfurl requests", () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];
  const htmlResponse = (overrides: Partial<{ statusCode: number; location: string | null; contentType: string | null; body: string }> = {}) => ({
    statusCode: 200,
    location: null,
    contentType: "text/html; charset=utf-8",
    body: "<meta property='og:title' content='A lovely gift'>",
    ...overrides,
  });

  it("revalidates a redirect target before making another request", async () => {
    const request = vi.fn().mockResolvedValue(htmlResponse({ statusCode: 302, location: "http://127.0.0.1/private" }));
    await expect(unfurlUrl("https://shop.example/item", { lookup: publicLookup, request })).rejects.toThrow(/Private or reserved/);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("caps redirects at five", async () => {
    const request = vi.fn(async (url: URL) => htmlResponse({ statusCode: 302, location: `/step-${url.pathname}` }));
    await expect(unfurlUrl("https://shop.example/start", { lookup: publicLookup, request })).rejects.toThrow(/redirects too many times/);
    expect(request).toHaveBeenCalledTimes(6);
  });

  it("returns link-only metadata for non-HTML and oversized responses", async () => {
    const nonHtml = await unfurlUrl("https://shop.example/a", {
      lookup: publicLookup,
      request: async () => htmlResponse({ contentType: "application/pdf" }),
    });
    expect(nonHtml.title).toBe("A");

    const tooLarge = await unfurlUrl("https://shop.example/b", {
      lookup: publicLookup,
      maxBytes: 12,
      request: async () => htmlResponse({ body: "x".repeat(13) }),
    });
    expect(tooLarge.title).toBe("B");
    expect(UNFURL_MAX_BYTES).toBe(2_000_000);
  });

  it("degrades request timeout or network failures to link-only metadata", async () => {
    const request = vi.fn(async (_url: URL, _address: unknown, timeoutMs: number) => {
      expect(timeoutMs).toBe(UNFURL_TIMEOUT_MS);
      throw new Error("request timed out");
    });
    const result = await unfurlUrl("https://shop.example/item", { lookup: publicLookup, request });
    expect(result).toMatchObject({ normalizedUrl: "https://shop.example/item", title: "Item", siteName: "Shop" });
  });

  it("extracts title and store name from a successfully fetched page", async () => {
    const result = await unfurlUrl("https://shop.example/item", {
      lookup: publicLookup,
      request: async () => htmlResponse({ body: '<meta property="og:title" content="Warm socks"><meta property="og:site_name" content="Shop">' }),
    });
    expect(result).toMatchObject({ title: "Warm socks", siteName: "Shop" });
  });

  it("uses URL-only metadata if a site keeps serving a challenge after the crawler retry", async () => {
    const agents: string[] = [];
    const result = await unfurlUrl("https://shop.example/products/123456-seven-piece-set", {
      lookup: publicLookup,
      request: async (_url, _address, _timeout, _max, userAgent) => {
        agents.push(userAgent ?? "");
        return htmlResponse({ statusCode: 503, body: "<title>Just a moment</title>Cloudflare challenge" });
      },
    });
    expect(agents).toHaveLength(2);
    expect(agents[1]).toContain("facebookexternalhit");
    expect(result).toMatchObject({ title: "Seven Piece Set", siteName: "Shop", confidence: "low", isProductPage: false });
    expect(result.fieldSources).toMatchObject({ title: "url", siteName: "url" });
  });

  it("uses Shopify product JSON for vendor, selected variant, image and price", async () => {
    const result = await unfurlUrl("https://shop.example/products/trail-bottle?variant=22", {
      lookup: publicLookup,
      request: async (url) => url.pathname.endsWith(".js")
        ? htmlResponse({ contentType: "application/json", body: JSON.stringify({ title: "Trail Bottle", vendor: "North Star", variants: [{ id: 22, title: "Blue / Small", price: 2499, featured_image: "https://cdn.example/blue.jpg" }] }) })
        : htmlResponse({ body: "<html><body>Shopify.shop = 'shop.example'; product page</body></html>" }),
    });
    expect(result).toMatchObject({ title: "Trail Bottle", siteName: "North Star", variant: "Blue / Small", price: "24.99", imageUrl: "https://cdn.example/blue.jpg", confidence: "high" });
    expect(result.fieldSources).toMatchObject({ price: "platform-shopify", variant: "platform-shopify" });
  });

  it("uses Reverb listing API fields and photos before page HTML", async () => {
    const headers: (Record<string, string> | undefined)[] = [];
    const listing = {
      title: "2020 Fender American Original 60s P Bass",
      make: "Fender",
      model: "American Original 60s Precision Bass",
      price: { amount: "1899.00", currency: "USD" },
      photos: [{ _links: { fullsize: { href: "https://images.example/reverb-bass.jpg" } } }],
    };
    const request = vi.fn(async (url: URL, _address: unknown, _timeout: number, _max: number, _userAgent?: string, allowJson?: boolean, requestHeaders?: Record<string, string>) => {
      if (url.hostname === "api.reverb.com") {
        expect(allowJson).toBe(true);
        if (requestHeaders) headers.push(requestHeaders);
        return htmlResponse({ contentType: "application/hal+json", body: JSON.stringify(listing) });
      }
      return htmlResponse({ body: `<html><body>${"Reverb listing ".repeat(180)}</body></html>` });
    });
    const result = await unfurlUrl("https://reverb.com/item/103116530-fender-bass", { lookup: publicLookup, request });
    expect(result).toMatchObject({ title: listing.title, siteName: "Fender", price: "1899.00", currency: "USD", imageUrl: "https://images.example/reverb-bass.jpg", confidence: "high" });
    expect(result.fieldSources.imageUrl).toBe("platform-reverb");
    expect(headers[0]).toMatchObject({ Accept: "application/hal+json", "Accept-Version": "3.0" });
  });

  it("uses optional rendered HTML for a client-rendered shell", async () => {
    const result = await unfurlUrl("https://shop.example/products/bottle", {
      lookup: publicLookup,
      request: async () => htmlResponse({ body: "<div id='root'></div><script src='/app.js'></script>" }),
      render: async () => `<script type="application/ld+json">{"@type":"Product","name":"Rendered Bottle","image":"https://cdn.example/bottle.jpg"}</script>`,
    });
    expect(result).toMatchObject({ title: "Rendered Bottle", imageUrl: "https://cdn.example/bottle.jpg", confidence: "high" });
    expect(result.fieldSources.title).toBe("rendered:platform-json");
  });

  it("keeps a non-product blog preview usable and identifies it as non-product", async () => {
    const result = await unfurlUrl("https://blog.example/posts/cozy-weekend", {
      lookup: publicLookup,
      request: async () => htmlResponse({ body: "<html><head><title>Cozy Weekend - Blog</title></head><body><main><h1>Cozy Weekend</h1><p>A story about cake and reading.</p></main></body></html>" }),
    });
    expect(result).toMatchObject({ title: "Cozy Weekend", confidence: "medium", isProductPage: false });
    expect(result.reason).toBeNull();
  });

  it("keeps blocked pages on URL fallback when the Playwright fallback is unavailable", async () => {
    const result = await unfurlUrl("https://shop.example/products/123456-seven-piece-set", {
      lookup: publicLookup,
      request: async () => htmlResponse({ statusCode: 503, body: "Access denied captcha" }),
      render: async () => null,
    });
    expect(result).toMatchObject({ title: "Seven Piece Set", imageUrl: null, reason: "blocked", debug: { challenge: true, fetchPath: "facebook-crawler" } });
  });
});
