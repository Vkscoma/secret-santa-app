# Task 06: Home, Recipient View, and Email Nudge

## Status

complete

## Wave

5

## Description

Connect the signed-in Home experience to real exchange data: countdown/budget, giver assignment, recipient wishlist/settings, and the user's wishlist status. Allow assigned givers to send a rate-limited email nudge asking their recipient to add gift ideas.

## Dependencies

**Depends on:** task-04-admin-exchanges-and-draw, task-05-wishlists-and-unfurl
**Blocks:** task-07-email-and-cron, task-08-history-pwa-seed-and-docs

**Context from dependencies:** Exchange assignments and participant membership exist, and protected wishlist APIs provide owned and recipient-visible list data. The giver's UI must identify the recipient without exposing assignment data to other participants.

## Files to Create

- `src/lib/actions/nudges.ts` and the nudge button component.
- Home and recipient components/pages as appropriate.
- Vitest API-shape/privacy tests proving recipient payloads never include giver identity.

## Files to Modify

- `src/app/page.tsx` — authenticated participant Home.
- `src/app/proxy.ts`/route configuration only if routes need matcher additions; keep actual authorization in handlers.
- Shared wishlist item components — read-only recipient presentation and claim toggle integration.

## Technical Details

### Implementation Steps

1. Build Home sections in required order: timezone-aware countdown and budget; assignment/recipient list and settings; own wishlist progress. Before draw, show “Names haven't been drawn yet.”
2. Recipient wishlist is priority-sorted, shows Most wanted and Over budget based on exchange budget, and exposes giver claim toggles without revealing claims to owner.
3. Add a “Nudge by email” action for the assigned giver. The server verifies the assignment, rate limits the sender, and emails the recipient a reminder linking to their wishlist.
4. Use the visual style of the magic-link email while keeping the nudge copy independent of sign-in links. Do not disclose the giver's identity in the email.
5. Add tests for assignment-only authorization and rate limiting.

### Acceptance Criteria

- [x] Home content is ordered per requirements and respects exchange timezone.
- [x] Recipient list, sizes, address, priorities, over-budget labels and claims follow permissions.
- [x] Only the assigned giver can send a nudge; recipients and unrelated users cannot.
- [x] Nudge emails use the Secret Santa email visual style, prompt wishlist completion, and preserve giver anonymity.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass.

## Notes

Keep data projections explicit and minimal. Do not fetch a full user/assignment object and then rely on client-side hiding.

## Completion Notes

- Replaced the signed-in landing page with participant Home cards for exchange countdown/budget, assignment, recipient wishlist, nudge, and own wishlist progress.
- Added an assignment-validated, rate-limited email nudge for the recipient using the magic-link email’s visual style.
- Recipient lists now sort by priority and show profile sizes/address, over-budget items, and giver-only claims.
- Added DST-safe countdown and nudge authorization/email tests. The recipient nudge is offered only while their list has no gift ideas. Messaging remains out of scope; the existing message table migration is retained without feature UI, routes, or content queries to avoid a destructive schema change.
- Verification after the email nudge replacement: 172 tests pass, lint passes with five import-order warnings, typecheck passes, and `git diff --check` passes. Production build is being rerun.
