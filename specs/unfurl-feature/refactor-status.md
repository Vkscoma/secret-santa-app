# Universal unfurl refactor status

Implementation: complete. Integration review: PASS.

- [x] Save one wish immediately per paste intent; reuse its UUID for retries.
- [x] Update the saved wish through a separate background preview request.
- [x] Preserve original query parameters and fragments in owner and recipient links.
- [x] Extract each field independently using Open Graph, matching JSON-LD Product, Twitter, and HTML title fallbacks.
- [x] Remove store-specific extractors and guessed prices; retain explicit, unambiguous Offer amounts and currencies with fetch timestamps.
- [x] Preserve manual edits while enriching untouched fields.
- [x] Enforce public destinations at connection time for pages and thumbnails, with bounded redirects, time, and bytes.
- [x] Verify duplicate events, failed previews, retries, ordinary text wishes, and concurrent edits.

## Verification

- Lint, typecheck, 138 tests, and production build passed.
- Mounted React/Chromium harness passed actual paste events, exact links, duplicate prevention, background enrichment, text submission, and failed-save retries with mocked persistence.
- Live Reverb example: HTTP 200 through the crawler retry; title and product image from Open Graph; no guessed price.
- Live `https://ogp.me/`: HTTP 200 through direct fetch; Open Graph title and image.
- Additive migrations 0011–0013 were generated, inspected, and applied after confirming earlier migrations were already applied. No live wishlist test items were created.

Page metadata remains optional. A blocked page or unavailable thumbnail leaves a saved, clickable wish that can be edited manually. Durable image copies still require `BLOB_READ_WRITE_TOKEN`; remote image URLs remain usable without it.
