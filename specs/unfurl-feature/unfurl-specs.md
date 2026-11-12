Goal: the link preview must work for any store's product page and fill
as many fields as it can. It must never return nothing: the worst case
is a title derived from the URL plus the store name.

Build the extractor as an ordered pipeline. Each stage receives the
partial result and fills only missing fields. Record which stage
supplied each field (fieldSources) for debugging.

Stage 0 - URL only (no network)

- store: hostname without "www." and TLD, title-cased.
- titleFromSlug: take the longest path segment, drop leading numeric
  ids, file extensions and query, replace - and _ with spaces,
  title-case. Use only if no later stage finds a title.

Stage 1 - Fetch

- Browser-like headers; on 403/429/503 or a challenge page retry once
  as "facebookexternalhit/1.1". If still blocked, mark blocked and skip
  to Stage 5, else Stage 6.

Stage 2 - Structured data (merge all, do not stop at first hit)

- JSON-LD: Product and ProductGroup, inside @graph or arrays; offers as
  object, array or AggregateOffer (price, lowPrice, priceCurrency,
  availability); brand as string or object; image as string, array or
  ImageObject. If hasVariant exists, pick the variant matching the URL's
  variant/sku param.
- Microdata and RDFa: itemprop name, image, brand, price,
  priceCurrency within an itemscope Product.
- Meta tags: og:title, og:image, og:site_name, og:description,
  product:price:amount, product:price:currency, product:brand,
  twitter:title, twitter:image, link[rel=canonical].

Stage 3 - Platform fingerprints (detect from HTML, not domain)

- Shopify (cdn.shopify.com or Shopify.shop in the HTML, or a
  /products/{handle} path): GET {origin}/products/{handle}.js for
  vendor, variant title, variant price and variant image.
- Embedded state: if **NEXT_DATA** or a similar inline JSON blob
  exists, search it for objects with name/title + price keys.
- Keep this stage small and pluggable so more can be added later.

Stage 4 - Heuristics

- Title: first <h1>, else <title> with the site-name suffix removed.
- Price: elements whose class, id or itemprop contains "price"; parse
  the first currency amount; ignore struck-through/compare-at prices.
  Infer currency from the symbol or the page lang.
- Image: link[rel=image_src], else the largest <img> in main content
  (skip logos, icons, sprites and anything under 200px).

Stage 5 - Rendered fetch (optional, behind RENDER_API_URL/KEY env vars)

- Only when blocked or when the HTML body has almost no text
  (client-rendered). Fetch rendered HTML from the configured service,
  then rerun Stages 2-4. If env vars are unset, skip silently.

Stage 6 - AI extraction (optional, behind an env flag)

- Only when title or price is still missing and we have page text.
- Send the cleaned visible text (max ~6k chars) plus up to 10 candidate
  image URLs to a small model with a strict JSON schema: title, brand,
  price, currency, variant, imageUrl, isProductPage. Instruct it to
  return null rather than guess. Validate with zod; reject prices not
  present in the source text.

Output
ProductPreview plus: fieldSources, confidence ("high" for structured
data or platform JSON, "medium" for heuristics or AI, "low" for
URL-only), and reason when partial.

UI

- Fill Gift title, Store or maker, Price from, image and notes with
  whatever was found. For medium/low confidence show a subtle
  "Check these details" hint instead of an error.
- Only show an error for an invalid URL.

Tests
Fixtures for: JSON-LD with @graph, ProductGroup with variants,
microdata-only, OG-only, Shopify, a client-rendered shell, a challenge
page (expects URL-derived title, confidence low), and a non-product
page such as a blog post.
