# Task 04: Admin, Exchanges, and Secure Draw

## Status

complete

## Wave

3

## Description

Build the administrator experience for allowlist/invite management, user settings, exchanges, participants, exclusions, audit events, draw/reveal, and reminders initiation. Implement the cryptographically randomized one-to-one draw with exclusion and prior-year pairing avoidance, transactionally persist assignments, and protect assignment secrecy from ordinary admin views.

## Dependencies

**Depends on:** task-03-auth-access-and-invites
**Blocks:** task-05-wishlists-and-unfurl, task-06-home-and-nudge, task-08-history-pwa-seed-and-docs

**Context from dependencies:** Auth now provides normalized allowlist/invite eligibility, roles, trusted server guards, and the user extension fields. This task introduces exchange membership and assignment records that downstream wishlist, email, and history features rely on.

## Files to Create

- `src/lib/draw.ts` — cryptographically secure constrained assignment algorithm.
- `src/lib/actions/admin.ts`, exchange-related actions and admin UI under `src/app/admin/**`.
- Draw unit/property-style tests covering required invariants and randomized runs.

## Files to Modify

- `src/lib/schema.ts` — exchanges, participants, exclusions, assignments, audit log; indexes and constraints.
- `drizzle/**` — generated migration.
- `src/proxy.ts` and diagnostics handler/page — admin route gating, with server authorization.
- Relevant admin navigation/menu components and `src/lib/authz.ts` — admin and exchange membership checks.

## Technical Details

### Implementation Steps

1. Implement exchange fields/statuses, participants, exclusions, assignment unique constraints `(exchange_id,giver_id)` and `(exchange_id,receiver_id)`, and audit log. All new non-auth IDs are random UUIDs.
2. Admin UI supports allowlist and invite administration, user profile settings/roles, exchange setup, participant selection, budget/date/time zone, exclusions, draw, reminders-now action, and email log view when available. Do not show assignments by default.
3. Assignment reveal is a distinct confirmation action and every reveal is audited. Protect diagnostics for admins.
4. Draw algorithm forbids self-assignment, guarantees a one-to-one permutation, honors exclusions, prefers avoiding the giver's last two pairings where a valid draw exists, uses crypto randomness (never `Math.random`), and fails clearly when impossible. Save all assignments in one transaction.
5. Redraw requires explicit confirmation and clears item claims. If assignments have retained legacy message rows, block the redraw rather than cascading deletion of those rows.
6. Add tests: no self-assignment, perfect mapping, exclusions, past-year avoidance preference, impossible case rejection, and thousands of randomized valid cases for 2–30 participants.
7. Review current Drizzle and Next.js docs; generate and apply migration with `pnpm db:generate` and `pnpm db:migrate`. Never use `db:push`.

### Acceptance Criteria

- [ ] Exchange lifecycle is `open` → `drawn` → `revealed` → `closed`; drawn exchanges are locked except explicit redraw.
- [ ] Draw satisfies all invariants and tests, including impossible input and randomized run coverage.
- [ ] Assignment writes are all-or-nothing and uniqueness is enforced by database constraints.
- [ ] Regular admin screens do not reveal mappings; explicit reveal is confirmed and audited.
- [ ] Diagnostics route is admin-only.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass.

## Notes

Task scope owns the shared `schema.ts` for exchanges and draw-related tables. Later schema tasks extend it in later waves to avoid concurrent edits.

## Completion Notes

- The admin and exchange workflows, lifecycle locks, exclusion management, secure draw, transactional assignments, confirmed redraw/reveal, audit events, and admin-only diagnostics are implemented.
- Draw coverage includes impossible inputs, constraints, previous-pair avoidance, and 2,000 randomized feasible draws. Verification: `pnpm test -- --run` (56 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `git diff --check` pass.
- `pnpm db:migrate` applied pending migrations successfully to the configured live database.
- Follow-up compatibility fix: exchange creation now writes the authenticated creator ID required by the deployed `exchange.created_by` column. Migration `0007_aspiring_doctor_octopus.sql` is recorded; it preserved the existing column/FK on the live database.
- Redraw now checks for rows in the retained legacy message table and refuses to cascade-delete them; no schema migration was needed.
