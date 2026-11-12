# Action Required: Secret Santa Application

Manual setup needed for full integration and deployment.

## Before Implementation

- [x] **Confirm access to the configured Neon database** — migrations applied successfully with `pnpm db:migrate`; never use `db:push`.

## During Implementation

- [ ] **Create/configure a Google OAuth client** — set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; add callback URIs `http://localhost:3000/api/auth/callback/google` and the production `/api/auth/callback/google` URL.
- [ ] **Set `SUPER_ADMIN_EMAIL`** — this email is the always-allowed bootstrap administrator.
- [ ] **Set app/auth URLs and Better Auth secret** — configure `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` for each environment.
- [ ] **Create a Resend account/API key and verify the sender domain** — configure `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] **Configure Vercel Cron and `CRON_SECRET`** — required for authenticated daily notification processing in production. The schedule runs daily at 15:00 UTC; each reminder is eligible in its own six-day window and is processed at the next daily run. A reminder is skipped if no run falls within its window.

## After Implementation

- [ ] **Add all production environment variables in Vercel** — `POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPER_ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
- [ ] **Review Wave 1 preview screenshots** — implementation pauses before Wave 2 until the visual direction is approved.

---

These steps are referenced in the implementation task files where relevant.
