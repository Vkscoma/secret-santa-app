import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { Gift, Settings2, Sparkles } from "lucide-react";
import { PageHeading, ProgressNudge, StringLights } from "@/components/secret-santa/components";
import { ConfirmDeleteWishForm } from "@/components/secret-santa/confirm-delete-wish-form";
import { RefreshWishlistImage } from "@/components/secret-santa/refresh-wishlist-image";
import { WishFields } from "@/components/secret-santa/wish-fields";
import { WishlistBreadcrumb } from "@/components/secret-santa/wishlist-breadcrumb";
import { WishlistComposerSheet } from "@/components/secret-santa/wishlist-composer-sheet";
import { WishlistEditForm } from "@/components/secret-santa/wishlist-edit-form";
import { WishlistEditSection } from "@/components/secret-santa/wishlist-edit-section";
import { WishlistMoveActions } from "@/components/secret-santa/wishlist-move-actions";
import { WishlistOwnerGiftCard } from "@/components/secret-santa/wishlist-owner-gift-card";
import {
  WishlistPasteProvider,
  PendingWishlistCards,
  WishlistEmptyState,
} from "@/components/secret-santa/wishlist-paste-provider";
import { WishlistPreferencesForm } from "@/components/secret-santa/wishlist-preferences-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyPreviousWishlist } from "@/lib/actions/wishlists";
import { requireExchangeMember } from "@/lib/authz";
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

type PageProps = {
  params: Promise<{ exchangeId: string }>;
  searchParams: Promise<{
    url?: string;
    sharedTitle?: string;
    sharedImage?: string;
    sharedPrice?: string;
    sharedBrand?: string;
    add?: string;
  }>;
};

