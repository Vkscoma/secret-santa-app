# Task 02: Festive Design System and Previews

## Status

complete

## Wave

1

## Description

Replace the starter visual language with the original Secret Santa design described in `specs/secret-santa-spec.md`: airy Drawnames-inspired layouts, Fresh Snow light theme, Christmas Eve dark theme, responsive shell, and reusable product components. Create no-auth realistic preview routes for wishlists, wishlist editor, and Home so the user can review the visual direction before product workflows begin.

## Dependencies

**Depends on:** task-01-remove-starter-features
**Blocks:** task-03-auth-access-and-invites

**Context from dependencies:** The unused starter chat/payment/blob/API-key features have been removed and Vitest is available. This task establishes visual components and preview-only mock screens; later tasks replace mock data with protected application data.

## Files to Create

- `src/app/preview/wishlists/page.tsx`, `src/app/preview/wishlists/[id]/page.tsx`, `src/app/preview/home/page.tsx` — realistic no-auth design previews.
- `src/components/secret-santa/**` — reusable panel, item card, progress nudge, wish composer, gift tag, FAB, illustration, string lights, and snowfall components as appropriate.
- UI primitives requested by design using shadcn CLI (e.g. sheet, tabs, switch, progress) under `src/components/ui/`.

## Files to Modify

- `src/app/globals.css` — light/dark semantic tokens, pine/gold/snow tokens, reduced-motion handling, festive accents.
- `src/app/layout.tsx`, `src/components/site-header.tsx`, `src/components/site-footer.tsx` — typeface, responsive app shell, menu and theme controls.
- `src/app/page.tsx` and starter home/dashboard presentation — replace with Secret Santa shell/entry experience while product data is not yet available.
- `DESIGN.md` — canonical design tokens, typography, layout and component patterns.
- `src/app/manifest.ts` — align theme/background colors and app identity where appropriate.

## Technical Details

### Implementation Steps

1. Follow `DESIGN.md` after updating it; use Tailwind semantic tokens, no raw hex/arbitrary colors. Use an original inline SVG/simple-shape illustration, not Drawnames assets.
2. Implement the specified Fresh Snow and Christmas Eve tokens and bridge `pine`, `pine-foreground`, `gold`, `gold-foreground`, `snow` through `@theme inline`. Set radius to `0.75rem`; use a rounded geometric sans (Plus Jakarta Sans or Nunito Sans) via `next/font/google`.
3. Build the sticky header/menu, centered 960px content region, card and panel patterns, item card, progress nudge, composer, gift tag, floating plus action, illustration, lights, and snowfall. Respect reduced motion and mobile ordering/bottom-sheet behavior in previews.
4. Check relevant text/background pairs against the spec's WCAG AA targets and adjust lightness as needed.
5. Populate `/preview/wishlists`, `/preview/wishlists/sample`, `/preview/home` with realistic sample data and no auth/database requirement.
6. Run the app and capture each preview in light and dark at 390px and 1280px (12 screenshots total). Record artifact locations in task completion notes and stop for explicit visual review before Wave 2.

### Acceptance Criteria

- [ ] Design tokens and shared components match the source spec and work in light and dark modes.
- [ ] The three preview routes render without authentication and show realistic content.
- [ ] Requested mobile/desktop and light/dark screenshots are captured and ready for review.
- [ ] Reduced-motion preferences disable snowfall/twinkle animation; decorations do not obscure text.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build:ci` pass.
- [ ] Work stops at the visual review gate; no Wave 2 implementation starts until user approval.

## Notes

The user's visual approval is a hard dependency. Keep preview-only data clearly isolated from production services.

## Completion

- Implemented the Fresh Snow and Christmas Eve themes, responsive shell/menu, shared Secret Santa components, updated `DESIGN.md`, and three no-auth preview routes. Fixed review findings for mobile composer duplication, dark-mode text contrast, and the conditional create-list action.
- After the user's review, fixed Home mobile horizontal overflow by stacking the countdown/budget card and recipient header at phone widths, allowing the list link to wrap, and constraining nested cards. Moved dark-mode snowfall into a short strip clear of the Home heading and body copy.
- Captured production screenshots (without the Next.js dev badge) at all three routes, both themes, and both requested viewport sizes in `artifacts/secret-santa-wave1/`.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm build:ci`, `pnpm test -- --run`, and `git diff --check` pass. The test runner is configured; there are no feature tests to run in Wave 1.
- Wave 1 is complete. Stop here for visual review; Wave 2 remains pending user approval.
