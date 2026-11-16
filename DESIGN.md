# Secret Santa Design System

This is the source of truth for the Secret Santa web app UI. Keep pages airy and friendly, with a quiet winter atmosphere and festive details used as accents. Drawnames is a layout and interaction reference only: do not reuse its brand, artwork, or product imagery.

## Stack and conventions

- Next.js App Router, React, strict TypeScript.
- Tailwind CSS v4 with CSS variables in `src/app/globals.css`; do not add `tailwind.config.ts` or another CSS library.
- Reuse shadcn/ui primitives under `src/components/ui/`; create app-specific pieces under `src/components/secret-santa/`.
- Lucide React icons, `next-themes` class-based dark mode, and `cn()` from `@/lib/utils`.
- Font: locally bundled Geist via `next/font/local`, exposed as `--font-jakarta`.
- Use semantic theme utilities (`bg-pine`, `text-gold`, `bg-card`, `text-muted-foreground`). Avoid raw hex and arbitrary color utilities.

## Brand direction

Fresh Snow is crisp, calm, and warm. Use open whitespace, soft white cards, pine headers, pine affirmative actions, and candle-gold progress/details. Cranberry is a brand accent for the logo, illustrations, and decoration (`cranberry` token). Christmas Eve keeps a deep evergreen page, lifted pine cards, and gold accents. Red is reserved for destructive actions and errors. Avoid novelty type, busy patterns, candy-cane stripes behind text, and glitter.

### Theme tokens

Tokens live in `:root` and `.dark`, bridged through `@theme inline`. The values below are the approved starting palette. Keep body text contrast at WCAG AA (4.5:1) and large text/UI boundaries at least 3:1; adjust lightness if needed.

| Token | Fresh Snow | Christmas Eve | Use |
|---|---|---|---|
| `background` | `oklch(0.985 0.004 200)` | `oklch(0.17 0.03 175)` | Frosty page / evergreen night |
| `foreground` | `oklch(0.22 0.03 165)` | `oklch(0.96 0.01 90)` | Main copy |
| `card`, `popover` | `oklch(1 0 0)` | `oklch(0.22 0.035 168)` | Raised surfaces |
| `card-foreground`, `popover-foreground` | `oklch(0.22 0.03 165)` | `oklch(0.96 0.01 90)` | Surface copy |
| `primary` | `var(--pine)` → `oklch(0.36 0.09 158)` | Pine border green `oklch(0.62 0.10 155)` | Affirmative outline border and hover tint |
| `primary-foreground` | `var(--pine-foreground)` → `oklch(0.99 0.005 90)` | Pine-ink `oklch(0.14 0.04 155)` | Copy on decorative pine fills; not used on Button surfaces |
| `affirmative-text` | `var(--primary)` → `oklch(0.36 0.09 158)` | `oklch(0.72 0.10 155)` | Pine label text on affirmative outlines |
| `cranberry` | `oklch(0.44 0.17 25)` | `oklch(0.67 0.17 25)` | Logo and decorative brand accents only |
| `cranberry-foreground` | `oklch(0.997 0 0)` | `oklch(0.12 0.06 25)` | Contrast on cranberry decoration |
| `secondary` | `oklch(0.95 0.025 155)` | `oklch(0.59 0.10 155)` | Pine-tinted controls/chips |
| `secondary-foreground` | `oklch(0.31 0.07 158)` | `oklch(0.12 0.05 155)` | Text on secondary |
| `muted` | `oklch(0.965 0.006 160)` | `oklch(0.25 0.03 170)` | Quiet surfaces |
| `muted-foreground` | `oklch(0.46 0.02 160)` | `oklch(0.76 0.025 155)` | Helper/store text |
| `accent` | `oklch(0.96 0.025 25)` | `oklch(0.62 0.11 25)` | Blush/warm hover |
| `accent-foreground` | `oklch(0.34 0.13 25)` | `oklch(0.12 0.08 25)` | Text on accent |
| `border`, `input` | `oklch(0.91 0.01 170)` | `oklch(0.58 0.035 168)` | Edges and form controls |
| `neutral-border` | `oklch(0.62 0.008 170)` | `oklch(0.54 0.008 165)` | Muted gray neutral button outlines on page and card surfaces; contrast ≥3:1 |
| `neutral-panel-border` | `oklch(0.65 0.008 170)` | `oklch(0.72 0.008 165)` | Muted gray neutral button outlines on pine panels; contrast ≥3:1 |
| `ring` | `oklch(0.48 0.10 195)` | `oklch(0.54 0.10 195)` | Teal winter keyboard focus |
| `destructive` | `oklch(0.48 0.19 30)` | `oklch(0.68 0.19 28)` | Destructive actions |
| `destructive-foreground` | `oklch(0.99 0.005 90)` | `oklch(0.18 0.06 28)` | Copy on decorative error fills |
| `destructive-text` | `var(--destructive)` → `oklch(0.48 0.19 30)` | `oklch(0.72 0.19 28)` | Destructive button label and border |
| `pine` | `oklch(0.36 0.09 158)` | `oklch(0.42 0.10 155)` | Panel headers and brand |
| `pine-foreground` | `oklch(0.99 0.005 90)` | `oklch(0.99 0.005 90)` | Pine header copy |
| `gold` | `oklch(0.80 0.13 82)` | `oklch(0.85 0.14 85)` | Progress, stars, ribbons |
| `gold-foreground` | `oklch(0.28 0.05 70)` | `oklch(0.22 0.04 70)` | Copy on gold |
| `snow` | `oklch(0.97 0.01 230)` | `oklch(0.95 0.015 230)` | Decorations |
| `success` | `oklch(0.52 0.17 150)` | `oklch(0.75 0.15 150)` | Success indicators |

