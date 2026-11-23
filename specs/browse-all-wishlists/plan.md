# Browse All Wishlists with Anonymous Gift Claims — Implementation Plan

Status: **Open questions resolved — awaiting approval to implement.**

Decisions already confirmed:

| Decision        | Choice                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Claim model     | **One shared claim per item.** The browse view and the assigned Santa's recipient view use the same claim.      |
| Availability    | Any time the exchange is editable (not `closed`, current year), **before or after the draw**.                   |
| Draw and redraw | **Both delete all claims** in the exchange. Claims made before the draw are cleared when names are first drawn. |
| Admins          | Same rules as every other participant. No override.                                                             |
| Sizes           | Visible to every participant on the browse page. The shipping address stays visible only to the assigned Santa. |
| Label           | **"Browse wishlists"**                                                                                          |
| Entry points    | `/wishlists`, the owner page, **and** the home page exchange card                                               |

Legend used throughout: **[Exists]** already implemented · **[Reuse+]** reused with changes · **[New]** must be built.

---

## 1. Executive summary

Add an exchange-scoped **"Browse wishlists"** area at `/wishlists/[exchangeId]/people` (participant list) and `/wishlists/[exchangeId]/people/[userId]` (one person's list). It reuses the existing `RecipientGiftCard` and claim form, and the existing `item_claim` table.

The key change is semantic. Today a claim is a **private per-giver note** that only the assigned Santa can create, and several people could claim the same item. It becomes a **single exclusive claim per item** that any participant except the owner can make. Other people see it only as "Claimed"; the claimant sees "You're getting this."

- **Schema:** no new tables or columns. One index swap on `item_claim`: drop `unique(item_id, giver_id)` and add `unique(item_id)`.
- **Backend:** rewrite the one existing claim action. Add one small server-only helper module that is the only place allowed to read claims, and that never returns `giver_id`.
- **Frontend:** two new route pages, plus a three-state claim prop (`available | mine | taken`) on the existing gift card.
- **Complexity:** small to medium. About 2 new pages, 1 new lib file plus tests, 1 migration, and about 9 modified files.

---

## 2. Current architecture findings

### 2.1 Authentication and authorization

- **[Exists]** Better Auth sessions: `src/lib/auth.ts`, route handler `src/app/api/auth/[...all]/route.ts`.
- **[Exists]** Guards in `src/lib/authz.ts`. Each one re-checks the database rather than trusting the session snapshot:
  - `requireSession` checks for a session and otherwise redirects to `/login`.
  - `requireAllowlisted` checks the allowlist and otherwise redirects to `/not-allowed`.
  - `requireExchangeMember(exchangeId)` checks for an `exchange_participant` row and otherwise throws `Forbidden`.
  - `requireAdmin` and `hasCurrentAdminRole` read the role from the database.
  - `requireNonAdminExchangeMember` exists; it is used only by nudges (`src/lib/actions/nudges.ts`).
- **[Exists]** `src/lib/wishlist-access.ts` `requireEditableExchange` blocks writes when the exchange is in a past year or `closed`, or the user isn't a member.
- **[Exists]** Participants are rows in `exchange_participant` (`src/lib/schema.ts`), unique on `(exchange_id, user_id)`. Admins replace the whole set while the exchange is `open` (`setExchangeParticipants`, `src/lib/actions/admin.ts:156`).
- **[Exists]** Assignments live in `assignment` (`giver_id`, `receiver_id`), unique per giver and per receiver within an exchange. They are created by the draw in `src/lib/actions/admin.ts` (around line 215), which uses `src/lib/draw.ts`.
- Authorization lives in every Server Component and Server Action. There is no API-route layer for wishlists or claims.

### 2.2 Wishlist management

- **[Exists]** `wishlist` holds one row per `(exchange_id, user_id)` with `surprise_me` and `likes`. `wishlist_item` holds the item fields, priority, price, and sort order. Both are in `src/lib/schema.ts`.
- **[Exists]** Owner view: `src/app/wishlists/[exchangeId]/page.tsx`. It selects only the owner's `wishlist` and `wishlist_item` rows and **never reads `item_claim`**. Cards come from `wishlist-owner-gift-card.tsx`, editing from `wishlist-edit-form.tsx` and `wish-fields.tsx`.
- **[Exists]** Owner mutations in `src/lib/actions/wishlists.ts`: create, paste, update, delete, move, preferences, and copy-forward. Each one checks `requireExchangeMember`, `requireEditableExchange`, and ownership through `wishlists.userId = session.user.id`.
- **[Exists]** Assigned-Santa view: `src/app/wishlists/[exchangeId]/recipient/page.tsx`. It looks up the viewer's assignment, loads the recipient's wishlist (with sizes and shipping address), and splits items into "You're getting" and "Gift ideas" using **only the viewer's own claims**.
- **[Exists]** Home page `src/app/page.tsx` (around lines 120–200) shows a two-item preview of the recipient's list. It ranks the viewer's own claims first and renders `RecipientGiftCard` with `claimed`.
- **[Exists]** History `src/app/history/[exchangeId]/page.tsx` is read-only. It shows the recipient's items and no claims.
- Rendering components: `recipient-gift-card.tsx` (card), `recipient-gift-card-actions.tsx` (View item, claim, Undo), `claim-toggle-form.tsx` (`ClaimStatus` chip and the form that calls `toggleWishlistClaim`), and `wishlist-owner-gift-card.tsx` (owner card, no claim UI).

### 2.3 Gift claiming

- **[Exists]** Table `item_claim (id uuid, item_id → wishlist_item ON DELETE CASCADE, giver_id → user ON DELETE RESTRICT, created_at)`.
  - Its constraints are `uniqueIndex(item_id, giver_id)` and `index(giver_id)` (`src/lib/schema.ts`, migration `drizzle/0006_wild_texas_twister.sql:162`).
  - **Gap:** nothing stops two different users from claiming the same item. Today that can't happen only because a list has exactly one assigned giver.
- **[Exists]** `toggleWishlistClaim` (`src/lib/actions/wishlists.ts:293`):
  - It runs a transaction, locks the exchange row `FOR UPDATE` (which serializes it with redraw), rejects `closed` exchanges, re-checks membership, and confirms the item belongs to the exchange.
  - It blocks the owner and **requires an assignment from the viewer to the owner**.
  - Then it **toggles**: it deletes the viewer's claim if one exists, and otherwise inserts with `onConflictDoNothing`.
  - It does **not** check the year, so it doesn't use `requireEditableExchange`.
  - It throws on every error, and the client shows one generic toast.
- **[Exists]** Claims are tied to users, and only the viewer's own claims are ever read: the recipient page filters `giver_id = me`, and so does the home page.
- **[Exists]** A user can remove their own claim through the toggle. Removing someone else's claim isn't possible because the delete filters by `giver_id = me`.
- **[Exists]** Redraw deletes every claim on the exchange's items (`src/lib/actions/admin.ts:242`). Deleting a user is blocked while they have claims (`admin.ts:415`).
- **[Exists]** Admin views (`src/app/admin/exchanges/[id]/page.tsx`, `src/lib/admin-data.ts`) count items but never read `item_claim`. Notifications, cron, and nudges don't read claims either.

### 2.4 Database and API architecture

- Drizzle with Postgres. 17 migrations so far (`drizzle/0000`–`0016`). Application IDs are UUIDs generated with `crypto.randomUUID()`; Better Auth IDs are text.
- No REST endpoints cover wishlists or claims. Everything goes through Server Actions in `src/lib/actions/*` and Server Component queries.
- **The existing claim model is enough with one change:** replace the unique index. No new tables or columns are needed.

### 2.5 UI and navigation

- The app menu (`src/components/secret-santa/app-menu.tsx`) links to Home, My Wishlists, Add from your phone, History, and Settings. These are global, not per exchange.
- Pages that belong to an exchange are reached from cards on `src/app/wishlists/page.tsx` (line 200 "My List", line 222 "Recipient's list"), the home page (line 418), and the owner page (line 342).
- Shared building blocks:
  - `PageContainer` and `PageHeading` (`components.tsx`, `page-container.tsx`), plus `WishlistBreadcrumb` and `Card`.
  - `Button` with the variants `affirmative`, `neutral`, `ghost`, and so on.
  - `Badge` and the status-chip pattern (`ClaimStatus`).
  - `formatFirstName` and `possessive` from `src/lib/person-name.ts`.
- Testing uses Vitest unit tests with a mocked `db` chain (for example `src/lib/actions/nudges.test.ts`). The project has no Playwright config; the `playwright-cli` skill is available for browser QA.

---

## 3. Proposed user experience

### Placement: a dedicated nested page

The options considered were a dedicated page, a tab, or an extension of the existing list.

A **dedicated nested route under the exchange** is recommended. The owner page is already a dense two-column editor and the recipient page is tied to an assignment. Adding tabs to either would mix owner and giver concerns, and would make it easier to leak assignment context. A separate route keeps the three views (my list, my recipient, everyone) clearly separate, and each one runs its own server-side authorization.

### Flow

1. **Entry points** (neutral buttons or links named "Browse wishlists"):
   - each active exchange card on `/wishlists`;
   - the owner page, next to the existing recipient link;
   - the home page exchange card.
2. **`/wishlists/[exchangeId]/people`** shows a grid of participant cards. It is one column on phones, two columns from `sm`, and stays inside `max-w-4xl`.
   - Each card shows the person's first name, their gift count (for example "5 gift ideas" or "No ideas yet"), and "Happy to be surprised" when that applies. The whole card is a link.
   - The current user is excluded.
   - Order is alphabetical by display name. It must **never** follow assignment order.
   - There is **no "your recipient" marker**, so this view stays independent of assignments. The existing recipient page remains the way to see your assignee.
3. **`/wishlists/[exchangeId]/people/[userId]`** shows `PageHeading` with "{Name}'s wish list", the budget line, and the Things-they-like card. The surprise-me card and gift cards come next, in three groups:
   - **You're getting** (`mine`): `ClaimStatus` chip, View item, and **Undo** (`neutral`).
   - **Gift ideas** (`available`): View item and **I'll get this** (`affirmative`).
   - **Already claimed** (`taken`): a muted, non-interactive "Claimed" chip and View item. There is no claim button. This group comes last.

   Navigation between people: a breadcrumb (Home › My Wishlists › Browse wishlists › {Name}), plus a compact "Previous / Next person" pair of `neutral` links at the bottom, in the same alphabetical order. A dropdown isn't needed.

   **Sizes** appear in a "Helpful details" card, matching the recipient page. The **shipping address never appears here**; it stays on the assigned-recipient page.

4. **States:**
   - Empty participant: "No gift ideas yet — check back later." (the kind tone from the design system).
   - Exchange has only you: "You're the only one here so far."
   - Loading: `loading.tsx` with card skeletons (`ui/skeleton.tsx`).
   - Errors: the global `src/app/error.tsx`.
   - Closed or past exchange: claim controls are replaced by read-only chips through `claimable={false}`.
     - Today only the home page (`src/app/page.tsx:401`) passes `claimable`, and the recipient page never does, so closed exchanges still show claim buttons there.
     - All three pages (home, recipient, browse) compute `claimable = status !== "closed" && year >= currentYear`. Home currently gates on `drawn|revealed` and moves to the same rule.
   - **Claim conflict:** the action returns `{ ok: false, code: "taken" }`. The client shows the toast "Someone else just claimed this one." and calls `router.refresh()`, so the card moves to "Already claimed".
   - **Item removed:** `code: "gone"` produces the toast "This gift was removed from the list." and a refresh.
5. **Recipient page change** (this follows from the shared claim): items other people have claimed now show in an "Already claimed" group, using the same `taken` state. Header copy changes to: "Others only see that a gift is claimed — never who claimed it."

---

## 4. Technical implementation

### 4.1 Database **[Reuse+]**

- Keep the `item_claim` table and its foreign keys.
- In `src/lib/schema.ts`, replace `uniqueIndex("item_claim_item_giver_unique").on(itemId, giverId)` with `uniqueIndex("item_claim_item_unique").on(itemId)`. Keep `item_claim_giver_idx`.
  - The new unique index is the database-level guarantee against duplicate ownership.
  - It also makes the `(item_id, giver_id)` index redundant for lookups.
- Migration: `pnpm db:generate`, then `pnpm db:migrate` (never `push`).
  - Hand-edit the generated SQL **before** running `db:migrate`. drizzle-kit diffs against `meta/0016_snapshot.json`, so the edit survives later generates.
  - Place the dedupe `DELETE` before `CREATE UNIQUE INDEX`, separated by `--> statement-breakpoint` (see `drizzle/0015_stale_exodus.sql:17`).
  - The dedupe step is defensive and keeps the earliest claim per item:
    ```sql
    DELETE FROM item_claim a USING item_claim b
    WHERE a.item_id = b.item_id AND (a.created_at, a.id) > (b.created_at, b.id);
    ```
  - It provably deletes zero rows today. The old action required an assignment, assignments are unique per receiver, and redraw clears claims.

### 4.2 Server-only claim and browse helper **[New]** `src/lib/wishlist-browse.ts`

This is the **only** module that reads `item_claim` for display. Pages must not query the table directly.

```ts
export type ClaimState = "available" | "mine" | "taken";

// Never selects giver_id; projects `isMine` only. Silently drops items on the viewer's own list.
getClaimStates(viewerId: string, itemIds: string[]): Promise<Map<string, ClaimState>>
// SELECT ic.item_id, (ic.giver_id = $viewer) AS is_mine
// FROM item_claim ic JOIN wishlist_item wi ... JOIN wishlist w ...
// WHERE ic.item_id IN (...) AND w.user_id <> $viewer

listBrowsableParticipants(exchangeId, viewerId)
// exchange_participant JOIN user LEFT JOIN wishlist/wishlist_item counts;
// excludes viewer; returns { userId, firstName, itemCount, surpriseMe } only — no email/address/sizes.
// firstName must NOT fall back to the email local part (formatFirstName does, person-name.ts:17):
// use displayName → name → "Participant". Duplicate first names get the last initial appended.

getBrowsableWishlist(exchangeId, viewerId, ownerId)
// returns null if ownerId === viewerId or owner is not a current participant;
// returns { firstName, sizes, likes, surpriseMe, items: RecipientGiftItem[] } (explicit column list;
// never shippingAddress or email).
```

Every page and the home page use `getClaimStates`. This keeps the owner-privacy rule in one tested place, enforced on the backend. Even if a caller passes the owner's own item IDs, it gets no claim data back for them.

### 4.3 Claim action **[Reuse+]** `src/lib/actions/wishlists.ts`

Replace `toggleWishlistClaim` with `updateWishlistClaim(formData)`. It takes an explicit `intent: "claim" | "release"`. A toggle is unsafe once state is shared: a stale page could flip the claim the wrong way.

The action runs inside the existing transaction:

1. Parse `exchangeId`, `itemId`, and `intent` with Zod. Call `requireExchangeMember`.
2. `SELECT { status, year } FROM exchange FOR UPDATE`. The lock is already there; add `year` to the select, because today it reads only `status`. Reject `closed` exchanges **and past years** (new; this matches `requireEditableExchange`).
3. Re-check the viewer's membership (already there).
4. Load the item with its owner, scoped to `wishlists.exchange_id = exchangeId`, using `.for("share")`. If it's missing, return `{ ok: false, code: "gone" }`.
   - `deleteWishlistItem` takes no exchange lock, so without the share lock a concurrent delete would make the insert fail with foreign-key error 23503 instead of returning `gone`.
   - As a backstop, also catch 23503 and map it to `gone`.
5. If `owner === viewer`, return `code: "own"`. **New:** if the owner is not a current participant, return `code: "gone"`.
6. **Remove** the assignment requirement. This is the actual feature change.
7. `claim`: `INSERT … ON CONFLICT DO NOTHING RETURNING id`.
   - If no row comes back, re-read the claim's `giver_id`. If it's the viewer, return `{ ok: true }` (idempotent). Otherwise return `{ ok: false, code: "taken" }`.
   - Never return the other user's ID.
8. `release`: `DELETE … WHERE item_id = $item AND giver_id = $viewer`. If no row is deleted, still return `{ ok: true }` (idempotent). The `giver_id` filter means you can never remove someone else's claim.
9. Call `revalidatePath` for `/wishlists/${id}/recipient`, `/wishlists/${id}/people` (layout), and `/`.

It returns `{ ok: true } | { ok: false; code: "taken" | "gone" | "own" | "closed" }` instead of throwing for expected outcomes. That lets the UI show a specific toast.

Concurrency has two layers. The exchange row lock serializes claim writes within an exchange, and the `unique(item_id)` index is the backstop if that lock is ever removed.

### 4.4 Related backend adjustments **[Reuse+]**

- **Draw and redraw** (`admin.ts:~215–250`): move the `delete itemClaims … inArray(exchangeWishlistItems)` statement **out of the `if (redraw)` block**, so it runs on both the first draw and a redraw. It stays inside the same locked transaction.
  - The redraw copy at `admin/exchanges/[id]/page.tsx:415` already says marked gifts will be cleared. Reword it to "all gift claims will be cleared".
  - Add similar copy to the first-draw confirmation: "Drawing names clears any gifts people have already claimed."
- **Participant edits** (`setExchangeParticipants`, `admin.ts:156`): claims are now possible before the draw.
  - Inside the existing locked transaction, run `delete itemClaims where itemId in (this exchange's items) and giverId not in (participantIds)`.
  - Removed users' claims would otherwise keep blocking items for everyone, and those users could no longer release them.
  - With an empty participant list, `notInArray([])` is true, so every claim is deleted. That is the intended result, and it needs a test.
  - Also add `revalidatePath` for `/wishlists/${id}/people`; today only the admin path is revalidated.
- **Owner page, admin, history, notifications:** no change. Add regression tests that assert they don't read claim data (see §8).

### 4.5 Frontend **[Reuse+ / New]**

- `claim-toggle-form.tsx`:
  - Add a hidden `intent` input and call `updateWishlistClaim`.
  - Map the result codes to toasts, then `router.refresh()`.
  - `previewMode` stays as it is.
- `recipient-gift-card-actions.tsx` and `recipient-gift-card.tsx`:
  - Replace `claimed: boolean` with `claimState: ClaimState`.
  - `taken` renders a muted "Claimed" status chip (non-interactive, following the design system's status-chip rule) and View item.
  - The chip also appears in the `!claimable` branch (`recipient-gift-card-actions.tsx:43-53`). Without it, a taken item in a closed exchange would read "Claiming is unavailable".
  - `previewClaimed` state (`:40`) becomes three-state.
  - The only preview caller is `src/app/preview/home/page.tsx:31`. `preview/wishlists/**` doesn't pass `claimed`.
- `src/app/wishlists/[exchangeId]/recipient/page.tsx`: use `getClaimStates` and add the "Already claimed" group. Assignment logic is unchanged.
- `src/app/page.tsx`:
  - Use `getClaimStates` for the preview cards so `taken` items don't show "I'll get this."
  - **Required:** the ranking subquery (`page.tsx:145`) adds a rank term that sorts `taken` items last. Otherwise both preview slots can fill with "Claimed" items.
    - Use an inline `exists(select 1 from item_claim where item_id = … and giver_id <> me)`. It yields only a rank, never an ID.
    - This is the one approved claim read outside `wishlist-browse.ts`.
- **[New]** pages:
  - `src/app/wishlists/[exchangeId]/people/page.tsx`
  - `src/app/wishlists/[exchangeId]/people/[userId]/page.tsx`
  - `src/app/wishlists/[exchangeId]/people/loading.tsx`

  Both pages:
  - validate the UUID format of `exchangeId`, and validate `userId` by reusing `userIdSchema` (`admin.ts:36`);
  - call `requireExchangeMember`;
  - call `notFound()` when `getBrowsableWishlist` returns `null` (self, non-participant, or another exchange), so a missing user and an outsider look the same;
  - redirect `userId === me` to `/wishlists/[exchangeId]`.

- **[New]** `src/components/secret-santa/participant-card.tsx`: a link card with name, count, and the surprise-me hint.
- Entry links in `src/app/wishlists/page.tsx`, `src/app/wishlists/[exchangeId]/page.tsx`, and `src/app/page.tsx` (home exchange card, near the recipient link at `:418`).
- **Data passed to client components** is limited to explicit, mapped fields. Never pass raw `select()` rows from `user`, `assignment`, or `item_claim` across the Server-to-Client boundary.

---

## 5. File-by-file change plan

| File                                                          | Type                  | Change                                                                                                                                               |
| ------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/schema.ts`                                           | Reuse+                | Swap the `item_claim` unique index to `(item_id)`                                                                                                    |
| `drizzle/0017_*.sql` + meta                                   | New (generated)       | Generated index swap, with the dedupe `DELETE` added before it                                                                                       |
| `src/lib/wishlist-browse.ts`                                  | New                   | `ClaimState`, `getClaimStates`, `listBrowsableParticipants`, `getBrowsableWishlist`                                                                  |
| `src/lib/wishlist-browse.test.ts`                             | New                   | Unit tests (§8)                                                                                                                                      |
| `src/lib/actions/wishlists.ts`                                | Reuse+                | `toggleWishlistClaim` becomes `updateWishlistClaim` (intent, result codes, no assignment check, year check, owner-participant check, revalidation)   |
| `src/lib/actions/wishlist-claims.test.ts`                     | New                   | Action tests (§8)                                                                                                                                    |
| `src/lib/actions/admin.ts`                                    | Reuse+                | `setExchangeParticipants` deletes removed users' claims in the exchange; the first draw now clears claims too (statement moved out of `if (redraw)`) |
| `src/app/admin/exchanges/[id]/page.tsx`                       | Reuse+                | Redraw copy (`:415`) becomes "all gift claims will be cleared"; add matching copy to the first-draw confirmation                                     |
| `src/components/secret-santa/claim-toggle-form.tsx`           | Reuse+                | Intent input, new action, result-code toasts                                                                                                         |
| `src/components/secret-santa/recipient-gift-card-actions.tsx` | Reuse+                | `claimState` prop and `taken` rendering                                                                                                              |
| `src/components/secret-santa/recipient-gift-card.tsx`         | Reuse+                | Pass `claimState` through                                                                                                                            |
| `src/app/wishlists/[exchangeId]/recipient/page.tsx`           | Reuse+                | `getClaimStates`, "Already claimed" group, copy                                                                                                      |
| `src/app/page.tsx`                                            | Reuse+                | Three-state claims for the recipient preview, optional entry link                                                                                    |
| `src/app/wishlists/page.tsx`                                  | Reuse+                | "Browse wishlists" link per active exchange                                                                                                          |
| `src/app/wishlists/[exchangeId]/page.tsx`                     | Reuse+                | "Browse wishlists" link near the recipient link (no claim reads)                                                                                     |
| `src/app/wishlists/[exchangeId]/people/page.tsx`              | New                   | Participant grid                                                                                                                                     |
| `src/app/wishlists/[exchangeId]/people/[userId]/page.tsx`     | New                   | One person's list with claim controls and previous/next links                                                                                        |
| `src/app/wishlists/[exchangeId]/people/loading.tsx`           | New (optional for v1) | Skeletons                                                                                                                                            |
| `src/components/secret-santa/participant-card.tsx`            | New                   | Participant link card                                                                                                                                |
| `src/app/preview/home/page.tsx`                               | Reuse+                | Update the `claimed` prop to `claimState` (the only preview caller)                                                                                  |
| `DESIGN.md`                                                   | Reuse+                | Add rows to the button table ("Browse wishlists" → `neutral`; I'll get this and Undo reused) and the "Claimed" chip                                  |

No new dependencies.

---

## 6. Authorization matrix

All rows assume an authenticated, allowlisted user. "Participant" means a current `exchange_participant` row in **this** exchange.

| Capability                                | Wishlist owner (own list)                                                                                           | Assigned Santa (for that owner)       | Other participant                     | Non-participant / other exchange |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------- | -------------------------------- |
| See the participant list                  | Yes (self excluded)                                                                                                 | Yes                                   | Yes                                   | No (Forbidden)                   |
| View the list's items, likes, surprise-me | Yes, on their own owner page                                                                                        | Yes (recipient page and browse page)  | Yes (browse page)                     | No (404)                         |
| View sizes                                | Own profile                                                                                                         | Yes (recipient page and browse page)  | Yes (browse page)                     | No                               |
| View shipping address                     | Own profile                                                                                                         | Yes, recipient page only              | **No**                                | No                               |
| See whether an item is claimed            | **Never** (enforced in `getClaimStates` and absent from owner queries)                                              | Yes (`available`, `mine`, or `taken`) | Yes (`available`, `mine`, or `taken`) | No                               |
| See **who** claimed an item               | Never                                                                                                               | Only "mine"                           | Only "mine"                           | No                               |
| Claim an available item                   | **No** (`own`)                                                                                                      | Yes                                   | Yes                                   | No                               |
| Release a claim                           | n/a                                                                                                                 | Own claims only                       | Own claims only                       | No                               |
| Release someone else's claim              | No                                                                                                                  | No                                    | No                                    | No                               |
| Edit, delete, or reorder items            | Yes                                                                                                                 | No                                    | No                                    | No                               |
| See assignments                           | Own giver only after reveal (history), as today                                                                     | Own recipient only                    | Own recipient only                    | No                               |
| Admin (participant)                       | Same as their role in the row above. Admin pages show no claim data. Super Admin private pairing view is unchanged. | —                                     | —                                     | —                                |

---

## 7. Security and privacy considerations

- **Claimant anonymity:** `giver_id` never leaves the server. `getClaimStates` projects only `is_mine`, and the action never echoes another user's ID. A grep-based test fails if `itemClaims` is read outside `wishlist-browse.ts`, `actions/wishlists.ts`, `actions/admin.ts`, and the home ranking subquery.
- **Owner privacy (backend):**
  - The owner page doesn't query claims.
  - `getClaimStates` filters out the viewer's own items in SQL.
  - Browse routes refuse `userId === me`.
  - The action refuses owner claims.
  - Revalidation doesn't push claim data to the owner page, because that page never loads it.
- **Assignment anonymity:**
  - The browse pages and `wishlist-browse.ts` never query `assignment`. Ordering is alphabetical.
  - There's no recipient badge, and gift counts are the same for everyone.
  - The only existing reads of `assignment` stay viewer-scoped (`giver_id = me`).
- **Scoping:** every query joins `wishlist.exchange_id = :exchangeId` and checks that the viewer and the owner are participants. An item ID from another exchange returns `gone` or 404.
- **Direct action calls:** every rule lives in the Server Action, so a crafted POST gets the same checks as the UI.
- **Inference limits you should accept:**
  - Anyone can see that a list has claimed items, and participants could tell the owner. That's social, not technical.
  - "Taken" on your recipient's list tells the assigned Santa that someone else is buying for them. That's the point of the feature.
- **Caching:** these pages read session-dependent data in dynamic Server Components, the same as the existing pages, so nothing is cached across users. Do not add `"use cache"` or static generation to the browse routes.

---

## 8. Edge cases and testing strategy

| Edge case                                          | Handling                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Two users claim at the same moment                 | The exchange row lock serializes them and `unique(item_id)` backs that up. The loser gets `taken`, a toast, and a refresh.               |
| Claiming your own item                             | The action returns `own`. The UI never shows the control, and the route redirects.                                                       |
| Removing someone else's claim                      | The delete filters `giver_id = me`, so nothing is deleted and the UI never offers it.                                                    |
| Another exchange's item or list                    | The scoped join returns `gone` or 404. Browse pages require membership.                                                                  |
| An item is deleted after it's claimed              | `ON DELETE CASCADE` removes the claim. A claim attempt returns `gone`. The claimant's next page load no longer shows the item.           |
| The owner edits a claimed item into something else | Out of scope. The claim stays (note it as a known limitation).                                                                           |
| Claim status exposed to the owner                  | Owner queries never read claims, and `getClaimStates` excludes own items (tested).                                                       |
| Assignment leaks through responses                 | Browse code never touches `assignment`, and returned objects have fixed shapes (tested).                                                 |
| Stale status with several people browsing          | Explicit intents with idempotent results, a conflict toast, and `router.refresh()`. Real-time updates aren't needed at this scale.       |
| A participant is removed before the draw           | Their claims in the exchange are deleted, and their list disappears from browse.                                                         |
| First draw or redraw                               | All claims are cleared (as decided). Claimants find their items available again. Add an admin-action test that both paths delete claims. |
| Closed or past-year exchange                       | The action returns `closed`. Cards render read-only.                                                                                     |
| Admin delete-user                                  | Still blocked while the user has claims (existing check).                                                                                |

**Unit and integration tests (Vitest, mocked `db` like `nudges.test.ts`):**

- `updateWishlistClaim`:
  - claim succeeds;
  - a second user gets `taken`;
  - claiming again is idempotent;
  - the owner gets `own`;
  - a non-member is Forbidden;
  - an owner who isn't a participant gives `gone`;
  - an item from another exchange gives `gone`;
  - a closed or past exchange gives `closed`;
  - releasing your own claim deletes only your row;
  - releasing someone else's claim leaves it in place;
  - the result never includes a user ID;
  - no assignment lookup is made.
- `getClaimStates`:
  - maps `mine`, `taken`, and `available`;
  - drops the viewer's own items;
  - the selected columns never include `giverId`.
- `listBrowsableParticipants` and `getBrowsableWishlist`:
  - exclude self;
  - exclude non-participants;
  - return no email or shipping address (sizes only from `getBrowsableWishlist`);
  - never reference `assignments`.
- `setExchangeParticipants` removes claims for removed users.
- Existing suites stay green (`admin-delete-*.test.ts`, `draw.test.ts`, `nudges.test.ts`).

**Database check:** run `pnpm db:generate` and `pnpm db:migrate` against the dev database, then confirm with a manual SQL test that a second `INSERT` for the same `item_id` fails.

**End-to-end (browser QA with the `playwright-cli` skill, seeded with `pnpm db:seed`; three users A, B, C in one exchange):**

1. A browses B and claims an item, and sees "You're getting this."
2. C browses B and sees "Claimed" with no button. C's claim from a stale tab shows the conflict toast.
3. B's own list shows no claim indicators. B can't open `/people/<B>` (redirect), and a direct action POST returns `own`.
4. A releases the claim and C can then claim it.
5. B's assigned Santa sees the same three states on the recipient page and the home preview.
6. A user from another exchange gets 404 or Forbidden.
7. Check mobile width (375px) and desktop, both themes, and keyboard focus.

**Quality gates after each phase:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

---

## 9. Implementation phases

**Phase 1: Data and backend.** This blocks everything else.

- Index swap and migration, `wishlist-browse.ts`, `updateWishlistClaim`, the participant-claim cleanup, and their tests.
- _Accept when:_
  - the migration applies cleanly;
  - every §8 unit test passes;
  - a duplicate insert fails at the database level;
  - lint, typecheck, and test pass.

**Phase 2: Shared UI and regressions.** Can run in parallel with Phase 3 once Phase 1 is merged.

- The `claimState` prop, the claim form, the recipient page, the home page, and the preview pages.
- _Accept when:_
  - the assigned-Santa flow works as before;
  - items claimed by others show "Claimed" everywhere;
  - no "I'll get this" button appears on taken items.

**Phase 3: Browse pages.** Can run in parallel with Phase 2.

- The `people` routes, the participant card, loading skeletons, and entry links.
- _Accept when:_
  - every user can browse every other participant in their exchange;
  - self and outsiders are blocked;
  - empty and conflict states render;
  - the layout follows DESIGN.md on phone and desktop.
  - When Phase 3 is done, run the impeccable skill on the new and changed UI
  - only: /wishlists/[exchangeId]/people, the person page, the participant card, the "Claimed" chip and "Already claimed" group, and the new "Browse wishlists" links on home, /wishlists and the
    owner page.
  - Check against DESIGN.md in both themes at 375px and desktop. Fix issues, but don't change backend logic or claim behavior. Then continue to Phase 4.

**Phase 4: Documentation and QA.**

- DESIGN.md table rows, the redraw copy check, browser QA of the end-to-end script, and `pnpm build`.
- _Accept when:_ all end-to-end steps pass in both themes and all gates are green.

---

## 10. Open questions

All resolved (see the decisions table at the top):

1. Sizes are visible to all participants on the browse page; the shipping address is not.
2. The first draw also clears claims.
3. The label is "Browse wishlists".
4. The home page gets an entry link.
