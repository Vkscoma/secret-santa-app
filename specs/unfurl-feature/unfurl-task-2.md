Build universal link previews for wishlist items: paste or share any
product URL and fill title, store, price, variant and image as well as
possible. No paid services. Users are mostly on phones. This supersedes
earlier instructions for this feature.

A. Pipeline (each stage fills only missing fields; record fieldSources)

0. URL only: store from hostname; title from the longest path slug
   (strip ids, extensions; title-case). Used only if nothing better.

1. fetchHtml(url)
   a. Direct fetch with browser-like headers, 5s timeout, max 5
   redirects (follow short links such as a.co), 2MB cap.
   b. If 403/429/503, a challenge page, or under ~2KB of text: retry
   once with User-Agent "facebookexternalhit/1.1".
   c. Still blocked or empty: Playwright fallback.
   - playwright-core + @sparticuz/chromium in a dedicated Node
     runtime route; check current Vercel docs for setup and bundle
     limits; raise memory and maxDuration for this route only. Use
     local Chromium in development.
   - Realistic user agent, 1280x800, locale en-US; block fonts,
     media and analytics.
   - goto(domcontentloaded); wait up to 5s for JSON-LD, og:image or
     h1; scroll once for lazy images; return page.content().
   - 20s hard budget; close the browser in finally.
     d. Still a challenge page: reason "blocked", continue with stage 0
     data.
     Cache successful HTML-derived results by normalised URL for 7 days.

2. Site and platform data
   - Reverb (/item/{id}-...): GET api.reverb.com/api/listings/{id}
     with Accept and Content-Type application/hal+json and
     Accept-Version 3.0; optional REVERB_API_TOKEN as Bearer. Confirm
     field names from the real response.
   - Shopify (detect cdn.shopify.com or /products/{handle}): GET
     {origin}/products/{handle}.js; use vendor, the ?variant= variant
     (else first available), its price, title and featured_image.
   - Inline state (**NEXT_DATA** and similar): search for objects with
     name/title + price.

3. Structured data (merge all)
   - JSON-LD Product/ProductGroup in @graph or arrays; offers as
     object, array or AggregateOffer; brand string or object; image
     string, array or ImageObject. Each block in its own try/catch.
   - Microdata/RDFa itemprops.
   - og:, twitter:, product: meta tags; canonical link.

4. Heuristics
   - Title: h1, else <title> minus site suffix.
   - Price: elements with "price" in class/id/itemprop; skip
     struck-through prices; infer currency from symbol.
   - Image: Amazon #landingImage (data-old-hires, then
     data-a-dynamic-image); itemprop=image; then <img> candidates in
     main content scored by size, reading data-src and srcset,
     penalising logo/icon/sprite/badge/placeholder and under 200px.

5. Images
   - Validate candidates in order: 200, image/* content-type, over 5KB.
   - Download the winner, resize to max 800px webp, store in Vercel
     Blob, save our URL on the item.

B. Safety and errors

- Require sign-in; rate limit per user.
- Only http/https; reject private, loopback and link-local addresses,
  re-checked after redirects.
- Return { ok, data, confidence, fieldSources, reason? } with reason
  one of blocked | timeout | not_html | no_metadata | invalid_url.
  Only invalid_url is shown as an error; everything else saves what we
  have with a "Check these details" hint.

C. Mobile entry points

- Paste-first form: one large "Paste a link or type a wish" field with
  a Paste button; preview runs automatically; other fields under
  "Details"; never overwrite what the user typed.
- Android: manifest share_target (GET /wishlists/share; params title,
  text, url). Find the first URL in url or text; use the shared title
  as a candidate; wishlist picker if several; preserve params through
  sign-in.
- iPhone: /wishlists/add accepts ?url= and ?payload= (base64url JSON:
  url, title, image, price, currency, brand; zod-validated, 4KB cap,
  untrusted). Help page "Add from your phone" linking to
  NEXT_PUBLIC_IOS_SHORTCUT_URL.

D. Image fallback

- Camera button on Add a wish and Edit this gift: file input with
  accept="image/*", plus clipboard image paste. Resize client-side;
  verify and cap at 5MB server-side; store in Blob.
- When a link saves without an image, prompt inline: "Couldn't get a
  picture from this store. Add a screenshot?"
- "Refresh from link" action; run it once for existing items with a
  link and no image.

E. Debugging and tests

- scripts/unfurl-debug.ts prints status, final URL, which fetch path
  was used, fieldSources and the chosen image for a given URL.
- Fixture tests: JSON-LD @graph, ProductGroup variants, OG-only,
  microdata-only, Shopify, Reverb API response, lazy-loaded images,
  og:image that is a store logo, a JS-rendered page through
  Playwright, a challenge page (URL-derived title, no crash), share
  param parsing, payload validation, private-IP rejection.

Build order: A1-A5 with the debug script, then D, then C.
