# Build: Secret Santa Web App

You are building a production-ready Secret Santa web app for a family/friend group. Read this whole spec before writing code. Ask me before deviating from the stack or the data rules below.

## Starting point (already installed)

This repo was created from Leon van Zyl's Agentic Coding Starter Kit (https://github.com/leonvanzyl/agentic-coding-starter-kit). **Better Auth is already connected and working.** Build on what's here.

**What the starter provides (keep and reuse):**

- Next.js 16 + React 19 + TypeScript and pnpm.
- Better Auth with the Drizzle adapter in `src/lib/auth.ts`, the client in `src/lib/auth-client.ts`, and session helpers in `src/lib/session.ts`.
- Drizzle in `src/lib/db.ts` and `src/lib/schema.ts`, reading `POSTGRES_URL`. Migrations live in `drizzle/`, and the `build` script runs `db:migrate`.
- Route protection in `src/proxy.ts` (cookie check only).
- `src/app/manifest.ts`, Radix UI primitives, `next-themes`, `sonner` toasts.
- `AGENTS.md` / `CLAUDE.md` rules and agents/skills in `.claude/`.

**Follow the starter's rules in `AGENTS.md`.** In particular: always run `db:generate` + `db:migrate` after schema changes, never `db:push`, use random UUIDs for all non-Better Auth IDs, and run lint, typecheck and `next build` after each feature.

**Use the starter's workflow.** Use the `create-spec` skill to turn this document into a spec under `specs/secret-santa/`, then the `implement-feature` skill to build it in waves.

**Change these things in the starter:**

- **Sign-in methods only:** `src/lib/auth.ts` ships with email + password turned on and no Google provider. Turn off `emailAndPassword` and `emailVerification`, add Google under `socialProviders`, and add the `magicLink` plugin (see Authentication). Leave the adapter and database setup alone.
- **Remove features this app doesn't use:** the AI chat (`/chat`, `/api/chat`, OpenRouter, AI SDK), Polar payments, Vercel Blob storage, and the `@better-auth/api-key` plugin. Clean up their env vars, components, pages and dependencies.
- **Replace the starter's pages:** swap the landing page, setup checklist and dashboard for the Secret Santa UI. Keep the diagnostics page, but only for admins.
- **Protect the new routes** in the `proxy.ts` matcher.
- **Add Vitest** (the starter has no test runner).

## Stack

- **Framework:** Next.js 16 (App Router, Server Components, Server Actions) with TypeScript in strict mode, using Turbopack (the default).
- **Hosting:** Vercel, including Vercel Cron Jobs for scheduled emails.
- **Database:** Neon Postgres + Drizzle (already set up).
- **Auth:** Better Auth: Google OAuth and approved magic links can create accounts and sign users in. No passwords.
- **Email:** Resend, with templates written in React Email.
- **Validation:** Zod on every Server Action, route handler and form.
- **Styling:** Tailwind CSS v4 + shadcn/ui, as provided by the starter (see below).
- **Tests:** Vitest.

## Styling: Tailwind CSS v4 + shadcn/ui (the starter's setup)

- **Keep the starter's styling stack:** Tailwind CSS v4 with CSS-first config (`@theme inline` in `src/app/globals.css`, no `tailwind.config.ts`), shadcn/ui, Lucide icons, `next-themes` for dark mode, and `cn()` from `@/lib/utils`. Don't add another CSS library.
- **Tokens only:** Components use theme tokens (`bg-primary`, `text-muted-foreground`, `bg-pine`, etc.). No raw hex values or arbitrary colors like `bg-[#c00]`.
- **Components:** Reuse the shadcn components in `src/components/ui/`, and add more with the shadcn CLI (`select`, `tabs`, `sheet`, `switch`, `progress`, `tooltip`, `dropdown-menu`) instead of hand-writing them. Build app-specific pieces in `src/components/`.
- **Update `DESIGN.md`** with the tokens, fonts, layout rules and component patterns below, so it stays the source of truth.

