# Requirements: Secret Santa Application

## Summary

Build a production-ready Secret Santa web app for a family or friend group, extending this repository's Next.js 16, React 19, TypeScript, Better Auth, Neon Postgres, and Drizzle starter. The experience covers account onboarding, yearly exchanges and assignments, wishlists, private anonymous messaging, email reminders, administration, and history.

The supplied `specs/secret-santa-spec.md` is the product source of truth. Preserve its exact seven-wave ordering and the visual review checkpoint after Wave 1. This document captures the delivery plan and schema proposal so implementation can be approved task-by-task before work begins.

## Goals

- Deliver the exact app flows and security behavior in the source spec.
- Keep the existing Better Auth Drizzle adapter and Neon database wiring intact.
- Use server-side authorization and Zod validation for every mutation/route boundary.
- Add the required Vitest coverage for draw, invites, unfurl/SSRF, nudge authorization, and email idempotency.
- Produce a runnable app, migrations, seed data, environment example, and setup documentation.

## Non-Goals

- No passwords, public self-service signup, product discovery grid, websockets, push notifications, or payment processing.
- No changes to the database provider/connection or Better Auth/Drizzle adapter setup.
- No use of `drizzle-kit push`.

## Acceptance Criteria

- [ ] Seven implementation waves are represented in the linked task files, with no overlapping same-wave file ownership.
- [ ] Wave 1 includes light/dark preview screens at 390px and 1280px and pauses for user review before Wave 2.
- [ ] All requirements in the source spec are implemented, including the final documented environment variables and seed scenario.
- [ ] All new non-Better-Auth primary IDs are UUIDs generated randomly; Better Auth IDs remain text.
- [ ] Schema changes use `pnpm db:generate` and `pnpm db:migrate`, never `db:push`.
- [ ] Lint, typecheck, build, and required tests pass at the feature review gates, subject to configured external credentials/database.

## Assumptions

- The existing `POSTGRES_URL` configuration points to the intended Neon database; migration commands may require the user-provided environment to be configured.
- `SUPER_ADMIN_EMAIL` is the sole initial bootstrap admin and remains immune to demotion.
- The exchange year/date and timezone drive countdowns and scheduled reminders; timezone defaults to `America/Los_Angeles`.
- Manual third-party setup is tracked in `action-required.md`; implementation must not invent credentials or deploy external services.

## Technical Constraints

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS v4, shadcn/ui, Lucide, `next-themes`, Drizzle, Neon, Better Auth, Resend, React Email, Zod, Vitest.
- Review current official documentation for framework/library APIs before implementing the relevant integrations. Next.js 16 calls middleware `proxy`; proxy checks are optimistic only and cannot replace server authorization. Drizzle migration workflow is generate then migrate. Better Auth magic-link supports `disableSignUp` and configured expiration; verify provider/API details against current docs.
- Use design tokens only; no raw hex or arbitrary colors. Update `DESIGN.md` to match the app theme.
- Preserve the starter's database connection and Better Auth adapter wiring. Every Server Action and route handler rechecks session and role/participation.
- Keep assignment identities private until reveal. Assigned givers can send recipients an anonymous wishlist nudge.

## Short Plan

1. **Wave 1 — Starter cleanup and visual foundation:** remove unused chat/payment/blob/API-key functionality, add Vitest, implement festive light/dark themes and shared UI, then render preview routes and capture desktop/mobile screenshots. Stop for visual approval.
2. **Wave 2 — Access:** implement Google and eligible magic-link account creation/sign-in, allowlist/invite redemption, role bootstrap, and secure access checks.
3. **Wave 3 — Admin and exchange core:** build allowlist/exchange administration, exclusions, auditable draw/reveal, transactional assignments, and draw tests.
4. **Wave 4 — Wishlists:** build editing/claims/copy-forward and hardened URL unfurl with parser/SSRF tests.
5. **Wave 5 — Participant experience:** build countdown, assignments, recipient list, and an anonymous wishlist email nudge.
6. **Wave 6 — Notifications:** build email templates, preference handling, email log idempotency and protected daily cron.
7. **Wave 7 — Completion:** build history and PWA affordances, deterministic seed data, README/env setup, and final integration polish.

## Final Schema Proposal

