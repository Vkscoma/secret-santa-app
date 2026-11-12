# Task 07: Email Notifications and Cron

## Status

pending

## Wave

6

## Description

Deliver the specified transactional and scheduled emails through Resend using React Email templates. Add notification preference controls, a durable email log with unique idempotency keys, and one daily protected Vercel Cron route that sends due messages without duplicates.

## Dependencies

**Depends on:** task-06-home-and-anonymous-messages
**Blocks:** task-08-history-pwa-seed-and-docs

**Context from dependencies:** Exchanges, assignments, user preferences, wishlist state, and manual wishlist nudges are implemented. This task adds scheduled participant notifications while keeping assignment identities private in email content and metadata.

## Files to Create

- `src/emails/**` — React Email templates for assignment, reminders, wishlist nudges/digests, new messages, magic links as integrated with auth.
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
3. Send exchange reminders 14/7/1 days before, empty-wishlist nudge after draw at most weekly until item added, and recipient-updated daily digest.
4. Record sends in `email_log` with a unique idempotency key such as `exchange:user:type:date`; claim/insert transactionally before sending and record delivery/failure for safe retry semantics. Tests must prove retries do not duplicate sends.
5. Add `/api/cron/notifications` guarded by constant-time comparison of bearer token to `CRON_SECRET`; validate authorization on server and keep the route out of client bundles.
6. Build preference settings and manage-preferences links into all email templates. Avoid including sensitive message content or recipient identity in assignment notification previews.
7. Generate/apply schema migration only if schema changed, with `pnpm db:generate` then `pnpm db:migrate`; never `db:push`.

### Environment Variables

- `RESEND_API_KEY` — Resend API credential.
- `EMAIL_FROM` — verified sender address.
- `CRON_SECRET` — Vercel Cron authorization secret.

### Acceptance Criteria

- [ ] All required emails use React Email and Resend and link to the app/preferences.
- [ ] User preferences suppress only reminders, nudges, and digests as specified.
- [ ] Cron is daily, secret-protected, and processes due messages idempotently.
- [ ] Email idempotency tests pass; sender identity/privacy rules are respected.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass.

## Notes

Resend domain verification and production Vercel Cron configuration are manual tasks listed in `../action-required.md`.
