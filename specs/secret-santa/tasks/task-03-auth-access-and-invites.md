# Task 03: Authentication, Access, and Invites

## Status

complete

## Wave

2

## Description

Replace password authentication with Google and allowlist/invite-eligible magic-link account creation and sign-in. Gate all membership through the allowlist or valid exchange invite, bootstrap the configured super-admin, and establish server-side authorization helpers and protected app routes. Keep the Better Auth adapter and database connection unchanged.

## Dependencies

**Depends on:** task-02-design-system-and-previews
**Blocks:** task-04-admin-exchanges-and-draw

**Context from dependencies:** The app has the approved festive shell and reusable UI components, and Wave 1 has passed visual review. No product tables exist yet. This task adds auth-related user fields and invite/access tables using the schema proposal in `requirements.md`.

## Files to Create

- `src/lib/authz.ts` — server-side session, role, allowlist, and participation guards.
- Auth and join pages/components for Google sign-in, magic-link request, friendly not-allowed state, and `/join/[token]`.
- Auth/invite validation tests for invite token handling and eligibility.

## Files to Modify

- `src/lib/auth.ts`, `src/lib/auth-client.ts` — Google provider, magic-link plugin, user additional fields; preserve adapter/database wiring.
- `src/lib/schema.ts` — user custom fields, allowlist, invite links, invite redemptions.
- `src/proxy.ts` — optimistic route matching only; keep real authorization in server actions/handlers.
- Auth route/page files, `drizzle/**`, `.env.example` — auth UI/config, generated migration, environment documentation.

## Technical Details

### Implementation Steps

1. Review current official Better Auth docs for Google provider, magic-link plugin, user `additionalFields`, hooks/database lifecycle, and rate-limiting approach. Use Next.js 16 Proxy docs; proxy is not the authorization boundary.
2. Disable email/password and email verification. Google and eligible magic-link verification may create accounts; allowlist, super-admin, or valid pending invite is required before sending a link and again before account creation. Magic link expiry is 15 minutes, one-use, `disableSignUp: false`; show the same generic response for existing, new eligible, and ineligible emails. Rate-limit by normalized email and IP.
3. Enforce allowlist/invite eligibility before creating accounts. Bootstrap `SUPER_ADMIN_EMAIL` as always allowed and admin. A valid invite's raw token is generated from 32 random bytes; only a cryptographic hash is stored. Handle redeemed/expired/revoked/max-use invites and already-drawn exchanges as specified.
4. Build normalized-email allowlist checks and invite redemption with transaction-safe use counts. Never expose whether a magic-link email exists.
5. Add server guard helpers and call them in every action/handler introduced here. Route proxy checks remain a convenience only.
6. Generate and apply schema migration with `pnpm db:generate` then `pnpm db:migrate`; never use `db:push`. Use UUIDs for all newly added non-Better-Auth IDs.
7. Add Vitest cases for invite token validation, expiration/revocation/max uses, eligible first-time magic-link signup, and blocked ineligible addresses.

### Environment Variables

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth client.
- `SUPER_ADMIN_EMAIL` — always-allowed initial administrator.
- Existing `POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` remain.

### Acceptance Criteria

- [ ] Google and magic-link verification create accounts only for allowlisted/invited emails; eligible existing accounts can sign in by either method.
- [ ] Existing and unknown email magic-link requests return the same public response; rate limits apply per email/IP.
- [ ] Invite token raw value is never persisted; token validation tests pass.
- [ ] Super admin bootstraps and remains allowed; app authorization helpers verify role/membership server-side.
- [ ] Migration is generated and applied with required commands.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build:ci` pass.

## Notes

Manual OAuth client and environment setup is in `../action-required.md`. Review current Better Auth documentation before coding because plugin APIs evolve.

## Completion Notes

- Google and eligible magic-link authentication, allowlist/invite eligibility, rate limits, super-admin bootstrap, authorization guards, and invite redemption are implemented.
- Added `.env.example` with placeholder values and tests that exercise the actual Better Auth account-creation eligibility hook.
- Verification: `pnpm test -- --run` (56 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `git diff --check` pass.
- `pnpm db:migrate` applied pending migrations successfully to the configured live database.