Refine details against current Drizzle and Better Auth documentation during implementation, without changing the existing database adapter or connection. Use UUID primary keys with application-generated `crypto.randomUUID()` values for all app tables below. Keep existing Better Auth `user`, `session`, `account`, and `verification` IDs as text. Add user fields through Better Auth `additionalFields` and matching Drizzle columns.

| Table | Proposed fields and constraints |
|---|---|
| `user` (Better Auth) | Add `role` (`user`/`admin`, default `user`), nullable `display_name`, `shipping_address`, `sizes`, JSON `notification_prefs`; preserve email and auth fields. Bootstrap `SUPER_ADMIN_EMAIL` as allowed/admin during trusted sign-in logic. |
| `allowlist` | UUID `id`; normalized unique `email`; nullable `added_by` -> user; nullable `exchange_id`; timestamps and source/reason. Bootstrap super-admin email is always eligible. |
| `invite_links` | UUID `id`; unique `token_hash` only (never raw token); exchange FK; creator FK; expiry, `max_uses`, revoked timestamp, created timestamp. |
| `invite_redemptions` | UUID `id`; invite/user FKs; redeemed timestamp; unique `(invite_link_id,user_id)`. |
| `exchanges` | UUID `id`; name, year, budget min/max (or amount representation), exchange date, timezone, notes, status enum (`open`,`drawn`,`revealed`,`closed`), auto-reveal flag, created/updated timestamps. |
| `exchange_participants` | UUID `id`; exchange/user FKs; joined timestamp; unique `(exchange_id,user_id)`. |
| `exclusions` | UUID `id`; exchange FK; giver/receiver user FKs; unique `(exchange_id,giver_id,receiver_id)`; disallow self-exclusion only as redundant validation, while draw always forbids self-assignment. |
| `assignments` | UUID `id`; exchange, giver, receiver FKs; created timestamp; unique `(exchange_id,giver_id)` and `(exchange_id,receiver_id)`. Private server-only reads. |
| `wishlists` | UUID `id`; exchange/user FKs; `surprise_me`, nullable `likes`, timestamps; unique `(exchange_id,user_id)`. |
| `wishlist_items` | UUID `id`; wishlist FK; title, URL, image, store/domain, notes, `priority`, numeric `price_min`/`price_max`, `price_bucket`, sort position, timestamps. |
| `item_claims` | UUID `id`; wishlist item FK, giver user FK, created timestamp; unique `(item_id,giver_id)`. Visible only to giver; never expose claim marker to list owner. |
| `email_log` | UUID `id`; recipient user FK, optional exchange FK, type, unique idempotency key, status, sent/error timestamps and provider ID. Avoid storing sensitive anonymous message content. |
| `unfurl_cache` | UUID `id`; unique normalized URL, extracted title/image/site/price fields, fetched/expiry timestamps. |
| `audit_log` | UUID `id`; actor user FK, action, target type/UUID, JSON metadata, created timestamp. Never store message bodies; record assignment reveal and redraw actions. |

Use explicit FK delete behavior: cascade dependent join/data rows where ownership ends; restrict deleting users/exchanges that must remain historically auditable, or soft-delete/close as appropriate. Add indexes for foreign keys and common exchange/user/time queries. Review uniqueness and nullable behavior before generating migration SQL. Every schema change runs `pnpm db:generate` then `pnpm db:migrate`; do not use `db:push`.

## Current Documentation Research

- Next.js 16: Proxy is the renamed middleware layer and is not a complete authorization/session solution: [Proxy](https://nextjs.org/docs/app/getting-started/proxy).
- Next.js Server Actions: validate and authorize mutations at the action boundary: [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data).
- Better Auth magic link: `disableSignUp` and expiration behavior are documented in the plugin docs: [Magic Link](https://better-auth.com/docs/1.6/plugins/magic-link).
- Drizzle migrations: use `drizzle-kit generate` to create migration SQL and `drizzle-kit migrate` to apply it: [Migrations](https://orm.drizzle.team/docs/migrations).
- Recheck Tailwind CSS v4, shadcn/ui, Better Auth Google provider, Resend/React Email, and Vercel Cron docs immediately before the relevant implementation tasks; their APIs can change.
