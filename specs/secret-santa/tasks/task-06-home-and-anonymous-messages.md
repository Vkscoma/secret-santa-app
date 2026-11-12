# Task 06: Home, Recipient View, and Anonymous Messages

## Status

complete

## Wave

5

## Description

Connect the signed-in Home experience to real exchange data: countdown/budget, giver assignment, recipient wishlist/settings, unread message counts, and the user's wishlist status. Add two-way anonymous assignment threads with strict server-side identity filtering, polling, rate limits, and item claim controls.

## Dependencies

**Depends on:** task-04-admin-exchanges-and-draw, task-05-wishlists-and-unfurl
**Blocks:** task-07-email-and-cron, task-08-history-pwa-seed-and-docs

**Context from dependencies:** Exchange assignments and participant membership exist, and protected wishlist APIs provide owned and recipient-visible list data. The giver's UI must identify the recipient, while the recipient-facing thread API must not serialize giver identity before reveal.

## Files to Create

- `src/lib/actions/messages.ts`, message route handlers and thread UI under `src/app/messages/**`.
- Home and recipient components/pages as appropriate.
- Vitest API-shape/privacy tests proving recipient payloads never include giver identity.

## Files to Modify

- `src/lib/schema.ts` — messages table and any needed unread/read indexes; generated migration.
- `src/app/page.tsx` — authenticated participant Home.
- `src/app/proxy.ts`/route configuration only if routes need matcher additions; keep actual authorization in handlers.
- Shared wishlist item components — read-only recipient presentation and claim toggle integration.

## Technical Details

### Implementation Steps

1. Build Home sections in required order: timezone-aware countdown and budget; assignment/recipient list and settings; message unread counts; own wishlist progress. Before draw, show “Names haven't been drawn yet.”
2. Recipient wishlist is priority-sorted, shows Most wanted and Over budget based on exchange budget, and exposes giver claim toggles without revealing claims to owner.
3. Add one thread per assignment. Giver sees “Chat with [Recipient]”; recipient sees “Chat with your Secret Santa.” Derive sender role from authenticated user and assignment, not client input.
4. Enforce participant-only thread access, 1000-character plain-text messages, Zod validation, send rate limits, unread/read status, polling about every 15 seconds while open and refresh on focus. Admins cannot read threads.
5. Do not include giver user ID, name, email, avatar, or indirect identifying fields in recipient message payloads, user-visible logs, or email-related metadata. After reveal, the Santa name may be shown as a separate permitted field.
6. Add tests asserting the full recipient API response omits giver identity and tests for participant-only access and message limits.
7. Generate and apply migration using `pnpm db:generate` then `pnpm db:migrate`; never `db:push`.

### Acceptance Criteria

- [x] Home content is ordered per requirements and respects exchange timezone.
- [x] Recipient list, sizes, address, priorities, over-budget labels and claims follow permissions.
- [x] Both assignment participants can converse; unrelated users and admins cannot read the thread.
- [x] Recipient-facing payloads never contain giver identity before reveal; test passes.
- [x] Message length, text-only rendering, rate limits, unread counts, polling, and focus refresh work.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass.

## Notes

Keep data projections explicit and minimal. Do not fetch a full user/assignment object and then rely on client-side hiding.

## Completion Notes

- Replaced the signed-in landing page with participant Home cards for exchange countdown/budget, assignment, recipient wishlist, messages, and own wishlist progress.
- Added assignment-backed anonymous threads with participant and non-admin authorization, recipient-safe projections, text validation, per-sender throttling, unread/read tracking, polling, and focus refresh.
- Recipient lists now sort by priority and show profile sizes/address, over-budget items, and giver-only claims.
- Added route privacy/access, payload-shape, and DST-safe countdown tests. Generated and applied `drizzle/0014_simple_magdalene.sql`.
- Verification: 179 tests pass; lint passes with seven import-order warnings; typecheck, `build:ci`, and `git diff --check` pass.
