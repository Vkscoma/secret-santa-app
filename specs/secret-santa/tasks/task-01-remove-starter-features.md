# Task 01: Remove Unused Starter Features

## Status

complete

## Wave

1

## Description

Remove starter functionality that is explicitly out of scope: AI chat, OpenRouter, Polar payments, Vercel Blob, and the Better Auth API-key plugin. Preserve diagnostics (it becomes admin-only in the access task), existing Better Auth/Drizzle/Neon wiring, and reusable UI primitives. Add Vitest as the project's test runner because later waves include security and draw tests.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-02-design-system-and-previews

**Context from dependencies:** This is the first implementation task. Keep `src/lib/auth.ts` adapter/database setup, `src/lib/db.ts`, schema, session helpers, and the database connection intact. Later tasks add product features on the cleaned starter.

## Files to Create

- `vitest.config.ts` — Vitest configuration for TypeScript source and tests.

## Files to Modify

- `package.json`, `pnpm-lock.yaml` — remove unused AI/blob/API-key packages and add Vitest dependencies/scripts.
- `src/lib/env.ts`, `.env.example` (or existing env example) — remove unused integration variables; preserve auth/database variables.
- `src/lib/auth.ts` — remove only API-key plugin registration; do not otherwise change auth behavior yet.
- `src/app/chat/**`, `src/app/api/chat/**`, related chat components/hooks — delete unused chat UI and endpoint.
- `src/lib/storage.ts` and unused upload components — remove Vercel Blob integration.
- `src/app/page.tsx`, `src/app/dashboard/**`, setup checklist and starter prompt components — remove starter-specific content as needed for the product shell task.
- Starter payment/Polar files and references, if present — remove unused feature.

## Technical Details

### Implementation Steps

1. Inspect imports and environment references before deleting files; remove dead references and packages cleanly.
2. Keep diagnostics route and reusable UI primitives. Leave the route authorization change to the auth/access task.
3. Install/configure Vitest and add a `test` script; do not add standalone test files in this cleanup task.
4. Preserve `db:generate`, `db:migrate`, and existing build scripts. Never invoke `db:push`.
5. Verify official current docs for package compatibility when adding Vitest.

### Acceptance Criteria

- [ ] No imports or env references remain for removed starter integrations/features.
- [ ] Existing auth, Drizzle, Neon, diagnostics, and UI primitives remain usable.
- [ ] `pnpm test -- --run` invokes Vitest successfully with no tests yet.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

This task is explicitly limited to starter cleanup and test-runner setup. Do not implement any Secret Santa product workflow or modify database schema.

## Completion

- Removed unused AI chat, OpenRouter, payment, Blob, and API-key packages and app code while keeping diagnostics and existing auth/database wiring.
- Added Vitest configuration and the `test` script.
- Verification: `pnpm test -- --run`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` pass. No test files exist yet; feature-specific tests are assigned to later waves.