Set `--radius` to `0.75rem`. Surface and foreground pairs must retain readable contrast in both themes.

Use a teal winter focus ring in both themes. Validation errors and destructive actions use destructive red. Destructive controls have no fill, use red text and a matching icon, and keep a red outline. Button surfaces are transparent at rest; hover and pressed states may use a subtle tint of the action color.


## Button intent

Every app button uses an outline style at rest: transparent background, with color communicating intent. There are no filled buttons. Affirmative actions use a 2px pine border, semibold pine text, and a subtle pine tint on hover/press. Neutral actions use a 1px muted gray border and standard foreground text. On pine panels, the `neutral-inverse` context variant keeps a muted gray border and readable pine-panel foreground; its border brightens on hover/press. Destructive actions use a red border, red text, and a trash icon where space allows. Red is reserved for destructive actions and errors. `ghost` is reserved for low-emphasis or icon-only controls and has a visible hover and focus state. Hover and pressed states may use a subtle tint; at rest every button background is transparent.

**One intentional exception — mobile add FAB:** `MobileAddWishButton` is a separate component, not a `Button` variant. It uses a filled cranberry circle with a light plus so the primary add action stays visible above scrolling content. This brand accent is the sole filled button and the sole non-destructive red-family exception in the web app. It is excluded from the button color regression scan by `data-button-system-exception="mobile-fab"`; keep its non-red focus ring, darker pressed state, cranberry-token contrast, and safe-area-aware list padding intact. The minimum icon/fill ratio is 3.23:1 in dark mode (8.49:1 light); cranberry fill/surface is at least 4.48:1 in dark mode (6.93:1 light), including hover and pressed states.

**One intentional exception — email call to action:** emails are not the web app. Each email has exactly one main action, rendered by the shared `EmailButton` in `src/emails/email-button.tsx` as a filled cranberry button with a white bold label, matching the approved email reference. The reason: email clients cannot render the app `Button`, an outline button is easy to miss in an inbox, and a filled button is the most reliable, recognisable action across Gmail, Apple Mail, Outlook, and mobile mail apps. It uses a hard-coded cranberry fill `#953837` (email clients do not support CSS variables) with `#ffffff` text at 7.2:1, no border, a 9px radius, `15px 28px` padding, and a 50px tap height. This is the one non-destructive use of red outside the web app; the rest of the email layout (pine header `#204234`, gold divider `#cca556`, page `#f2f6f3`, footer `#f7f9f7`, heading `#213028`) also uses fixed hex values from that reference. It is a table-based "bulletproof" button with inline styles and a VML fallback for desktop Outlook. Emails declare a light-only color scheme; the dark fill with a light label stays readable where a client forces dark mode. Below the button, every email repeats the URL as small muted text ("Button not working? Copy and paste this link:"). Any secondary link in an email stays a plain text link. `src/emails/` is excluded from the outline-only button regression search; this exception never applies to web app buttons.

