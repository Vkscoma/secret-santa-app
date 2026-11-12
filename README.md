# Secret Santa

A private Secret Santa app for family and friends. Members can manage one wishlist per exchange, view only their own assignment and recipient’s list, and send the assigned giver’s email nudge while that recipient has no wishlist items. Private messaging is not part of the app.

## Requirements

- Node.js 20.9 or later
- pnpm
- PostgreSQL 15+ or a Neon Postgres database
- Google OAuth credentials for Google sign-in
- Resend account and verified sending domain for live email

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Set `POSTGRES_URL` to your local Docker database or Neon connection string. Do not use `db:push`; create and apply schema migrations with `pnpm db:generate` followed by `pnpm db:migrate`.

To load synthetic development data, explicitly opt in:

```bash
NODE_ENV=development SEED_SYNTHETIC_DATA=true pnpm db:seed
```

The seed command refuses production and Vercel environments. It uses reserved `.invalid` email addresses, creates one revealed past exchange plus one upcoming open exchange, and is safe to rerun. It does not create sign-in credentials or send emails.

## Environment variables

Copy `.env.example` and provide these required application variables:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_URL` | PostgreSQL connection string. |
| `BETTER_AUTH_SECRET` | Random secret with at least 32 characters; generate one with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Canonical auth origin, such as `http://localhost:3000`. |
| `NEXT_PUBLIC_APP_URL` | Public app origin used in links and metadata. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `SUPER_ADMIN_EMAIL` | Initial administrator email; it remains allowed and cannot be demoted. |
| `RESEND_API_KEY` | Resend API key for sign-in links and notification emails. |
| `EMAIL_FROM` | Sender address on a verified Resend domain, for example `Secret Santa <hello@example.com>`. |
| `CRON_SECRET` | Random secret Vercel uses to authorize the notification cron. |

Optional variables:

| Variable | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Enables hosted storage for uploaded wishlist images. Without it, wishlist images use their validated source URLs. |
| `NEXT_PUBLIC_IOS_SHORTCUT_URL` | Optional link to an iOS Shortcut for adding a product link from Safari. |
| `CHROME_EXECUTABLE_PATH` | Optional local Chromium executable for rendered product previews. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Alternate local Chromium executable path. |

Google OAuth, Resend, and cron credentials can be left blank during local UI work, but their corresponding integrations will not operate. Magic-link URLs are logged to the server console in development when Resend is not configured.

## Google OAuth

Create an OAuth 2.0 client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add the following authorized redirect URIs:

```text
http://localhost:3000/api/auth/callback/google
https://YOUR_PRODUCTION_HOST/api/auth/callback/google
```

Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add the production origin to the OAuth consent screen’s authorized domains and configure it as `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` in the deployed app.

## Resend email

Create an API key in [Resend](https://resend.com/api-keys), add and verify a sending domain in Resend, and set `RESEND_API_KEY` plus `EMAIL_FROM` to an address on that verified domain. The app uses Resend for magic links, assignment notices, reminders, and wishlist nudges/digests. Assignment emails never identify the recipient. Digest preferences can be disabled in Settings; empty-list nudges are capped at once every seven days.

## Vercel deployment and notifications

Deploy the app to Vercel and configure the required environment variables for Production (and Preview if desired). Set `CRON_SECRET` to a long random value. `vercel.json` schedules `/api/cron/notifications` daily at 15:00 UTC; Vercel sends the matching bearer authorization header. The route processes reminder milestones, retries failed or stale pending emails idempotently, sends wishlist digests for the prior 24 hours at most once per giver/exchange/local date, and keeps empty-wishlist nudges on a seven-day cooldown.

Run database migrations as a deployment step before serving the new app:

```bash
pnpm db:migrate
```

Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the production origin and add the production callback URI to Google OAuth. Add the production `RESEND_API_KEY`, verified `EMAIL_FROM`, and `CRON_SECRET` in Vercel. Cron configuration and third-party account verification are manual setup steps; see [`specs/secret-santa/action-required.md`](specs/secret-santa/action-required.md).

## History and installable app

History is limited to past exchanges where the signed-in user was a participant. It shows only that user’s own giver assignment and saved recipient wishlist. Their own Santa appears only after a manual reveal, exchange close, or an elapsed auto-reveal date. Past-year wishlist actions are read-only.

The PWA manifest and icons let supported browsers add Secret Santa to a home screen. On iPhone, open the site in Safari, tap Share, then choose **Add to Home Screen**. Supported Android browsers show an in-app Install button when the browser reports the app is installable. The prompt can be dismissed and stays dismissed on that device. The app does not use push notifications or promise offline access.

## Useful commands

```bash
pnpm dev                 # Local development
pnpm lint                # ESLint
pnpm typecheck           # TypeScript checks
pnpm test -- --run       # Vitest suite
pnpm build:ci            # Production build without running migrations
pnpm db:generate         # Generate migration after schema changes
pnpm db:migrate          # Apply migrations
```

## Project docs

- [`DESIGN.md`](DESIGN.md) — design tokens and UI patterns
- [`specs/secret-santa/requirements.md`](specs/secret-santa/requirements.md) — product requirements and delivery plan
- [`specs/secret-santa/action-required.md`](specs/secret-santa/action-required.md) — manual integration setup
