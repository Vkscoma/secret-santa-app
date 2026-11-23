import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, Gift, Snowflake } from "lucide-react";
import { ClaimsAutoRefresh } from "@/components/secret-santa/claims-auto-refresh";
import { PageHeading } from "@/components/secret-santa/components";
import { PageContainer } from "@/components/secret-santa/page-container";
import { RecipientGiftCard } from "@/components/secret-santa/recipient-gift-card";
import { WishlistBackLink } from "@/components/secret-santa/wishlist-back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireExchangeMember } from "@/lib/authz";
import { formatBudget } from "@/lib/budget";
import { db } from "@/lib/db";
import { formatFirstName, possessive } from "@/lib/person-name";
import { assignments, exchanges, wishlistItems, wishlists, user } from "@/lib/schema";
import { getClaimStates, getClaimsVersion } from "@/lib/wishlist-browse";

type PageProps = { params: Promise<{ exchangeId: string }> };

export default async function RecipientWishlistPage({ params }: PageProps) {
  const { exchangeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const session = await requireExchangeMember(exchangeId);
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange) notFound();
  const exchangeBudgetMax = exchange.budgetMax;
  const [assignment] = await db
    .select({
      recipientId: assignments.receiverId,
      recipientName: user.displayName,
      name: user.name,
      email: user.email,
      sizes: user.sizes,
      shippingAddress: user.shippingAddress,
    })
    .from(assignments)
    .innerJoin(user, eq(assignments.receiverId, user.id))
    .where(and(eq(assignments.exchangeId, exchangeId), eq(assignments.giverId, session.user.id)))
    .limit(1);
  if (!assignment) {
    return (
      <PageContainer maxWidth="4xl" className="space-y-5">
        <WishlistBackLink href="/wishlists" />
        <PageHeading title="Your person’s gift list" />
        <Card className="flex items-center gap-3 p-4">
          <Snowflake className="text-primary size-6 shrink-0" aria-hidden="true" />
          <p className="font-semibold">
            We haven’t picked your person yet. Their gift ideas will show here once we have.
          </p>
        </Card>
        <div className="border-border border-t pt-4">
          <Button asChild variant="neutral" className="min-h-11 w-full sm:w-auto">
            <Link href={`/wishlists/${exchangeId}/people`}>
              See everyone’s wishlists <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const recipientName = formatFirstName(
    assignment.recipientName,
    assignment.name,
    assignment.email
  );
  const [recipientList] = await db
    .select({ id: wishlists.id, surpriseMe: wishlists.surpriseMe, likes: wishlists.likes })
    .from(wishlists)
    .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, assignment.recipientId)))
    .limit(1);
  const items = recipientList
    ? await db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, recipientList.id))
        .orderBy(
          desc(
            sql`case ${wishlistItems.priority} when 'most_wanted' then 3 when 'would_like' then 2 else 1 end`
          ),
          asc(wishlistItems.sortOrder),
          asc(wishlistItems.createdAt)
        )
    : [];
  // Same rule as the participant list page and the claim action: closed or past exchanges are read-only.
  const editable = exchange.year >= new Date().getFullYear() && exchange.status !== "closed";
  const [claimStates, claimsVersion] = await Promise.all([
    getClaimStates(
      session.user.id,
      items.map(({ id }) => id)
    ),
    editable ? getClaimsVersion(exchangeId, assignment.recipientId) : null,
  ]);
  const claimedItems = items.filter(({ id }) => (claimStates.get(id) ?? "available") === "mine");
  const takenItems = items.filter(({ id }) => (claimStates.get(id) ?? "available") === "taken");
  const availableItems = items.filter(
    ({ id }) => (claimStates.get(id) ?? "available") === "available"
  );
  const title = recipientName
    ? `${possessive(recipientName)} wish list`
    : "Your person’s gift list";

  return (
    <PageContainer maxWidth="4xl" className="space-y-5 py-6 sm:py-10">
      {claimsVersion !== null && (
        <ClaimsAutoRefresh
          exchangeId={exchangeId}
          ownerId={assignment.recipientId}
          initialVersion={claimsVersion}
        />
      )}
      <WishlistBackLink href="/wishlists" />
      <PageHeading
        title={title}
        description="Pick a gift with “I’ll get this.” Everyone can see it’s taken, but no one can see who picked it."
      />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        aria-label="Gift details"
      >
        <span className="font-semibold">
          Gift budget: {formatBudget(exchange.budgetMin, exchange.budgetMax)}
        </span>
        {items.length > 0 && (
          <>
            <span className="text-muted-foreground">
              {claimedItems.length === 0
                ? "You haven’t picked a gift yet"
                : `You’re getting ${claimedItems.length} ${claimedItems.length === 1 ? "gift" : "gifts"}`}
            </span>
          </>
        )}
      </div>
      {recipientList?.likes && (
        <Card className="p-4">
          <h2 className="font-bold">Things they like</h2>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            {recipientList.likes}
          </p>
        </Card>
      )}
      {(assignment.sizes || assignment.shippingAddress) && (
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">Helpful details</h2>
          {assignment.sizes && (
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">Sizes:</strong> {assignment.sizes}
            </p>
          )}
          {assignment.shippingAddress && (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              <strong className="text-foreground">Shipping address:</strong>{" "}
              {assignment.shippingAddress}
            </p>
          )}
        </Card>
      )}
      {recipientList?.surpriseMe && (
        <Card className="border-gold/40 bg-gold/10 flex items-center gap-2 p-3 text-sm font-semibold">
          <Gift className="text-gold-foreground size-4 shrink-0" aria-hidden="true" />
          They’re happy to be surprised.
        </Card>
      )}
      {claimedItems.length > 0 && (
        <section aria-labelledby="claimed-heading" className="space-y-2.5">
          <h2 id="claimed-heading" className="text-lg font-bold">
            You’re getting
          </h2>
          {claimedItems.map((item) => (
            <RecipientGiftCard
              key={item.id}
              item={item}
              exchangeId={exchangeId}
              claimState="mine"
              budgetMax={exchangeBudgetMax}
            />
          ))}
        </section>
      )}
      {availableItems.length > 0 && (
        <section aria-labelledby="ideas-heading" className="space-y-2.5">
          <h2 id="ideas-heading" className="text-lg font-bold">
            {claimedItems.length ? "More ideas" : "Gift ideas"}
          </h2>
          {availableItems.map((item) => (
            <RecipientGiftCard
              key={item.id}
              item={item}
              exchangeId={exchangeId}
              claimState="available"
              budgetMax={exchangeBudgetMax}
            />
          ))}
        </section>
      )}
      {takenItems.length > 0 && (
        <section aria-labelledby="taken-heading" className="space-y-2.5">
          <h2 id="taken-heading" className="text-lg font-bold">
            Someone else picked these
          </h2>
          {takenItems.map((item) => (
            <RecipientGiftCard
              key={item.id}
              item={item}
              exchangeId={exchangeId}
              claimState="taken"
              budgetMax={exchangeBudgetMax}
            />
          ))}
        </section>
      )}
      {!items.length && (
        <Card className="p-5 text-center">
          <p className="font-semibold">No gift ideas added yet</p>
          <p className="text-muted-foreground mt-1 text-sm">Check back later for updates.</p>
        </Card>
      )}
      <div className="border-border border-t pt-4">
        <Button asChild variant="neutral" className="min-h-11 w-full sm:w-auto">
          <Link href={`/wishlists/${exchangeId}/people`}>
            See everyone’s wishlists <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </PageContainer>
  );
}
