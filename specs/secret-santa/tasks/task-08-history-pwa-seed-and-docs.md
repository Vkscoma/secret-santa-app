# Task 08: History, PWA, Seed Data, and Documentation

## Status

pending

## Wave

7

## Description

Complete the app with past-year history, PWA add-to-home-screen behavior, deterministic fake seed data, comprehensive setup documentation, and final page polish. History preserves each year's wishlist read-only and only shows the user's own giver/Santa relationships according to reveal state.

## Dependencies

**Depends on:** task-04-admin-exchanges-and-draw, task-05-wishlists-and-unfurl, task-06-home-and-anonymous-messages, task-07-email-and-cron
**Blocks:** None

**Context from dependencies:** All core account, exchange, wishlist, messaging, and notification features exist. This task uses those records to finish user-facing history and deployment onboarding; it should not replace prior year data or expose assignments that remain secret.

## Files to Create

- `src/app/history/**` — exchange history pages and read-only past message/wishlist views.
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

1. History lists exchanges newest first, giver recipient and saved wishlist, budget/date, and Santa identity only after reveal. Past threads are readable but cannot be replied to.
2. PWA manifest uses app name/short name, standalone display, theme/background colors and 192/512/maskable icons. Add Apple touch icon/meta tags and iPhone safe-area insets.
3. Add dismissible mobile install guidance: iOS Safari instructions and Android `beforeinstallprompt`; persist dismissal. Optional offline fallback only if it does not delay required deliverables. No push notifications.
4. Seed script creates synthetic users, one past revealed exchange and one current exchange; ensure idempotent/safe development use and never seed production by default.
5. Update README with Google OAuth callback URIs for localhost/production, Resend account/domain setup, Vercel Cron/`CRON_SECRET`, migration commands, seed command, and all required env vars.
6. Perform final integration review with lint, typecheck, build, and all Vitest tests. Ensure migrations are applied with generate/migrate and no push command is used.

### Required Environment Variables

`POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPER_ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.

### Acceptance Criteria

- [ ] History renders only data authorized for the viewer and preserves old wishlist snapshots.
- [ ] Old threads cannot be replied to; Santa identity appears only after reveal.
- [ ] PWA metadata/icons and platform-specific install tip work and can be dismissed persistently.
- [ ] Seed data is synthetic, reproducible, and creates the required current/past scenario.
- [ ] README and `.env.example` document every required integration and variable.
- [ ] Full verification passes: lint, typecheck, Next build, and Vitest suite.

## Notes

Keep the seed command separate from production deployment/build scripts. Any generated assets should be original and consistent with the approved Wave 1 design.
