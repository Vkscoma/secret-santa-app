import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ArrowRight, CalendarDays, Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { ProductImage } from "@/components/secret-santa/product-image";
import { safeRecipientProductImageUrl } from "@/components/secret-santa/recipient-gift-card";
import { WishlistBreadcrumb } from "@/components/secret-santa/wishlist-breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatFirstName, possessive } from "@/lib/person-name";
import {
  assignments,
  exchangeParticipants,
  exchanges,
  user,
  wishlistItems,
  wishlists,
} from "@/lib/schema";

function formatBudget(minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return "Not set";
  if (minimum === null) return `Up to $${maximum}`;
  if (maximum === null) return minimum === 0 ? "No limit" : `At least $${minimum}`;
  if (minimum === maximum) return `$${maximum}`;
  return `$${minimum}–$${maximum}`;
}

function statusLabel(status: string) {
  if (status === "drawn" || status === "revealed") return "Names drawn";
  if (status === "open") return "Names not drawn";
  return "Closed";
}

export default async function WishlistsPage() {
  const session = await requireAllowlisted();
  const currentYear = new Date().getFullYear();
  const rows = await db
    .select({
      id: exchanges.id,
      name: exchanges.name,
      year: exchanges.year,
      status: exchanges.status,
      exchangeAt: exchanges.exchangeAt,
      timeZone: exchanges.timeZone,
      budgetMin: exchanges.budgetMin,
      budgetMax: exchanges.budgetMax,
      itemCount: sql<number>`(
        select count(*)::int
        from ${wishlists}
        inner join ${wishlistItems} on ${wishlistItems.wishlistId} = ${wishlists.id}
        where ${wishlists.exchangeId} = ${exchanges.id}
          and ${wishlists.userId} = ${session.user.id}
      )`,
    })
    .from(exchangeParticipants)
    .innerJoin(exchanges, eq(exchangeParticipants.exchangeId, exchanges.id))
    .where(eq(exchangeParticipants.userId, session.user.id))
    .orderBy(desc(exchanges.year));

  const activeRows = rows.filter((exchange) => exchange.year >= currentYear);
  const pastRows = rows.filter((exchange) => exchange.year < currentYear);
  const activeIds = activeRows.map(({ id }) => id);

  const [giftRows, recipientRows] = activeIds.length
    ? await Promise.all([
        db
          .select({
            exchangeId: wishlists.exchangeId,
            title: wishlistItems.title,
            imageUrl: wishlistItems.imageUrl,
          })
          .from(wishlists)
          .innerJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
          .where(
            and(eq(wishlists.userId, session.user.id), inArray(wishlists.exchangeId, activeIds))
          )
          .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt)),
        db
          .select({
            exchangeId: assignments.exchangeId,
            displayName: user.displayName,
            fullName: user.name,
            email: user.email,
          })
          .from(assignments)
          .innerJoin(user, eq(assignments.receiverId, user.id))
          .where(
            and(
              eq(assignments.giverId, session.user.id),
              inArray(assignments.exchangeId, activeIds)
            )
          ),
      ])
    : [[], []];

  const giftsByExchange = new Map<string, typeof giftRows>();
  for (const gift of giftRows) {
    const exchangeGifts = giftsByExchange.get(gift.exchangeId) ?? [];
    exchangeGifts.push(gift);
    giftsByExchange.set(gift.exchangeId, exchangeGifts);
  }
  const recipientsByExchange = new Map(
    recipientRows.map((recipient) => [
      recipient.exchangeId,
      formatFirstName(recipient.displayName, recipient.fullName, recipient.email),
    ])
  );

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <WishlistBreadcrumb items={[{ label: "Home", href: "/" }, { label: "My Wishlists" }]} />
      <PageHeading
        eyebrow={`${currentYear} holiday exchanges`}
        title="My Wishlists"
        description="Open your list to add gift ideas, or see what your recipient wants."
      />

      {activeRows.map((exchange) => {
        const gifts = giftsByExchange.get(exchange.id) ?? [];
        const recipientName = recipientsByExchange.get(exchange.id);
        const giftDay = new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: exchange.timeZone,
        }).format(exchange.exchangeAt);
        const progressCount = Math.min(exchange.itemCount, 3);
        const progressValue = (progressCount / 3) * 100;
        const progressLabel =
          exchange.itemCount > 3
            ? `${exchange.itemCount} gifts`
            : `${exchange.itemCount} of 3 gifts`;

        return (
          <Card key={exchange.id} className="border-border/80 overflow-hidden p-0 shadow-sm">
            <div className="panel-pattern bg-pine text-pine-foreground px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-pine-foreground/75 text-xs font-bold tracking-wider uppercase">
                    {exchange.year === currentYear ? "This year" : "Upcoming exchange"}
                  </p>
                  <h2 className="mt-1 text-xl leading-tight font-extrabold break-words">
                    {exchange.name}
                  </h2>
                </div>
                <span className="bg-pine-foreground/10 text-pine-foreground mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs font-semibold">
                  {statusLabel(exchange.status)}
                </span>
              </div>
              <div className="text-pine-foreground/85 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                  Gift day: {giftDay}
                </span>
                <span>
                  Budget:{" "}
                  <strong className="text-pine-foreground">
                    {formatBudget(exchange.budgetMin, exchange.budgetMax)}
                  </strong>
                </span>
              </div>
            </div>

            <section aria-labelledby={`your-list-${exchange.id}`} className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 id={`your-list-${exchange.id}`} className="font-bold">
                  Your list
                </h3>
                <span className="text-muted-foreground text-sm font-semibold">{progressLabel}</span>
              </div>
              <div
                className="bg-muted h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-label={`${exchange.name} gift list progress`}
                aria-valuenow={progressCount}
                aria-valuemin={0}
                aria-valuemax={3}
              >
                <div
                  className="bg-gold h-full rounded-full"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              {gifts.length > 0 && (
                <div className="flex items-center gap-2 pt-1" aria-label="Gifts on your list">
                  {gifts.slice(0, 4).map((gift, index) => (
                    <ProductImage
                      key={`${exchange.id}-${index}`}
                      src={safeRecipientProductImageUrl(gift.imageUrl)}
                      alt={gift.title}
                      className="size-10 rounded-lg"
                      iconClassName="size-4"
                      placeholderTone="muted"
                    />
                  ))}
                  {exchange.itemCount > 4 && (
                    <span className="text-muted-foreground text-xs font-medium">
                      +{exchange.itemCount - 4}
                    </span>
                  )}
                </div>
              )}
              <Button asChild variant="affirmative" className="min-h-11 w-full sm:w-auto">
                <Link href={`/wishlists/${exchange.id}`}>
                  Open your list <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </section>

            <section
              aria-labelledby={`recipient-${exchange.id}`}
              className="border-border/80 border-t p-4 sm:p-5"
            >
              <h3 id={`recipient-${exchange.id}`} className="font-bold">
                Your recipient
              </h3>
              {recipientName !== undefined ? (
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground text-sm">
                    You’re shopping for{" "}
                    <span className="text-foreground font-semibold">
                      {recipientName ?? "your recipient"}
                    </span>
                  </p>
                  <Button asChild variant="neutral" className="min-h-11 w-full sm:w-auto">
                    <Link href={`/wishlists/${exchange.id}/recipient`}>
                      View {recipientName ? possessive(recipientName) : "your recipient’s"} list
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">Names haven’t been drawn yet.</p>
              )}
            </section>
          </Card>
        );
      })}

      {pastRows.length > 0 && (
        <section aria-labelledby="past-years-heading" className="space-y-3">
          <h2 id="past-years-heading" className="text-lg font-bold">
            Past years
          </h2>
          <div className="space-y-2">
            {pastRows.map((exchange) => (
              <Card
                key={exchange.id}
                className="flex flex-col gap-3 p-4 shadow-none sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs font-semibold uppercase">
                    {exchange.year}
                  </p>
                  <h3 className="mt-0.5 font-bold break-words">{exchange.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {exchange.itemCount} {exchange.itemCount === 1 ? "gift" : "gifts"} · Past
                    exchange
                  </p>
                </div>
                <Button asChild variant="neutral" className="min-h-11 w-full shrink-0 sm:w-auto">
                  <Link href={`/history/${exchange.id}`}>View past exchange</Link>
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <Card className="space-y-3 p-6 text-center sm:p-8">
          <Gift className="text-primary mx-auto size-8" aria-hidden="true" />
          <h2 className="text-lg font-bold">You’re not in an exchange yet</h2>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            Your wish list will show up here once your organizer adds you. Check your inbox for an
            invitation email or link. If you can’t find one, contact the organizer who invited you.
          </p>
          <Button asChild variant="neutral" className="mt-2">
            <Link href="/">Back home</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
