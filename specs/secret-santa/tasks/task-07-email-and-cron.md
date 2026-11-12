# Task 07: Email Notifications and Cron

## Status

complete

## Wave

6

## Description

Deliver the specified transactional and scheduled emails through Resend using React Email templates. Add notification preference controls, a durable email log with unique idempotency keys, and one protected daily Vercel Cron route that processes due notifications without duplicates.

## Dependencies

**Depends on:** task-06-home-and-nudge
**Blocks:** task-08-history-pwa-seed-and-docs

**Context from dependencies:** Exchanges, assignments, user preferences, wishlist state, and manual wishlist nudges are implemented. This task adds scheduled participant notifications while keeping assignment identities private in email content and metadata.

## Files to Create

- `src/emails/**` — React Email templates for assignment, reminders, wishlist nudges/digests, and magic links as integrated with auth.
- `src/lib/email.ts`, notification scheduler/service and `/src/app/api/cron/notifications/route.ts`.
- Email idempotency tests.

## Files to Modify

- `src/lib/schema.ts` — email log idempotency fields/constraints if not yet added; generated migration.
- User settings UI/actions — reminders, nudges, digest preferences.
- `vercel.json` — daily cron schedule.
- `src/lib/env.ts`, `.env.example` — Resend and cron variables.

## Technical Details

### Implementation Steps

1. Review current official Resend, React Email, Better Auth magic-link mailer, and Vercel Cron docs before implementation.
2. Implement assignment email without recipient name; magic links and assignment emails always send. Other scheduled notifications honor preferences.
3. Send exchange reminders at the 14/7/1-day milestones, an empty-wishlist nudge after draw at most weekly until an item is added, and a recipient-wishlist update digest for the prior 24 hours at most once per giver per exchange-local date.
4. Record sends in `email_log` with a unique idempotency key such as `exchange:user:type:date`; claim/insert transactionally before sending and record delivery/failure for safe retry semantics. Tests must prove retries do not duplicate sends.
5. Add `/api/cron/notifications` guarded by constant-time comparison of bearer token to `CRON_SECRET`; validate authorization on server and keep the route out of client bundles.
6. Build preference settings and manage-preferences links into all email templates. Assignment notifications never include recipient identity.
7. Generate/apply schema migration only if schema changed, with `pnpm db:generate` then `pnpm db:migrate`; never `db:push`.

### Environment Variables

- `RESEND_API_KEY` — Resend API credential.
- `EMAIL_FROM` — verified sender address.
- `CRON_SECRET` — Vercel Cron authorization secret.

### Acceptance Criteria

- [x] All required emails use React Email and Resend and link to the app/preferences.
- [x] User preferences suppress only reminders, nudges, and digests as specified.
- [x] Cron is daily, secret-protected, and processes due notifications idempotently.
- [x] Email idempotency tests pass; sender identity/privacy rules are respected.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass.

## Notes

Resend domain verification and production Vercel Cron configuration are manual tasks listed in `../action-required.md`.

The cron runs daily at 15:00 UTC. Each reminder is eligible in its own six-day window: the 14-day reminder at 8–14 days before the exchange, the 7-day reminder at 1–7 days before, and the 1-day reminder from 1 day before through 5 days after. The windows overlap on the day before the exchange, when both the 7-day and 1-day milestones may be sent. Daily checks process eligible milestones at the next run; if a run falls outside a milestone's window, that reminder is skipped. Stable milestone idempotency keys prevent a retry or later run from sending a milestone twice. Wishlist-update emails summarize changes from the prior 24 hours and send at most once per giver per exchange per exchange-local date. Empty-wishlist nudges remain limited to once every seven days. There is no message email template or message notification requirement; the legacy `message` table is retained without feature routes or content queries.

## Completion Notes

- Added React Email templates and Resend delivery for magic links, assignment notices, reminders, empty-wishlist nudges, manual recipient nudges, and daily wishlist-update digests.
- Added notification preferences, idempotent `email_log` claims/retries, and the protected daily 15:00 UTC Vercel Cron route. Generated and applied the `email_log` migration.
- Kept messaging out of product scope and removed the message email variant. The legacy message table remains untouched; redraw is blocked when retained message rows exist to prevent cascade deletion.
- Home shows the giver's nudge button only while the assigned recipient has no wishlist items and has not disabled nudges. The server rechecks assignment, preference, and item state before sending.
- Verification: lint, typecheck, production build, and 181 tests pass. Resend domain verification and production Vercel Cron configuration remain manual setup tasks.
