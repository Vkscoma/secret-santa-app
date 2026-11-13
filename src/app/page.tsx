import { headers } from "next/headers";
import Link from "next/link";
import { and, asc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { ArrowRight, CalendarDays, PackageCheck, Sparkles } from "lucide-react";
import { ClaimToggleForm } from "@/components/secret-santa/claim-toggle-form";
import {
  FestiveIllustration,
  GiftTag,
  PageHeading,
  ProgressNudge,
  Snowfall,
} from "@/components/secret-santa/components";
import { NudgeButton } from "@/components/secret-santa/nudge-button";
import { ProductImage } from "@/components/secret-santa/product-image";
import { WishlistPrice } from "@/components/secret-santa/wishlist-price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { isEmailAllowlisted } from "@/lib/auth-access";
import { db } from "@/lib/db";
import { calendarDaysUntil } from "@/lib/exchange-countdown";
import { shouldShowRecipientNudge } from "@/lib/nudge-visibility";
import {
  assignments,
  exchangeParticipants,
  exchanges,
  itemClaims,
  user,
  wishlistItems,
  wishlists,
} from "@/lib/schema";
import { normalizeUnfurlUrl } from "@/lib/url-safety";

function safeProductUrl(value: string | null) {
  if (!value) return null;
  try {
    normalizeUnfurlUrl(value);
    return value;
  } catch {
    return null;
  }
}

function safeProductImageUrl(value: string | null) {
  if (!value) return null;
  try {
    return normalizeUnfurlUrl(value).toString();
  } catch {
    return null;
  }
}

function safeHost(value: string | null) {
  const safeUrl = safeProductUrl(value);
  return safeUrl ? new URL(safeUrl).hostname : "Gift idea";
}

function formatBudget(minimum: number | null, maximum: number | null) {
  if (minimum === maximum) return `$${maximum ?? "—"}`;
  return `$${minimum ?? 0}–$${maximum ?? "—"}`;
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(await isEmailAllowlisted(session.user.email)))
    return (
      <div className="mx-auto grid min-h-[calc(100svh-8rem)] max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="mx-auto max-w-2xl space-y-7">
          <div className="border-gold/40 bg-gold/10 text-gold-foreground dark:text-gold inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
            <Sparkles className="size-3.5" /> A little holiday magic
          </div>
          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
              Family <span className="text-secondary">Secret Santa</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-base leading-7 sm:text-lg">
              Bring your favorite people together, share the little things you love, and keep every
              surprise right where it belongs.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/login">
              Log In <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </div>
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

  const assignmentsByExchange = exchangeRows.length
    ? await db
        .select({
          exchangeId: assignments.exchangeId,
          recipientId: assignments.receiverId,
          recipientName: user.displayName,
          recipientFullName: user.name,
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
          notes: wishlistItems.notes,
          priority: wishlistItems.priority,
          priceMin: wishlistItems.priceMin,
          priceMax: wishlistItems.priceMax,
          previewPrice: wishlistItems.previewPrice,
          previewCurrency: wishlistItems.previewCurrency,
          priceFetchedAt: wishlistItems.priceFetchedAt,
          rowNumber:
            sql<number>`row_number() over (partition by ${wishlists.exchangeId} order by case ${wishlistItems.priority} when 'most_wanted' then 3 when 'would_like' then 2 else 1 end desc, ${wishlistItems.sortOrder} asc, ${wishlistItems.createdAt} asc)`.as(
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
  const firstYear = exchangeRows[0]?.year;

  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-11">
      <Snowfall />
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="mx-auto w-full max-w-3xl min-w-0">
          <PageHeading
            eyebrow={firstYear ? `${firstYear} holiday exchanges` : "Holiday exchanges"}
            title="The countdown is on"
            description="Your family’s little corner of holiday magic."
          />
          <div className="-mt-3 mb-5 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/wishlists">My Wishlists</Link>
            </Button>
            {exchangeRows[0] && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/wishlists/${exchangeRows[0].id}`}>
                  Open {exchangeRows[0].year} list
                </Link>
              </Button>
            )}
          </div>
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
                const recipient = giving?.recipientName || giving?.recipientFullName;
                const recipientItems = previewsByExchange.get(exchange.id) ?? [];
                const days = calendarDaysUntil(exchange.exchangeAt, now, exchange.timeZone);
                const date = new Intl.DateTimeFormat("en-US", {
                  dateStyle: "full",
                  timeZone: exchange.timeZone,
                }).format(exchange.exchangeAt);
                const canNudge =
                  giving &&
                  shouldShowRecipientNudge(
                    giving.recipientItemCount,
                    giving.notificationPrefs?.nudges !== false,
                    exchange.status
                  );
                return (
                  <section
                    key={exchange.id}
                    aria-labelledby={`exchange-${exchange.id}`}
                    className="space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                          {exchange.year} exchange
                        </p>
                        <h2 id={`exchange-${exchange.id}`} className="mt-1 text-xl font-extrabold">
                          {exchange.name}
                        </h2>
                      </div>
                      <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-semibold capitalize">
                        {exchange.status}
                      </span>
                    </div>
                    <Card className="border-pine/15 from-pine/10 via-card to-card flex w-full min-w-0 flex-col items-stretch gap-4 bg-gradient-to-br p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
                      <div className="min-w-0">
                        <p className="text-foreground text-xs font-bold tracking-[0.15em] uppercase">
                          Until gift day
                        </p>
                        <div className="mt-2 flex items-baseline gap-2">
                          {days > 0 ? (
                            <>
                              <span className="text-4xl font-extrabold tracking-tight tabular-nums">
                                {days}
                              </span>
                              <span className="text-muted-foreground font-semibold">
                                {days === 1 ? "day to go" : "days to go"}
                              </span>
                            </>
                          ) : (
                            <span className="text-xl font-extrabold">Gift day is here</span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                          <CalendarDays className="size-4 shrink-0" /> {date}
                        </p>
                      </div>
                      <div className="border-border/70 bg-card/80 grid w-full min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 rounded-xl border p-4 sm:block sm:w-auto sm:min-w-32">
                        <p className="text-foreground text-xs font-semibold tracking-wide uppercase">
                          Gift budget
                        </p>
                        <p className="text-foreground row-span-2 text-right text-2xl font-extrabold sm:mt-1 sm:text-left">
                          {formatBudget(exchange.budgetMin, exchange.budgetMax)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          give a little, receive a little
                        </p>
                      </div>
                    </Card>

                    <GiftTag recipient={recipient ?? "Names haven’t been drawn yet"} />

                    <section
                      className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm"
                      aria-label={
                        recipient
                          ? `${recipient}’s wish list preview`
                          : "Recipient wish list preview"
                      }
                    >
                      <div className="panel-pattern bg-pine text-pine-foreground flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-pine-foreground/75 text-xs font-bold tracking-wider uppercase">
                            Your recipient
                          </p>
                          <h3 className="text-lg font-bold">
                            {recipient ? `${recipient}’s wish list` : "Your recipient’s list"}
                          </h3>
                        </div>
                        {canNudge && (
                          <div className="[&_button]:h-8 [&_button]:shrink-0 [&_button]:border-white/20 [&_button]:bg-white/15 [&_button]:text-white [&_button]:hover:bg-white/25 [&_span]:text-white/90">
                            <NudgeButton exchangeId={exchange.id} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 space-y-3 p-4 sm:p-5">
                        {!giving ? (
                          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                            Your recipient and their list will appear after names are drawn.
                          </p>
                        ) : recipientItems.length ? (
                          recipientItems.map((item) => {
                            const claimed = claimedIds.has(item.itemId);
                            const productUrl = safeProductUrl(item.url);
                            const overBudget =
                              exchange.budgetMax !== null &&
                              item.priceMin !== null &&
                              item.priceMin > exchange.budgetMax;
                            return (
                              <Card
                                key={item.itemId}
                                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                              >
                                <div className="flex min-w-0 items-start gap-3">
                                  <ProductImage
                                    src={safeProductImageUrl(item.imageUrl)}
                                    alt={`${item.title} product image`}
                                    className="size-16"
                                    iconClassName="size-5"
                                  />
                                  <div className="min-w-0">
                                    <h4 className="font-bold">{item.title}</h4>
                                    <p className="text-muted-foreground mt-1 text-sm">
                                      {item.storeName || safeHost(item.url)}
                                    </p>
                                    {item.notes && (
                                      <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                                        {item.notes}
                                      </p>
                                    )}
                                    <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
                                      <WishlistPrice
                                        minimum={item.priceMin}
                                        maximum={item.priceMax}
                                        previewPrice={item.previewPrice}
                                        previewCurrency={item.previewCurrency}
                                        fetchedAt={item.priceFetchedAt}
                                      />
                                      {overBudget && (
                                        <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-1 font-semibold">
                                          Over budget
                                        </span>
                                      )}
                                      {productUrl && (
                                        <a
                                          href={productUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="border-border hover:text-primary rounded-full border px-2.5 py-1 font-semibold"
                                        >
                                          Open product link
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {exchange.status === "drawn" || exchange.status === "revealed" ? (
                                  <ClaimToggleForm
                                    exchangeId={exchange.id}
                                    itemId={item.itemId}
                                    claimed={claimed}
                                  />
                                ) : (
                                  <p className="text-muted-foreground text-sm">
                                    {claimed ? "Marked as claimed" : "Claiming is unavailable"}
                                  </p>
                                )}
                              </Card>
                            );
                          })
                        ) : (
                          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                            No gift ideas added yet. Check back later for updates.
                          </p>
                        )}
                        {giving && (
                          <div className="flex justify-center pt-1 sm:justify-end">
                            <Button
                              asChild
                              variant="link"
                              size="sm"
                              className="text-gold max-w-full text-center leading-5 whitespace-normal"
                            >
                              <Link href={`/wishlists/${exchange.id}/recipient`}>
                                See all of {recipient ?? "their"}’s list
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    </section>

                    <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                      <Link href={`/wishlists/${exchange.id}`} className="block">
                        <ProgressNudge count={exchange.ownItems} target={3} />
                      </Link>
                      <Card className="flex items-center gap-3 p-4 shadow-none">
                        <div className="bg-gold/20 text-gold-foreground dark:text-gold grid size-10 place-items-center rounded-full">
                          <PackageCheck className="size-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">
                            {exchange.ownItems} {exchange.ownItems === 1 ? "wish" : "wishes"} on
                            your list
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {exchange.ownItems >= 3
                              ? "Your hints are ready to help."
                              : `${3 - exchange.ownItems} more ${3 - exchange.ownItems === 1 ? "hint" : "hints"} would be lovely.`}
                          </p>
                        </div>
                      </Card>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          <div className="bg-accent/70 text-accent-foreground mt-6 flex items-center gap-2 rounded-xl p-3 text-xs">
            <Sparkles className="size-4 shrink-0" /> Remember: the best gifts come with a little
            thought.
          </div>
        </section>
        <aside className="hidden pt-24 lg:block">
          <FestiveIllustration />
        </aside>
      </div>
    </div>
  );
}