## Design direction: modeled on Drawnames

I like how **Drawnames** (drawnames.com) looks and feels: clean, airy, friendly and easy to use. Match its **layout, spacing and interaction patterns**, but with our own app name, a Christmas color palette, and our own icons and illustrations. Don't copy their logo, brand name, illustrations or product images.

**What to match:**

- **Simple sticky header:** white (or card color in dark mode), a subtle bottom shadow, the app logo and name on the left, and the user's initial avatar plus a hamburger menu on the right. The menu holds Home, My wish lists, History, Settings, Admin (for admins only), the theme toggle and Sign out.
- **One centered content column**, about 960px wide on desktop and full width with 16px padding on phones. Lots of white space.
- **Large, bold page titles** (e.g. "My wish lists"), left-aligned above the content.
- **Soft cards:** white cards, rounded corners (~12px), very light shadows, thin borders, generous padding. Icon buttons (settings ⚙, share) sit in the card's top-right corner as small square tinted buttons.
- **Panel with a colored header bar:** a strong colored header (Drawnames uses blue; we use pine green) with a white title and a subtitle (e.g. "Christmas 2026 · 4 gifts"), plus icon buttons on the right. The body is a white card below it.
- **Progress nudge card:** a small card with an icon, a bold line ("Add at least 1 more gift"), a short subline ("Tell people what you'd really like!") and a thin progress bar.
- **Item cards:** a square thumbnail on the left (unfurled image, or a festive placeholder icon), a bold title truncated to 1–2 lines, the store name and domain in muted text, a pill/chip for notes (e.g. "15 feet – Right Angle to Straight"), a remove ✕ in the top-right, and a drag handle (⋮⋮) on the left for reordering.
- **Round floating "+" button** at the bottom-right of a list to add an item.
- **"Hobbies and interests" section** under the list, with a person icon and a "⋯" menu to edit. Empty state: "You haven't added any hobbies or interests yet." This is our "Things I like" / "Surprise me" field.
- **A full-width primary button** at the bottom of list pages (e.g. "Make a new wish list +").
- **Decorative illustration** to the right of the main column on wide screens only (hidden on phones). Use an original, simple, flat Christmas illustration (e.g. a snowy scene with wrapped gifts and a pine tree) built as an inline SVG or from simple shapes, not copied art.

### Key screens

