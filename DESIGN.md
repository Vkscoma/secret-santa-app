# Secret Santa Design System

This is the source of truth for the Secret Santa web app UI. Keep pages airy and friendly, with a quiet winter atmosphere and festive details used as accents. Drawnames is a layout and interaction reference only: do not reuse its brand, artwork, or product imagery.

## Stack and conventions

- Next.js App Router, React, strict TypeScript.
- Tailwind CSS v4 with CSS variables in `src/app/globals.css`; do not add `tailwind.config.ts` or another CSS library.
- Reuse shadcn/ui primitives under `src/components/ui/`; create app-specific pieces under `src/components/secret-santa/`.
- Lucide React icons, `next-themes` class-based dark mode, and `cn()` from `@/lib/utils`.
- Font: Plus Jakarta Sans via `next/font/google`, variable `--font-jakarta`.
- Use semantic theme utilities (`bg-pine`, `text-gold`, `bg-card`, `text-muted-foreground`). Avoid raw hex and arbitrary color utilities.

## Brand direction

Fresh Snow is crisp, calm, and warm. Use open whitespace, soft white cards, pine headers, cranberry actions, and candle-gold progress/details. Christmas Eve keeps a deep evergreen page, lifted pine cards, glowing cranberry and gold accents. Avoid novelty type, busy patterns, candy-cane stripes behind text, glitter, and red text on green.

### Theme tokens

Tokens live in `:root` and `.dark`, bridged through `@theme inline`. The values below are the approved starting palette. Keep body text contrast at WCAG AA (4.5:1) and large text/UI boundaries at least 3:1; adjust lightness if needed.

| Token | Fresh Snow | Christmas Eve | Use |
|---|---|---|---|
| `background` | `oklch(0.985 0.004 200)` | `oklch(0.17 0.03 175)` | Frosty page / evergreen night |
| `foreground` | `oklch(0.22 0.03 165)` | `oklch(0.96 0.01 90)` | Main copy |
| `card`, `popover` | `oklch(1 0 0)` | `oklch(0.22 0.035 168)` | Raised surfaces |
| `card-foreground`, `popover-foreground` | `oklch(0.22 0.03 165)` | `oklch(0.96 0.01 90)` | Surface copy |
| `primary` | `oklch(0.44 0.17 25)` | `oklch(0.50 0.17 25)` | Cranberry actions and active states |
| `primary-foreground` | `oklch(0.99 0.005 90)` | `oklch(0.99 0.005 90)` | Text on primary |
| `secondary` | `oklch(0.95 0.025 155)` | `oklch(0.29 0.045 162)` | Pine-tinted controls/chips |
| `secondary-foreground` | `oklch(0.31 0.07 158)` | `oklch(0.94 0.015 90)` | Text on secondary |
| `muted` | `oklch(0.965 0.006 160)` | `oklch(0.25 0.03 170)` | Quiet surfaces |
| `muted-foreground` | `oklch(0.46 0.02 160)` | `oklch(0.76 0.025 155)` | Helper/store text |
| `accent` | `oklch(0.96 0.025 25)` | `oklch(0.30 0.06 25)` | Blush/warm hover |
| `accent-foreground` | `oklch(0.34 0.13 25)` | `oklch(0.96 0.01 90)` | Text on accent |
| `border`, `input` | `oklch(0.91 0.01 170)` | `oklch(0.33 0.035 168)` | Edges and form controls |
| `ring` | `oklch(0.44 0.17 25)` | `oklch(0.64 0.19 25)` | Keyboard focus |
| `destructive` | `oklch(0.48 0.19 30)` | `oklch(0.64 0.19 28)` | Destructive actions |
| `pine` | `oklch(0.36 0.09 158)` | `oklch(0.42 0.10 155)` | Panel headers and brand |
| `pine-foreground` | `oklch(0.99 0.005 90)` | `oklch(0.99 0.005 90)` | Pine header copy |
| `gold` | `oklch(0.80 0.13 82)` | `oklch(0.85 0.14 85)` | Progress, stars, ribbons |
| `gold-foreground` | `oklch(0.28 0.05 70)` | `oklch(0.22 0.04 70)` | Copy on gold |
| `snow` | `oklch(0.97 0.01 230)` | `oklch(0.95 0.015 230)` | Decorations |

Set `--radius` to `0.75rem`. Surface and foreground pairs must retain readable contrast in both themes.

## Typography

- Plus Jakarta Sans for all UI text, loaded with `next/font/google`.
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

## Components

- **Panel header:** pine, subtle diagonal gradient and faint snowflake pattern; white title/subtitle; small settings/share actions; string-light accent below.
- **Progress nudge:** icon, concise nudge, subline and thin gold progress bar. Gold text uses `gold-foreground`.
- **Wishlist item:** square festive placeholder/image, title, muted store/domain, priority, optional note and price chips. Reorder/remove controls appear only in the owner's editor.
- **Wish composer:** URL-or-text input, editable metadata, notes, priority and price. Use a mobile bottom sheet on small screens.
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

Use `next-themes` with `attribute="class"`, `defaultTheme="system"`, and a three-way Light / Dark / System menu. Keep surfaces pine-tinted rather than neutral gray; use gold for warm accents and ensure the cranberry action foreground remains legible.
