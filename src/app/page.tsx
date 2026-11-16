import { headers } from "next/headers";
import Link from "next/link";
import { and, asc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { FestiveIllustration, PageHeading, Snowfall } from "@/components/secret-santa/components";
import { NudgeButton } from "@/components/secret-santa/nudge-button";
import { PageContainer } from "@/components/secret-santa/page-container";
import { RecipientGiftCard } from "@/components/secret-santa/recipient-gift-card";
import { WishlistOwnerGiftCard } from "@/components/secret-santa/wishlist-owner-gift-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { isEmailAllowlisted } from "@/lib/auth-access";
import { formatBudget } from "@/lib/budget";
import { db } from "@/lib/db";
import { calendarDaysUntil } from "@/lib/exchange-countdown";
import { shouldShowRecipientNudge } from "@/lib/nudge-visibility";
import { formatFirstName, possessive } from "@/lib/person-name";
import {
  assignments,
  exchangeParticipants,
  exchanges,
  itemClaims,
  user,
  wishlistItems,
  wishlists,
} from "@/lib/schema";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(await isEmailAllowlisted(session.user.email)))
    return (
      <PageContainer className="grid min-h-[calc(100svh-8rem)] items-center gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="mx-auto max-w-2xl space-y-7">
          <div className="border-gold/40 dark:border-gold/70 bg-gold/10 text-gold-foreground dark:text-gold inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
            <Sparkles className="size-3.5" /> A little holiday magic
          </div>
          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
              Family Secret<span className="text-cranberry"> Santa</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-base leading-7 sm:text-lg">
              Bring your favorite people together, share the little things you love, and keep every
              surprise right where it belongs.
            </p>
          </div>
          <Button variant="affirmative" asChild size="lg">
            <Link href="/login">
              Log In <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </PageContainer>
    );

  const exchangeRows = await db
    .select({
      id: exchanges.id,
      name: exchanges.name,
      year: exchanges.year,
      budgetMin: exchanges.budgetMin,
      budgetMax: exchanges.budgetMax,
      exchangeAt: exchanges.exchangeAt,
      timeZone: exchanges.timeZone,
      status: exchanges.status,
      ownItems: sql<number>`count(distinct ${wishlistItems.id})::int`,
    })
    .from(exchangeParticipants)
    .innerJoin(exchanges, eq(exchangeParticipants.exchangeId, exchanges.id))
    .leftJoin(
      wishlists,
      and(eq(wishlists.exchangeId, exchanges.id), eq(wishlists.userId, session.user.id))
    )
    .leftJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
    .where(and(eq(exchangeParticipants.userId, session.user.id), ne(exchanges.status, "closed")))
    .groupBy(exchanges.id, wishlists.id)
    .orderBy(asc(exchanges.exchangeAt))
    .limit(1);

  const ownPreviewItems = exchangeRows[0]
    ? await db
        .select({
          id: wishlistItems.id,
          title: wishlistItems.title,
          previewTitlePending: wishlistItems.previewTitlePending,
          url: wishlistItems.url,
          storeName: wishlistItems.storeName,
          imageUrl: wishlistItems.imageUrl,
          notes: wishlistItems.notes,
          priority: wishlistItems.priority,
          priceMin: wishlistItems.priceMin,
          priceMax: wishlistItems.priceMax,
          previewPrice: wishlistItems.previewPrice,
          previewCurrency: wishlistItems.previewCurrency,
          priceFetchedAt: wishlistItems.priceFetchedAt,
        })
        .from(wishlists)
        .innerJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
        .where(
          and(eq(wishlists.exchangeId, exchangeRows[0].id), eq(wishlists.userId, session.user.id))
        )
        .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt))
        .limit(3)
    : [];

  const assignmentsByExchange = exchangeRows.length
    ? await db
        .select({
          exchangeId: assignments.exchangeId,
          recipientId: assignments.receiverId,
          recipientName: user.displayName,
          recipientFullName: user.name,
          recipientEmail: user.email,
          notificationPrefs: user.notificationPrefs,
          recipientItemCount: sql<number>`(select count(*)::int from ${wishlistItems} inner join ${wishlists} on ${wishlistItems.wishlistId} = ${wishlists.id} where ${wishlists.exchangeId} = ${assignments.exchangeId} and ${wishlists.userId} = ${assignments.receiverId})`,
        })
        .from(assignments)
        .innerJoin(user, eq(assignments.receiverId, user.id))
        .where(
          and(
            eq(assignments.giverId, session.user.id),
            or(...exchangeRows.map(({ id }) => eq(assignments.exchangeId, id)))
          )
        )
    : [];

  const rankedRecipientItems = assignmentsByExchange.length
    ? db
        .select({
          exchangeId: wishlists.exchangeId,
          itemId: wishlistItems.id,
          title: wishlistItems.title,
          url: wishlistItems.url,
          storeName: wishlistItems.storeName,
          imageUrl: wishlistItems.imageUrl,
          previewTitlePending: wishlistItems.previewTitlePending,
          notes: wishlistItems.notes,
          priority: wishlistItems.priority,
          priceMin: wishlistItems.priceMin,
          priceMax: wishlistItems.priceMax,
          previewPrice: wishlistItems.previewPrice,
          previewCurrency: wishlistItems.previewCurrency,
          priceFetchedAt: wishlistItems.priceFetchedAt,
          rowNumber:
            sql<number>`row_number() over (partition by ${wishlists.exchangeId} order by case when exists (select 1 from ${itemClaims} where ${itemClaims.itemId} = ${wishlistItems.id} and ${itemClaims.giverId} = ${session.user.id}) then 0 else 1 end asc, case ${wishlistItems.priority} when 'most_wanted' then 3 when 'would_like' then 2 else 1 end desc, ${wishlistItems.sortOrder} asc, ${wishlistItems.createdAt} asc)`.as(
              "row_number"
            ),
        })
        .from(wishlists)
        .innerJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
        .where(
          or(
            ...assignmentsByExchange.map(({ exchangeId, recipientId }) =>
              and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, recipientId))!
            )
          )
        )
        .as("ranked_recipient_items")
    : null;

  const recipientPreviewRows = rankedRecipientItems
    ? await db
        .select({
          exchangeId: rankedRecipientItems.exchangeId,
          itemId: rankedRecipientItems.itemId,
          title: rankedRecipientItems.title,
          url: rankedRecipientItems.url,
          storeName: rankedRecipientItems.storeName,
          imageUrl: rankedRecipientItems.imageUrl,
          previewTitlePending: rankedRecipientItems.previewTitlePending,
          notes: rankedRecipientItems.notes,
          priority: rankedRecipientItems.priority,
          priceMin: rankedRecipientItems.priceMin,
          priceMax: rankedRecipientItems.priceMax,
          previewPrice: rankedRecipientItems.previewPrice,
          previewCurrency: rankedRecipientItems.previewCurrency,
          priceFetchedAt: rankedRecipientItems.priceFetchedAt,
          rowNumber: rankedRecipientItems.rowNumber,
        })
        .from(rankedRecipientItems)
        .where(lte(rankedRecipientItems.rowNumber, 2))
        .orderBy(asc(rankedRecipientItems.exchangeId), asc(rankedRecipientItems.rowNumber))
    : [];
  const claimedItemRows = recipientPreviewRows.length
    ? await db
        .select({ itemId: itemClaims.itemId })
        .from(itemClaims)
        .where(
          and(
            eq(itemClaims.giverId, session.user.id),
            inArray(
              itemClaims.itemId,
              recipientPreviewRows.map(({ itemId }) => itemId)
            )
          )
        )
    : [];
  const claimedIds = new Set(claimedItemRows.map(({ itemId }) => itemId));
  const previewsByExchange = new Map<string, typeof recipientPreviewRows>();
  for (const item of recipientPreviewRows) {
    const items = previewsByExchange.get(item.exchangeId) ?? [];
    items.push(item);
    previewsByExchange.set(item.exchangeId, items);
  }
  const assignmentsMap = new Map(
    assignmentsByExchange.map((assignment) => [assignment.exchangeId, assignment])
  );
  // eslint-disable-next-line react-hooks/purity
  const now = new Date(Date.now());
  return (
    <PageContainer className="relative sm:py-11">
      <Snowfall />
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="mx-auto w-full max-w-3xl min-w-0">
          <PageHeading
            title="The countdown is on"
            description="Your exchange and wish lists, all in one place."
          />
          {exchangeRows.length === 0 ? (
            <Card className="space-y-3 p-6 text-center">
              <p className="font-bold">No active exchange right now</p>
              <p className="text-muted-foreground text-sm">
                When you join an active exchange, it will appear here.
              </p>
            </Card>
          ) : (
            <div className="space-y-7">
              {exchangeRows.map((exchange) => {
                const giving = assignmentsMap.get(exchange.id);
                const recipient = giving
                  ? formatFirstName(
                      giving.recipientName,
                      giving.recipientFullName,
                      giving.recipientEmail
                    )
                  : null;
                const recipientItems = previewsByExchange.get(exchange.id) ?? [];
                const ownItems = exchangeRows[0]?.id === exchange.id ? ownPreviewItems : [];
                const days = calendarDaysUntil(exchange.exchangeAt, now, exchange.timeZone);
                const date = new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: exchange.timeZone,
                }).format(exchange.exchangeAt);
                const statusLabel =
                  exchange.status.charAt(0).toUpperCase() + exchange.status.slice(1);
                const progressValue = Math.min((exchange.ownItems / 3) * 100, 100);
                const progressLabel =
                  exchange.ownItems >= 3
                    ? `${exchange.ownItems} gifts added`
                    : `${exchange.ownItems} of 3 gifts`;
                const canNudge =
                  giving &&
                  shouldShowRecipientNudge(
                    giving.recipientItemCount,
                    giving.notificationPrefs?.nudges !== false,
                    exchange.status
                  );
                return (
                  <section key={exchange.id} className="space-y-5">
                    <Card className="from-pine/10 via-card to-card space-y-3 bg-gradient-to-br p-4 shadow-sm sm:p-5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                            {exchange.year} exchange
                          </p>
                          <h2 className="mt-1 text-lg leading-tight font-extrabold break-words sm:text-xl">
                            {exchange.name}
                          </h2>
                        </div>
                        <span className="bg-muted text-muted-foreground inline-flex shrink-0 rounded-md px-2 py-1 text-xs font-medium">
                          {statusLabel}
                        </span>
                      </div>
                      <div className="border-border/70 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <CalendarDays
                            className="text-muted-foreground size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {days > 0
                            ? `${days} ${days === 1 ? "day" : "days"} to go`
                            : "Gift day is here"}
                          <span className="text-muted-foreground font-normal">· {date}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Gift budget </span>
                          <strong>{formatBudget(exchange.budgetMin, exchange.budgetMax)}</strong>
                        </p>
                      </div>
                    </Card>

                    <section
                      id={`your-list-${exchange.id}`}
                      aria-labelledby={`your-list-heading-${exchange.id}`}
                      className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm"
                    >
                      <div className="panel-pattern bg-pine text-pine-foreground px-5 py-4 sm:px-6">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3
                              id={`your-list-heading-${exchange.id}`}
                              className="text-lg font-bold"
                            >
                              Your list
                            </h3>
                            <p className="text-pine-foreground/80 mt-0.5 text-sm">
                              {progressLabel}
                            </p>
                          </div>
                          <span className="text-pine-foreground text-sm font-bold tabular-nums">
                            {Math.min(exchange.ownItems, 3)}/3
                          </span>
                        </div>
                        <div
                          className="bg-pine-foreground/15 mt-3 h-1.5 overflow-hidden rounded-full"
                          role="progressbar"
                          aria-label="Wishlist progress"
                          aria-valuenow={Math.min(exchange.ownItems, 3)}
                          aria-valuemin={0}
                          aria-valuemax={3}
                        >
                          <div
                            className="bg-gold h-full rounded-full transition-[width]"
                            style={{ width: `${progressValue}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
                        {ownItems.length ? (
                          ownItems.map((item) => (
                            <Card key={item.id} className="p-3 shadow-none">
                              <WishlistOwnerGiftCard item={item} compact />
                            </Card>
                          ))
                        ) : (
                          <div className="border-border rounded-xl border border-dashed p-4 text-center">
                            <p className="font-semibold">
                              Your list is ready for its first gift idea
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              Type a gift name or paste a link. For example: “a blue wool scarf.” On
                              your phone, tap + to add your first idea. You can add details later.
                            </p>
                          </div>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            asChild
                            variant="affirmative"
                            className="min-h-11 w-full sm:w-auto"
                          >
                            <Link href={`/wishlists/${exchange.id}?add=1`}>
                              {ownItems.length ? "Add a wish" : "Add your first wish"}
                            </Link>
                          </Button>
                          <Button asChild variant="neutral" className="min-h-11 w-full sm:w-auto">
                            <Link href="/wishlists">See all of your list</Link>
                          </Button>
                        </div>
                      </div>
                    </section>

                    <section
                      id={`recipient-list-${exchange.id}`}
                      aria-labelledby={`recipient-list-heading-${exchange.id}`}
                      className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm"
                    >
                      <div className="panel-pattern bg-pine text-pine-foreground flex flex-col items-start gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="min-w-0">
                          <p className="text-pine-foreground/75 text-xs font-bold tracking-wider uppercase">
                            Your recipient
                          </p>
                          <h3
                            id={`recipient-list-heading-${exchange.id}`}
                            className="text-lg font-bold"
                          >
                            {giving
                              ? `You’re shopping for ${recipient ?? "your recipient"}`
                              : "Names haven’t been drawn yet"}
                          </h3>
                          {giving && (
                            <p className="text-pine-foreground/80 mt-0.5 text-sm">
                              Their wish list is ready whenever you are.
                            </p>
                          )}
                        </div>
                        {canNudge && <NudgeButton exchangeId={exchange.id} />}
                      </div>
                      {giving ? (
                        <div className="min-w-0 space-y-3 p-3 sm:space-y-4 sm:p-4">
                          {recipientItems.length ? (
                            recipientItems.map((item) => (
                              <RecipientGiftCard
                                key={item.itemId}
                                item={{ ...item, id: item.itemId }}
                                exchangeId={exchange.id}
                                claimed={claimedIds.has(item.itemId)}
                                budgetMax={exchange.budgetMax}
                                claimable={
                                  exchange.status === "drawn" || exchange.status === "revealed"
                                }
                                compact
                              />
                            ))
                          ) : (
                            <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                              No gift ideas added yet. Check back later for updates.
                            </p>
                          )}
                          <div className="flex justify-center pt-1 sm:justify-end">
                            <Button
                              asChild
                              variant="neutral"
                              className="min-h-11 w-full max-w-full text-center leading-5 whitespace-normal md:w-auto"
                            >
                              <Link href={`/wishlists/${exchange.id}/recipient`}>
                                See all of {recipient ? possessive(recipient) : "your recipient’s"}{" "}
                                list
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground m-3 rounded-xl border border-dashed p-4 text-sm sm:m-4">
                          Once names are drawn, your recipient’s gift ideas will show up here.
                        </p>
                      )}
                    </section>
                  </section>
                );
              })}
            </div>
          )}
        </section>
        <aside className="hidden pt-24 lg:block">
          <FestiveIllustration />
        </aside>
      </div>
    </PageContainer>
  );
}