1. **My wish lists** (`/wishlists`, like Drawnames' "My wish lists"):
   - A title, then one card per exchange/year (newest first). Each card has the list name as a link, settings + share icon buttons, and a gray strip of small square thumbnails for the items.
   - A full-width "Make a new wish list" button at the bottom. We get one list per exchange, so this button shows only when there's a current exchange without a list. Past years' cards are read-only and say "Christmas 2025 · past".
   - The festive illustration sits on the right on desktop.
2. **Wish list editor** (`/wishlists/[id]`), like Drawnames' list editor, **without the "Gift Finder"** (no product grid, no filters, no store suggestions). Use a two-column layout on desktop that stacks on phones:
   - **Left (main): "Add a wish"** composer. A large rounded input with the placeholder "Add a wish or paste a link" and a primary button with a plus or search icon.
     - **When the user pastes a URL:** run the unfurl and show a preview card (image, title, store) with editable fields.
     - **When they type plain text:** that becomes the title.
     - **More fields** (expanded by default after the first input, collapsible): Notes (size, color, model), Priority (segmented control: Most wanted / Would like / Nice to have), and Price range (min/max inputs, or `$`/`$$`/`$$$` chips). Then a primary "Add to my list" button.
     - Below the composer, show an empty-state tip card when the list is empty ("Add links from any store, or just describe what you'd like").
   - **Right (sticky on desktop): the list panel** with a pine header ("Christmas 2026", "N gifts", settings and share buttons). Inside: the progress nudge card (target: at least 3 items), the item cards (drag to reorder, tap to edit in a sheet/dialog, ✕ to remove with an undo toast), the round "+" button, and then "Hobbies and interests" with the "Surprise me" toggle.
   - **On phones:** the list panel comes first, and the "+" button opens the "Add a wish" composer in a bottom sheet.
3. **Home** (`/`): the same header and column. Show, in order: a countdown + budget card, the gift-tag assignment card (with the recipient's list underneath, using the same item cards in read-only form plus an "I'm getting this" toggle), and your wishlist status using the progress nudge card style. Show the email nudge only to the assigned giver while the recipient has no wishlist items.
4. **Recipient's list view:** the same item card layout, read-only, sorted by priority, with "Over budget" and "Most wanted" badges and the "I'm getting this" toggle.
5. **History, Settings, Admin:** the same card system. For simple pages, use tabs or a stacked list of cards.

## Christmas themes: modern and festive in light AND dark

Modern first, festive second: clean surfaces and plenty of white space like Drawnames, with Christmas color used deliberately on headers, buttons, badges and accents. **Dark mode must still feel festive, not just "dark gray."** Build two themes in `globals.css`. Light is `:root` and dark is `.dark`, switched by `next-themes` (system default, with a toggle in the menu).

The values below are a starting point. **Check every text/background pair for WCAG AA contrast** (4.5:1 for body text, 3:1 for large text and UI borders) and adjust lightness, not hue, where a pair fails.

### Light: "Fresh Snow"

Crisp white with a hint of frost, cranberry buttons, pine-green panel headers, gold highlights.

| Token                                    | Value                    | Use                                                        |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `background`                             | `oklch(0.985 0.004 200)` | frosty white page                                          |
| `foreground`                             | `oklch(0.22 0.03 165)`   | deep pine ink                                              |
| `card` / `popover`                       | `oklch(1 0 0)`           | white cards                                                |
| `card-foreground` / `popover-foreground` | `oklch(0.22 0.03 165)`   |                                                            |
| `primary`                                | `oklch(0.53 0.19 25)`    | cranberry red: main buttons, links, "+" FAB, active states |
| `primary-foreground`                     | `oklch(0.99 0.005 90)`   |                                                            |
| `secondary`                              | `oklch(0.95 0.025 155)`  | soft pine tint: icon buttons, chips                        |
| `secondary-foreground`                   | `oklch(0.35 0.07 158)`   |                                                            |
| `muted`                                  | `oklch(0.965 0.006 160)` | thumbnail strips, subtle panels                            |
| `muted-foreground`                       | `oklch(0.50 0.02 160)`   | store names, helper text                                   |
| `accent`                                 | `oklch(0.96 0.025 25)`   | blush hover/highlight                                      |
| `accent-foreground`                      | `oklch(0.42 0.16 25)`    |                                                            |
| `border` / `input`                       | `oklch(0.91 0.01 170)`   |                                                            |
| `ring`                                   | `oklch(0.53 0.19 25)`    |                                                            |
| `destructive`                            | `oklch(0.55 0.22 30)`    |                                                            |
| `pine` (new)                             | `oklch(0.42 0.09 158)`   | list panel header, countdown, brand color                  |
| `pine-foreground` (new)                  | `oklch(0.99 0.005 90)`   |                                                            |
| `gold` (new)                             | `oklch(0.80 0.13 82)`    | progress bars, stars, "Most wanted", ribbon                |
| `gold-foreground` (new)                  | `oklch(0.28 0.05 70)`    |                                                            |
| `snow` (new)                             | `oklch(0.97 0.01 230)`   | snowflake decorations                                      |

### Dark: "Christmas Eve"

A deep evergreen night with warm string-light glow: cards lifted in pine, a cranberry that glows, candle-gold accents.

| Token                                    | Value                   | Use                                            |
| ---------------------------------------- | ----------------------- | ---------------------------------------------- |
| `background`                             | `oklch(0.17 0.03 175)`  | deep evergreen night (not gray)                |
| `foreground`                             | `oklch(0.96 0.01 90)`   | snow text                                      |
| `card` / `popover`                       | `oklch(0.22 0.035 168)` | pine-tinted cards                              |
| `card-foreground` / `popover-foreground` | `oklch(0.96 0.01 90)`   |                                                |
| `primary`                                | `oklch(0.64 0.19 25)`   | glowing cranberry                              |
| `primary-foreground`                     | `oklch(0.99 0.005 90)`  | check contrast; use dark text if white fails   |
| `secondary`                              | `oklch(0.29 0.045 162)` |                                                |
| `secondary-foreground`                   | `oklch(0.94 0.015 90)`  |                                                |
| `muted`                                  | `oklch(0.25 0.03 170)`  |                                                |
| `muted-foreground`                       | `oklch(0.74 0.025 155)` |                                                |
| `accent`                                 | `oklch(0.30 0.06 25)`   | warm red hover                                 |
| `accent-foreground`                      | `oklch(0.96 0.01 90)`   |                                                |
| `border` / `input`                       | `oklch(0.33 0.035 168)` |                                                |
| `ring`                                   | `oklch(0.64 0.19 25)`   |                                                |
| `destructive`                            | `oklch(0.68 0.19 28)`   |                                                |
| `pine` (new)                             | `oklch(0.48 0.10 155)`  | panel headers, a touch brighter than the cards |
| `pine-foreground` (new)                  | `oklch(0.99 0.005 90)`  |                                                |
| `gold` (new)                             | `oklch(0.85 0.14 85)`   | candle-glow accents                            |
| `gold-foreground` (new)                  | `oklch(0.22 0.04 70)`   |                                                |
| `snow` (new)                             | `oklch(0.95 0.015 230)` |                                                |

Bridge `pine`, `pine-foreground`, `gold`, `gold-foreground` and `snow` in `@theme inline` so classes like `bg-pine`, `text-gold` and `fill-snow` work. Set `--radius` to `0.75rem` (cards ~12px, pills fully rounded).

### Typography

- **Headings, titles and buttons:** a modern rounded geometric sans like Drawnames' bold titles. Use **Plus Jakarta Sans** or **Nunito Sans** (700–800) via `next/font/google`.
- **Body text:** the same family at 400–500, or Inter.
- **Countdown numbers:** big and bold with tabular figures.
- Skip serif and novelty "Christmas" fonts. The festive feel comes from color and small details.

### Festive details: how it stays festive (especially in dark mode)

- **Pine panel headers** with a very subtle diagonal gradient (`pine` to slightly darker) and a faint snowflake pattern (low-opacity SVG) on the right side.
- **String-light accent under the header:** a thin row of small dots in red, green and gold along the header's bottom edge. In dark mode they glow softly (`box-shadow`) with a slow twinkle animation. They're static with `prefers-reduced-motion` and can be turned off in Settings.
- **Snowfall:** light, CSS-only, behind the hero/illustration area on desktop and the top of Home on phones. On by default in dark mode, off in light mode, and toggleable in Settings. Off with `prefers-reduced-motion`. Never behind body text.
- **Gift-tag assignment card:** a notched corner, a punched hole, a thin gold string, and a gentle gold glow in dark mode. Before the draw, the tag is face-down ("Names haven't been drawn yet").
- **Gold progress bars and a gold ⭐ on "Most wanted" items.**
- **Item placeholders:** when an item has no image, show a soft pine or cranberry tile with a Lucide `Gift`, `TreePine`, `Snowflake` or `Star` icon instead of a blank box.
- **Original illustration** on wide screens (see Design direction), with a dark-mode variant: night sky, warm window glow, gifts.
- **Friendly copy** in empty states (e.g. "Your list is as empty as Santa's sleigh on Dec 26").
- **Avoid:** candy-cane stripes behind text, glitter, busy patterns, novelty fonts, and red text on green (low contrast, hard for colorblind users).

### Review step

After building the themes, layout shell and components, render static preview versions of **My wish lists**, the **Wish list editor** and **Home** with realistic sample data at `/preview/*` (no auth). Take screenshots in light and dark mode at phone width (390px) and desktop width (1280px), then stop for my review before building anything else.

## Authentication & access

- **Account creation is limited to emails on the allowlist or a valid invite.** Eligible users can create an account with Google or by verifying a magic link. Use `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google OAuth.
- **Magic links are for approved addresses.** The sign-in page offers "Continue with Google" and "Email me a secure link."
  - Send a link only if the email is eligible under the same allowlist, super-admin, or pending-invite gate as Google sign-in. A first-time eligible user can create an account after verifying the link; unknown and ineligible addresses receive no email.
  - Always show the same "If this email is approved, a secure link will be sent shortly" response for existing, new eligible, and ineligible addresses.
  - Links expire after 15 minutes and work only once. Rate-limit requests per email and per IP.
  - A magic-link sign-in and a Google sign-in with the same email reach the same account.
- **Who can join:** Only people who are on the allowlist or who used a valid invite link can create an account. Anyone else sees a friendly "You're not on the list yet — ask the organizer" page, and no account is created.
- Re-check the session and role inside every Server Action and route handler. Never rely on `proxy.ts` alone.

## Invite links

- Admins create invite links for an exchange, with an optional expiry date and max number of uses. Admins can see how many times each link was used and revoke it.
- Generate tokens from 32 random bytes and store only a hash of each token.
- Opening `/join/[token]` shows the exchange name and a "Join with Google" button. After sign-in, the email is added to the allowlist and the user joins the exchange.
- If the exchange has already been drawn, the person is still added to the allowlist but doesn't join this year's draw. Tell them so, and let the admin know.
- Admins can still add individual emails manually.

## Roles & admin

- Roles: `user` and `admin`.
- **Bootstrap:** The email in `SUPER_ADMIN_EMAIL` is automatically admin on first sign-in and is always allowed in. I am the only admin at the start.
- Admins can promote and demote admins. The super admin cannot be demoted, and the app must never end up with zero admins.
- **Admin dashboard** (`/admin`):
  - Allowlist and invite links.
  - View and edit any user's settings (display name, shipping address, sizes, notes, notification preferences, role).
  - Exchanges: create, set participants, budget and date, run the draw, send reminders now.
  - Exclusion rules (e.g. spouses can't draw each other).
  - An email log showing what was sent to whom, and when.
- **Keep the secret:** Admins are usually participants too, so the dashboard must NOT show who drew whom by default. Seeing assignments takes a separate "Reveal assignments" action behind a confirmation dialog, and every reveal is logged.
- Log admin actions (role changes, settings edits, draws, reveals, invite changes) to `audit_log`.

## Yearly exchange & the draw

- An **Exchange** has a name (e.g. "Christmas 2026"), year, budget (min/max or a single amount), exchange date, time zone (default `America/Los_Angeles`), optional notes, and a status: `open` → `drawn` → `revealed` → `closed`.
- **Draw rules (critical):**
  - Nobody draws themselves.
  - Everyone gives exactly one gift and receives exactly one. Nobody gets the same recipient as someone else.
  - Respect exclusions.
  - Avoid repeating the giver's pairing from the last 2 years when possible.
  - Use `crypto.randomInt` / `crypto.getRandomValues` (never `Math.random`) with backtracking or retries. If no valid draw exists, explain why instead of producing a bad one.
  - Save all assignments in one transaction. Add unique constraints on `(exchange_id, giver_id)` and `(exchange_id, receiver_id)`.
- After the draw, the exchange is locked. A redraw needs explicit confirmation and replaces the assignments (warn about this in the confirmation dialog). If an assignment has retained legacy message rows, block the redraw rather than cascading deletion of that data.
- **Reveal:** When the admin marks the exchange `revealed` (or the exchange date passes, if the admin turns on auto-reveal), each person can see who their Secret Santa was.
- Write thorough Vitest tests for the draw: no self-assignment, a perfect one-to-one mapping, exclusions honored, past-year avoidance preferred, impossible inputs rejected, and thousands of random runs with 2–30 participants.

## Home page

Once signed in, the home page shows, in this order:

1. **Countdown** to the exchange date (days/hours, in the exchange's time zone), plus the **budget**.
2. **Your assignment:** "You're getting a gift for **[Name]**", with their wishlist, sizes and shipping address. Before the draw, show "Names haven't been drawn yet."
3. **Your wishlist status:** item count and a prompt if it's empty.

## Communication scope

The app has no private messaging or chat feature. Its built-in participant communication is the assigned giver's email nudge, shown only while the recipient's wishlist has no items. The legacy `message` table remains in the database to preserve schema/data, but no participant messaging UI, routes, content queries, or notifications are part of this product. Redraw performs only a row-count guard to avoid cascading deletion of retained data.

## Wishlists

- **One wishlist per person per exchange**, so past years stay intact. Offer "Copy items from last year" when a new exchange starts.
- **Each item has:**
  - a title
  - an optional link
  - optional notes (size, color, etc.)
  - an optional **price range**: a min/max amount or a bucket like `$`, `$$`, `$$$`
  - a **priority**: Most wanted / Would like / Nice to have
- Givers see items sorted by priority. Items above the exchange budget get an "Over budget" label.
- **"Surprise me":** a list-level toggle plus a free-text "Things I like" field (e.g. "coffee, hiking, cozy socks"). If it's on, the giver sees it prominently, even when the list has items.
- **Add by URL:** paste a link and a server endpoint unfurls it.
  - Title, in this order: JSON-LD `Product.name` → `og:title` → `twitter:title` → `<title>`. Also try to get `og:image`, the site name and the price.
  - Pre-fill the form with the results, let the user edit before saving, and show a loading state while fetching.
- **Unfurl safety (required):**
  - Only `http`/`https`.
  - Block private, loopback, link-local and metadata IPs, including after redirects. Allow at most 3 redirects.
  - 5-second timeout, ~1 MB max response, HTML only.
  - Rate-limit per user and cache results by normalized URL.
  - If extraction fails (Amazon often blocks scrapers), still save the link with a title the user types in.
- Users can edit, delete and reorder their own items.
- **"I'm getting this":** a giver can mark an item as claimed. The list owner must never see that marker.

## Email notifications

All emails come from Resend with React Email templates. Every email includes a link to the app and a link to manage notification preferences.

- **"You've been assigned!"** goes to every participant when the draw runs. Don't put the recipient's name in the email (people share inboxes and notifications show previews). Say "Open the app to see who you're shopping for."
- **Exchange reminders** go out 14, 7 and 1 day(s) before the exchange date.
- **Empty wishlist nudge:** after the draw, if someone has no items and "Surprise me" is off, nudge them. At most once a week, stopping once they add an item.
- **"Your recipient updated their wishlist"** goes to the giver as a daily digest of changes from the prior 24 hours, at most once per exchange-local date.
- **Scheduling:** run one daily Vercel Cron Job at `/api/cron/notifications`, protected by `CRON_SECRET`, that sends whatever is due. Run it at 15:00 UTC. Reminder milestones have independent six-day windows: 8–14 days before the exchange for the 14-day reminder, 1–7 days before for the 7-day reminder, and exchange day through five days after for the 1-day reminder. Daily checks process eligible milestones at the next run; a milestone is skipped if no cron run falls within its window. Keep empty-wishlist nudges to at most once every seven days. Make sends **idempotent**: record each send in `email_log` with a unique key (e.g. `exchange:user:type:date`) so retries or re-runs never send duplicates.
- Each user can turn off reminders, nudges and digests in Settings. Assignment emails and magic links always send.

## Add to home screen (PWA)

- Update `src/app/manifest.ts`: name, short name, `display: "standalone"`, theme and background colors from the tokens, and icons (192, 512 and a maskable version).
- Add an `apple-touch-icon`, Apple web app meta tags, and safe-area padding for iPhone notches.
- Show a small "Add to your home screen" tip on mobile: Safari on iOS gets instructions, and Android uses the `beforeinstallprompt` event. It can be dismissed and stays dismissed.
- Optional: a simple service worker with an offline fallback page. No push notifications for now.

## Past years

- A `/history` page lists your past exchanges, newest first. For each one, show who you gave to, their wishlist as it was that year, and the budget and date.
- After an exchange is revealed, also show who your Secret Santa was.

## Data model (starting point — refine as needed)

Extend `src/lib/schema.ts`. Add fields to Better Auth's `user` table with `additionalFields` so its types stay in sync.

- `user` (+ `role`, `display_name`, `shipping_address`, `sizes`, `notification_prefs`)
- `allowlist`, `invite_links`, `invite_redemptions`
- `exchanges`, `exchange_participants`, `exclusions`, `assignments`
- `wishlists` (per user per exchange, with `surprise_me` and `likes`), `wishlist_items` (`priority`, `price_min`, `price_max`, `price_bucket`), `item_claims`
- `email_log`, `unfurl_cache`, `audit_log`

The legacy `message` table is retained without messaging reads or writes; the redraw safeguard may count rows linked to assignments, but never reads or surfaces content. Do not add message functionality or drop the table without a separately reviewed data-safe migration.

## Security checklist

- Check authorization on the server for every read and write. A user sees only their own data, plus their recipient's wishlist and settings for exchanges they're in.
- Never send other people's assignments to the client.
- Protect cron and admin routes on the server.
- No secrets in client bundles. Keep `env.example` up to date.

## Deliverables

1. A working app with `pnpm dev`.
2. Schema plus migrations, and a seed script that creates fake users, one past exchange (revealed) and one current exchange.
3. An updated `README.md` covering:
   - Creating the Google OAuth client, with redirect URIs for localhost and production (`/api/auth/callback/google`).
   - Setting up Resend and verifying a sending domain.
   - Setting up the Vercel Cron Job and `CRON_SECRET`.
   - All environment variables: `POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPER_ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
4. Passing Vitest tests for:
   - the draw
   - the unfurl parser and SSRF guard
   - invite-token validation
   - email idempotency

## How to work

1. **This document is the requirements, not the task spec.** First, run the `create-spec` skill on it to generate `specs/secret-santa/` (`README.md` with waves and checkboxes, `requirements.md`, and `tasks/task-{nn}-*.md`). Include a short plan and the final schema in it. Then stop and wait for my OK.
2. **Implementation:** Once I approve, run `implement-feature` on `specs/secret-santa/`. If your environment can't spawn subagents, AGENTS.md's "use sub-agents when possible" doesn't block you. Implement each wave's tasks yourself in order, run the review step (lint, typecheck, build, tests) at the end of each wave, tick the checkboxes, and continue.
3. The waves to use when creating the spec:
   1. Strip unused starter features, then the design system: the "Fresh Snow" / "Christmas Eve" themes (tokens in `globals.css`, fonts), the Drawnames-style layout shell (header, menu, centered column), shared components (cards, panel with pine header, item card, progress nudge, "Add a wish" composer, gift tag, FAB, illustration, string lights, snowfall) and `DESIGN.md`. Stop for the review step described above before moving on.
   2. Google + magic links + allowlist + invite links + roles.
   3. Admin dashboard + exchanges + draw (with tests).
   4. Wishlists + unfurl.
   5. Home page + countdown + recipient wishlists + email nudge.
   6. Email notifications + cron.
   7. History + PWA + polish.
4. Check the current docs for Next.js 16, Tailwind CSS v4, shadcn/ui, Better Auth, Drizzle, Resend and Vercel Cron instead of relying on memory. APIs have changed recently.
