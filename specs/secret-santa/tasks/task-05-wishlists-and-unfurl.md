# Task 05: Wishlists and Safe URL Unfurl

## Status

complete

## Wave

4

## Description

Build one editable wishlist per user per exchange, with priority, notes, price information, ordering, Surprise me/Things I like, and copy-forward from last year's list. Add secure URL unfurling that extracts product metadata while resisting SSRF, with a graceful manual-title fallback.

## Dependencies

**Depends on:** task-04-admin-exchanges-and-draw
**Blocks:** task-06-home-and-anonymous-messages, task-08-history-pwa-seed-and-docs

**Context from dependencies:** Exchanges and participants exist, and server guards can verify ownership/membership. The exchange table supplies budget/date and prior exchange relationships. Downstream Home and history show these saved list records.

## Files to Create

- `src/lib/unfurl.ts` — URL normalization, guarded fetching, and metadata extraction.
- `src/lib/actions/wishlists.ts`, `src/app/wishlists/**` — authenticated wishlist screens and actions.
- `src/app/api/unfurl/route.ts` or a server-action equivalent — validated rate-limited unfurl endpoint.
- Vitest tests for parser, URL/IP/redirect guards, and failure fallback.

## Files to Modify

- `src/lib/schema.ts` — wishlists, wishlist items, item claims, unfurl cache.
- `drizzle/**` — generated migration.
- Shared item/composer components from Wave 1, connected to actual actions/data.

## Technical Details

### Implementation Steps

1. Add unique `(exchange_id,user_id)` wishlist; item priority, URL, notes, price min/max/bucket, image/store metadata, sort order; Surprise me and likes; item claims. Generate UUIDs for all IDs.
2. Validate every input with Zod and enforce ownership server-side. Users may edit/delete/reorder only their items. Givers may claim an item, but the list owner's payload must never include claim state.
3. Offer copy from previous exchange when a new exchange starts; preserve prior-year lists unchanged.
4. Unfurl only HTTP(S). Resolve and validate addresses to block private, loopback, link-local, and metadata IP ranges before each request and redirect; cap redirects at 3, timeout at 5s, response at about 1MB, and content type to HTML. Prevent DNS rebinding by validating the resolved address used for each connection where runtime permits.
5. Extract title by JSON-LD `Product.name`, `og:title`, `twitter:title`, then `<title>`; also extract `og:image`, site name, and price. Normalize URL for cache, rate-limit per user, and gracefully return link-only data when extraction fails.
6. Add tests for extraction precedence, redirect/IP/URL rejection, timeout/size/type constraints, normalized cache key, and fallback behavior.
7. Generate/apply migration using `pnpm db:generate` then `pnpm db:migrate`; never `db:push`.

### Acceptance Criteria

- [ ] User can create, edit, reorder, delete, and copy wishlist items with validated fields.
- [ ] One wishlist per exchange/user is enforced; past lists remain intact.
- [ ] Claims are hidden from owner and visible only to giver.
- [ ] Unfurl safety constraints are enforced, cached, rate-limited, and covered by Vitest.
- [ ] User can save a link when extraction fails by supplying/editing the title.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass.

## Notes

Never fetch an arbitrary URL from the browser. SSRF defense must be enforced server-side and rechecked across redirects.

## Completion Notes

- Added participant wishlists with validated create/edit/delete/reorder actions, previous-year copy-forward, preferences, assigned-recipient views, and giver-only claim state.
- Added server-side URL unfurling with normalized caching, per-user rate limiting, DNS resolution pinning, private/reserved address and redirect checks, time/size/type limits, and manual-title fallback. Legacy empty wishlist/cache tables were reconciled in place with a guarded migration that preserves legacy columns.
- Redraw now clears wishlist claims in the same transaction and uses the same exchange lock as claim toggles.
- Verification: `pnpm test -- --run` (96 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `git diff --check` pass. The build required elevated permissions because Turbopack could not bind a port in the sandbox.
- `drizzle/0006_wild_texas_twister.sql` was applied successfully to the live database with `pnpm db:migrate`.