Radio option controls are not action buttons: keep their backgrounds transparent, and show selection with a heavier neutral outline and semibold text rather than a filled chip.

Use `src/components/ui/button.tsx` as the only app button style source. Every new app button must use one of its intent variants: `affirmative`, `neutral`, `neutral-inverse` for neutral controls on pine panels, `destructive`, or `ghost`. There is no link-style Button variant; use a plain navigation link or the shared `neutral` variant. Do not add color utilities or hex colors to Button call sites. Email-rendered CTAs use the shared filled `EmailButton` (the documented email exception above) because email clients cannot render the app component. Pending states keep the selected outline variant, disable the control, and show a spinner and concise pending copy. Disabled controls use reduced opacity and cannot be focused or clicked. Focus rings use the non-red theme ring.

| Location | Action | Variant |
|---|---|---|
| Sign-in and invite join | Continue with Google, Join | `affirmative` |
| Header/profile | Sign in, Sign up | `affirmative` |
| Sign-in and invite join | Email sign-in, Cancel | `neutral` |
| Wishlist composer and picker | Add wish, Add here | `affirmative` |
| Mobile wishlist | Floating “Add a wish” FAB | `MobileAddWishButton` (intentional filled-cranberry exception) |
| Wishlist composer and picker | Paste, Add photo, Add another wish | `neutral` |
| Wishlist editor and preferences | Save changes, Save preferences | `affirmative` |
| Wishlist editor and preferences | Edit/Close, Cancel, Open product link, Refresh, reorder | `neutral` |
| Wishlist editor and preferences | Remove | `destructive` |
| Recipient gift cards | I’ll get this | `affirmative` |
| Recipient gift cards | View item, Undo | `neutral` |
| Profile | Save profile/preferences | `affirmative` |
| Profile and preferences | Back, edit/settings, close | `neutral` |
| Admin forms | Create, Add, Save, Draw, Reveal, reminders | `affirmative` |
| Admin exchange/account actions | View, Close | `neutral` |
| Admin exchange/account actions | Remove, Revoke, Redraw/Delete in the collapsed Danger zone | `destructive` |
| Menus, navigation, dismiss controls | Menu items, theme, close icons | `neutral` or `ghost` |
| Pine panels | Settings, share, nudge | `neutral-inverse` |
| History and help | View saved list, Back home, external/help links | `neutral` or plain navigation link |
| Email notifications | Sign in to Secret Santa, Open Secret Santa, Open your wish list | `EmailButton` (intentional filled-cranberry exception) |

### Button contrast ratios

Ratios are computed from the current OKLCH tokens against the page, card, and muted surfaces, including hover/pressed tint states. `neutral-inverse` is measured on pine panels. Borderless ghost buttons have no component border; focus uses the shared non-red `ring` token.

| Variant | Fresh Snow text | Fresh Snow border | Christmas Eve text | Christmas Eve border | Result |
|---|---:|---:|---:|---:|---|
| Affirmative (pine; including tint states) | 7.63:1 | 7.63:1 | 5.87:1 | 4.02:1 | Pass |
| Neutral (muted gray) | 15.54:1 | 3.28:1 | 14.09:1 | 3.14:1 | Pass |
| Destructive (red; including tint states) | 5.26:1 | 5.26:1 | 5.22:1 | 5.22:1 | Pass |
| Neutral-inverse (on pine panels) | 10.05:1 | 3.21:1 | 7.83:1 | 3.26:1 | Pass |
| Ghost (muted text, hover foreground) | 6.38:1 | N/A | 7.45:1 | N/A | Pass |