export default async function WishlistDetailPage({ params, searchParams }: PageProps) {
  const [{ exchangeId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const session = await requireExchangeMember(exchangeId);
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange) notFound();
  const [wishlist] = await db
    .select()
    .from(wishlists)
    .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id)))
    .limit(1);
  const items = wishlist
    ? await db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, wishlist.id))
        .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt))
    : [];
  const [previous] = await db
    .select({ id: exchanges.id, name: exchanges.name, year: exchanges.year })
    .from(exchanges)
    .innerJoin(exchangeParticipants, eq(exchangeParticipants.exchangeId, exchanges.id))
    .innerJoin(
      wishlists,
      and(eq(wishlists.exchangeId, exchanges.id), eq(wishlists.userId, session.user.id))
    )
    .where(and(eq(exchangeParticipants.userId, session.user.id), lt(exchanges.year, exchange.year)))
    .orderBy(desc(exchanges.year))
    .limit(1);
  const [myAssignment] = await db
    .select({
      id: assignments.id,
      recipientDisplayName: user.displayName,
      recipientName: user.name,
      recipientEmail: user.email,
    })
    .from(assignments)
    .innerJoin(user, eq(assignments.receiverId, user.id))
    .where(and(eq(assignments.exchangeId, exchangeId), eq(assignments.giverId, session.user.id)))
    .limit(1);
  const recipientFirstName = myAssignment
    ? formatFirstName(
        myAssignment.recipientDisplayName,
        myAssignment.recipientName,
        myAssignment.recipientEmail
      )
    : null;
  const editable = exchange.year >= new Date().getFullYear() && exchange.status !== "closed";

  const budget =
    exchange.budgetMin === exchange.budgetMax
      ? `$${exchange.budgetMax}`
      : `$${exchange.budgetMin}–$${exchange.budgetMax}`;

  return (
    <WishlistPasteProvider>
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(5rem+max(1.5rem,env(safe-area-inset-bottom)))] sm:px-6 sm:pt-10 lg:pb-10">
        <WishlistBreadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "My Wishlists", href: "/wishlists" },
            { label: `My List · ${exchange.name} (${exchange.year})` },
          ]}
        />
        <p className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {exchange.year} exchange
        </p>
        <PageHeading
          title="A list full of little joys"
          description="Add a wish or browse the ideas you’ve already saved. Your Secret Santa will thank you."
        />
        <div
          className={
            editable
              ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.92fr)] xl:gap-8"
              : "mx-auto max-w-3xl"
          }
        >
          {editable && (
            <div className="order-2 min-w-0 lg:order-1">
              <WishlistComposerSheet
                exchangeId={exchangeId}
                autoOpen={query.add === "1"}
                {...(query.url ? { initialUrl: query.url } : {})}
                {...(query.sharedTitle ? { initialTitle: query.sharedTitle } : {})}
                {...(query.sharedImage ? { initialImageUrl: query.sharedImage } : {})}
                {...(query.sharedPrice ? { initialPrice: query.sharedPrice } : {})}
                {...(query.sharedBrand ? { initialStoreName: query.sharedBrand } : {})}
              />
            </div>
          )}
          <div className="order-1 min-w-0 space-y-3 sm:space-y-4 lg:order-2">
            <section
              aria-labelledby="wish-items-heading"
              className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm"
            >
              <div className="panel-pattern bg-pine text-pine-foreground relative overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
                <div className="relative z-10 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-pine-foreground/75 mb-1 text-xs font-semibold tracking-[0.14em] uppercase">
                      My List
                    </p>
                    <h2
                      id="wish-items-heading"
                      className="text-xl leading-tight font-bold break-words"
                    >
                      {exchange.name}
                    </h2>
                    <p className="text-pine-foreground/80 mt-2 text-sm">
                      {items.length} {items.length === 1 ? "gift" : "gifts"} · Budget {budget}
                    </p>
                  </div>
                  <Button
                    asChild
                    type="button"
                    variant="neutral-inverse"
                    size="icon"
                    className="size-11 shrink-0 rounded-lg"
                    aria-label="Wishlist preferences"
                  >
                    <a href="#wishlist-preferences">
                      <Settings2 aria-hidden="true" />
                    </a>
                  </Button>
                </div>
                <StringLights />
              </div>
              <div className="space-y-4 p-3 sm:space-y-5 sm:p-5">
                <div className="[&_.text-gold-foreground]:text-foreground">
                  <ProgressNudge count={items.length} target={3} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">My gift ideas</h3>
                  <span className="text-muted-foreground text-xs">Only you can edit this list</span>
                </div>
                <PendingWishlistCards savedItemIds={items.map((item) => item.id)} />
                {items.length ? (
                  <div className="space-y-3">
                    {items.map((item, index) => {
                      return (
                        <Card
                          key={item.id}
                          className="border-border/80 space-y-3 p-3 shadow-none sm:p-4"
                        >
                          <WishlistOwnerGiftCard item={item} />
                          {editable && (
                            <WishlistEditSection
                              toolbar={
                                <WishlistMoveActions
                                  exchangeId={exchangeId}
                                  itemId={item.id}
                                  title={item.title}
                                  index={index}
                                  count={items.length}
                                />
                              }
                            >
                              <WishlistEditForm
                                key={JSON.stringify([
                                  item.title,
                                  item.url,
                                  item.storeName,
                                  item.imageUrl,
                                  item.priority,
                                  item.priceMin,
                                  item.priceMax,
                                  item.notes,
                                ])}
                                initialImageUrl={item.imageUrl ?? ""}
                                removeAction={
                                  <ConfirmDeleteWishForm
                                    exchangeId={exchangeId}
                                    itemId={item.id}
                                    title={item.title}
                                  />
                                }
                              >
                                <input type="hidden" name="exchangeId" value={exchangeId} />
                                <input type="hidden" name="itemId" value={item.id} />
                                <WishFields
                                  exchangeId={exchangeId}
                                  itemId={item.id}
                                  showTitle
                                  titleRequired
                                  showUrl
                                  urlActions={
                                    item.url ? (
                                      <RefreshWishlistImage exchangeId={exchangeId} itemId={item.id} />
                                    ) : null
                                  }
                                  defaults={{
                                    title: item.title,
                                    url: item.url ?? "",
                                    storeName: item.storeName ?? "",
                                    priceMin: item.priceMin,
                                    priceMax: item.priceMax,
                                    priority: item.priority,
                                    notes: item.notes ?? "",
                                    imageUrl: item.imageUrl ?? "",
                                  }}
                                />
                              </WishlistEditForm>
                            </WishlistEditSection>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                ) : editable ? (
                  <WishlistEmptyState>
                    <Card className="grid min-h-36 place-items-center border-dashed p-4 text-center sm:p-6">
                      <div className="max-w-md">
                        <Gift className="text-primary mx-auto size-7" />
                        <p className="mt-2 font-semibold">
                          Your list is ready for its first gift idea
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Type a gift name or paste a link. For example: “a blue wool scarf.” On
                          your phone, tap + to add your first idea. You can add details later.
                        </p>
                      </div>
                    </Card>
                  </WishlistEmptyState>
                ) : (
                  <Card className="grid min-h-36 place-items-center border-dashed p-4 text-center sm:p-6">
                    <div>
                      <Gift className="text-primary mx-auto size-7" />
                      <p className="mt-2 font-semibold">No gift ideas were saved for this list</p>
                    </div>
                  </Card>
                )}
                {editable && previous && items.length === 0 && (
                  <Card className="flex flex-col gap-3 border-dashed p-4 shadow-none">
                    <div>
                      <h2 className="font-bold">Start with last year’s list</h2>
                      <p className="text-muted-foreground text-sm">
                        Copy items and preferences from {previous.name}. The original list stays
                        unchanged.
                      </p>
                    </div>
                    <form action={copyPreviousWishlist}>
                      <input type="hidden" name="exchangeId" value={exchangeId} />
                      <Button type="submit" variant="affirmative">
                        Copy {previous.year} list
                      </Button>
                    </form>
                  </Card>
                )}
                <Card
                  id="wishlist-preferences"
                  className="border-border/80 bg-muted/30 scroll-mt-24 space-y-4 p-4 shadow-none sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-gold/20 text-foreground grid size-10 shrink-0 place-items-center rounded-xl">
                      <Sparkles className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold">A few more clues</h2>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Add the things you like, or let your Santa surprise you.
                      </p>
                    </div>
                  </div>
                  {editable ? (
                    <WishlistPreferencesForm
                      exchangeId={exchangeId}
                      likes={wishlist?.likes ?? ""}
                      surpriseMe={wishlist?.surpriseMe ?? false}
                    />
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p>
                        <strong>Things I like:</strong> {wishlist?.likes || "Not added"}
                      </p>
                      <p>
                        <strong>Surprise me:</strong> {wishlist?.surpriseMe ? "Yes" : "No"}
                      </p>
                    </div>
                  )}
                </Card>
                {!editable && (
                  <p className="bg-muted text-muted-foreground rounded-xl p-4 text-sm">
                    {exchange.year < new Date().getFullYear()
                      ? "This past exchange wishlist is read-only in history."
                      : "This exchange is closed. Its wishlist is saved for history."}
                  </p>
                )}
              </div>
            </section>
            {myAssignment &&
              exchange.year >= new Date().getFullYear() &&
              exchange.status !== "open" && (
                <div className="flex sm:justify-end">
                  <Button asChild variant="neutral" className="min-h-11 w-full sm:w-auto">
                    <Link href={`/wishlists/${exchangeId}/recipient`}>
                      <Gift className="size-4" /> See {recipientFirstName ? possessive(recipientFirstName) : "my recipient’s"} list
                    </Link>
                  </Button>
                </div>
              )}
          </div>
        </div>
      </div>
    </WishlistPasteProvider>
  );
}
