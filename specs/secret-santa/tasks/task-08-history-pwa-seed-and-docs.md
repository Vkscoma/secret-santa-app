# Task 08: History, PWA, Seed Data, and Documentation

## Status

complete

## Wave

7

## Description

Complete the app with past-year history, PWA add-to-home-screen behavior, deterministic fake seed data, comprehensive setup documentation, and final page polish. History preserves each year's wishlist read-only and only shows the user's own giver/Santa relationships according to reveal state.

## Dependencies

**Depends on:** task-04-admin-exchanges-and-draw, task-05-wishlists-and-unfurl, task-06-home-and-nudge, task-07-email-and-cron
**Blocks:** None

**Context from dependencies:** Account, exchange, wishlist, conditional giver nudge, and daily notification features exist. This task uses those records to finish user-facing history and deployment onboarding; it should not replace prior year data or expose assignments that remain secret.

## Files to Create

- `src/app/history/**` — exchange history pages and read-only past wishlist views.
- `scripts/seed.ts` — safe fake users, one revealed past exchange, and one current exchange with no real personal data.
- `public/icons/**` — 192, 512, and maskable PWA icons plus apple touch icon as required.
- Mobile install prompt component and optional offline fallback/service worker only if needed by scope.

## Files to Modify

- `src/app/manifest.ts`, `src/app/layout.tsx`, `src/app/globals.css` — PWA metadata, Apple tags, safe-area padding.
- `README.md` — complete local setup, Google OAuth, Resend, Vercel Cron, migrations, seed, and environment-variable guide.
- `.env.example` — exact documented required variables.
- `package.json` — seed command if needed.
- History/navigation/settings components and any integration issues discovered during final review.

## Technical Details

### Implementation Steps

1. History lists exchanges newest first, giver recipient and saved wishlist, budget/date, and Santa identity only after reveal.
2. PWA manifest uses app name/short name, standalone display, theme/background colors and 192/512/maskable icons. Add Apple touch icon/meta tags and iPhone safe-area insets.
3. Add dismissible mobile install guidance: iOS Safari instructions and Android `beforeinstallprompt`; persist dismissal. Optional offline fallback only if it does not delay required deliverables. No push notifications.
4. Seed script creates synthetic users, one past revealed exchange and one current exchange; ensure idempotent/safe development use and never seed production by default.
5. Update README with Google OAuth callback URIs for localhost/production, Resend account/domain setup, Vercel Cron/`CRON_SECRET`, migration commands, seed command, and all required env vars.
6. Perform final integration review with lint, typecheck, build, and all Vitest tests. Ensure migrations are applied with generate/migrate and no push command is used.

### Required Environment Variables

`POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPER_ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.

### Acceptance Criteria

- [x] History renders only data authorized for the viewer and preserves old wishlist snapshots.
- [x] Santa identity appears only after reveal or an elapsed auto-reveal date.
- [x] PWA metadata/icons and platform-specific install tip work and can be dismissed persistently.
- [x] Seed data is synthetic, reproducible, and creates the required current/past scenario.
- [x] README and `.env.example` document every required integration and variable.
- [x] Full verification passes: lint, typecheck, Next build, and Vitest suite.

## Notes

Keep the seed command separate from production deployment/build scripts. Any generated assets should be original and consistent with the approved Wave 1 design.

## Completion Notes

- Added member-scoped `/history` and `/history/[exchangeId]` views. They show only the viewer's own giver relationship and saved recipient list; the viewer's incoming Santa assignment is queried only after reveal, close, or the configured auto-reveal time. Prior-calendar-year wishlist writes are blocked in Server Actions and old wishlist cards link directly to the read-only history view.
- Added standalone PWA metadata, 192/512/maskable PNG icons, an Apple touch icon, safe-area spacing, and a dismissible mobile install tip. iOS gets Safari instructions; Android uses `beforeinstallprompt` when supported.
- Added an idempotent synthetic seed command. It requires `SEED_SYNTHETIC_DATA=true`, rejects production and Vercel environments, uses only reserved `.invalid` emails, and creates a revealed prior exchange and an upcoming open exchange. No seed command runs as part of builds or migrations.
- Replaced starter setup docs with the Secret Santa local, OAuth, Resend, daily Vercel Cron, migration, seed, deployment, and environment guide; synchronized `.env.example` and `env.example`.
- Reviewed current [Next.js manifest](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest) and [icon metadata](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons), [MDN install prompt guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [WebKit iOS web app guidance](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), and [Drizzle seed docs](https://orm.drizzle.team/docs/seed-overview).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, and `pnpm test -- --run` pass (190 tests across 26 files). No schema migration was needed. Google OAuth, Resend sender verification, and production Vercel environment/Cron configuration remain manual setup items in `../action-required.md`.