Status chips such as “Would like,” “Most wanted,” and “You’re getting this” are non-interactive labels: use a small rounded-rectangle shape, soft tinted background, no border, smaller text, and no hover state. Success chips use the soft `success` tint and remain distinct from affirmative buttons.

## Typography

- Geist for all UI text, loaded locally with `next/font/local` so production builds do not depend on Google Fonts availability.
- Headings are 700–800 weight; body copy 400–500; countdown numbers use bold tabular figures.
- Page titles: 30–36px; section titles: 18–22px; body: 14–16px; labels/helper text: 12–14px.
- Use sentence case and short, friendly copy.

## Layout and spacing

- Sticky translucent header with subtle lower border/shadow; app content centered at about 960px (up to `max-w-6xl` when an illustration is present).
- Phone layouts use full width with 16px gutters. Desktop uses one main column with a small right-side illustration only when space permits.
- Standard content: `mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12`.
- Cards use 12px corners, thin borders, generous padding and a soft shadow. Keep 16–24px between sections.
- Wishlist editor is two columns on desktop; on phones the list panel comes before the composer and the floating plus button opens the composer in a bottom sheet.
- Support `env(safe-area-inset-bottom)` for phone overlays.
- Admin exchange detail uses the shared five-step progress tracker (`Created` → `People invited` → `Wishlists in progress` → `Names drawn` → `Revealed / gift day`) on both the admin list and exchange detail. Show one next action near the top; after the draw, replace editable setup panels with one read-only setup summary and keep redraw/delete in a collapsed Danger zone with exact-name confirmation.
- Before public reveal, only the Super Admin may check or privately view pairings. Pairing checks return aggregate rule results without names. A private view requires an explicit warning confirmation, is served as a no-store response, and records an activity event without pairing data; it never changes the public reveal state.
- Always label and display the configured exchange date/time as **Gift day**, including the exchange time zone. Do not change its stored value, default, or calculation as part of display refinements.

## Components

- **Panel header:** pine, subtle diagonal gradient and faint snowflake pattern; white title/subtitle; small settings/share actions with pine-foreground icons on a 12% pine-foreground surface and a full pine-foreground outline; string-light accent below.
- **Progress nudge:** icon, concise nudge, subline and thin gold progress bar. Gold text uses `gold-foreground`.
- **Wishlist item:** square festive placeholder/image, title, muted store/domain, priority, optional note and price chips. Reorder controls sit on the owner's card toolbar; gift editing opens from a clear pencil button, and Remove stays with the edit actions.
- **Wish composer:** URL-or-text input, editable metadata, notes, priority and price. Use a mobile bottom sheet on small screens.
- **Form action row:** use the shared `FormActionRow`. On phones, stack primary first at full width, secondary next at full width, then a separated destructive action. On wider screens, place destructive actions on the left and secondary/primary actions on the right. Keep related buttons at least 44px tall with a consistent radius.
- **Gift tag:** notched/tag silhouette with punched hole, fine gold line, and warm dark-mode glow.
- **Empty state:** helpful and kind; e.g. “Your list is as empty as Santa’s sleigh on Dec 26.”
- **Illustration:** original inline SVG/simple shapes only; hide on phones and adapt colors for dark mode.
- Use supplied button/card/input/textarea/badge/dialog/dropdown primitives where possible; preserve keyboard focus, accessible names, and visible focus rings.

## Festive details and motion

- String-light dots use cranberry, pine and gold; glow softly in dark mode.
- CSS snowfall is decorative and never sits behind body copy. It is off in light mode, may appear behind the Home hero in dark mode, and is disabled by `prefers-reduced-motion`.
- Twinkle and snowfall use CSS only. Disable animation when reduced motion is requested. Decorations must not carry meaning.
- Use `bg-snow`, `text-gold`, and semantic colors rather than hard-coded colors.

## Dark mode

Use `next-themes` with `attribute="class"`, `defaultTheme="system"`, and a three-way Light / Dark / System menu. Keep surfaces pine-tinted rather than neutral gray; use gold for warm accents and keep pine affirmative buttons distinct from muted status chips and destructive red.
