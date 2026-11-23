import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ClaimsAutoRefresh } from "@/components/secret-santa/claims-auto-refresh";
import { PageHeading } from "@/components/secret-santa/components";
import { PageContainer } from "@/components/secret-santa/page-container";
import { RecipientGiftCard } from "@/components/secret-santa/recipient-gift-card";
import { WishlistBackLink } from "@/components/secret-santa/wishlist-back-link";
import { Card } from "@/components/ui/card";
import { requireExchangeMember } from "@/lib/authz";
import { formatBudget } from "@/lib/budget";
import { db } from "@/lib/db";
import { exchanges } from "@/lib/schema";
import { getBrowsableWishlist, getClaimStates, getClaimsVersion } from "@/lib/wishlist-browse";

type PageProps = { params: Promise<{ exchangeId: string; userId: string }> };
const userIdSchema = z.string().min(1).max(160);

export default async function ParticipantWishlistPage({ params }: PageProps) {
  const { exchangeId, userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId) || !userIdSchema.safeParse(userId).success) notFound();
  const session = await requireExchangeMember(exchangeId);
  if (userId === session.user.id) redirect(`/wishlists/${exchangeId}`);
  const [exchange] = await db
    .select({
      id: exchanges.id,
      name: exchanges.name,
      year: exchanges.year,
      budgetMax: exchanges.budgetMax,
      status: exchanges.status,
    })
    .from(exchanges)
    .where(eq(exchanges.id, exchangeId))
    .limit(1);
  if (!exchange) notFound();
  const wishlist = await getBrowsableWishlist(exchangeId, session.user.id, userId);
  if (!wishlist) notFound();
  const editable = exchange.year >= new Date().getFullYear() && exchange.status !== "closed";
  const [states, claimsVersion] = await Promise.all([
    getClaimStates(
      session.user.id,
      wishlist.items.map(({ id }) => id)
    ),
    editable ? getClaimsVersion(exchangeId, userId) : null,
  ]);
  const claimedItems = wishlist.items.filter(({ id }) => states.get(id) === "taken");
  const otherItems = wishlist.items.filter(({ id }) => states.get(id) !== "taken");

  return (
    <PageContainer maxWidth="4xl" className="space-y-5 py-6 sm:py-10">
      {claimsVersion !== null && (
        <ClaimsAutoRefresh
          exchangeId={exchangeId}
          ownerId={userId}
          initialVersion={claimsVersion}
        />
      )}
      <WishlistBackLink href={`/wishlists/${exchangeId}/people`}>
        Back to everyone’s lists
      </WishlistBackLink>
      <PageHeading
        title={`${wishlist.firstName}’s wish list`}
        description="Pick a gift and tap “I’ll get this” so nobody buys the same thing. Others can see it’s taken, but they won’t know it was you."
      />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        aria-label="Wishlist details"
      >
        <span className="font-semibold">Gift budget: {formatBudget(null, exchange.budgetMax)}</span>
        <span className="text-muted-foreground">
          {wishlist.items.length} {wishlist.items.length === 1 ? "gift idea" : "gift ideas"}
        </span>
      </div>
      {wishlist.likes && (
        <Card className="p-4">
          <h2 className="font-bold">Things they like</h2>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{wishlist.likes}</p>
        </Card>
      )}
      {wishlist.sizes && (
        <Card className="p-4">
          <h2 className="font-bold">Helpful details</h2>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            <strong className="text-foreground">Sizes:</strong> {wishlist.sizes}
          </p>
        </Card>
      )}
      {wishlist.surpriseMe && (
        <Card className="border-gold/40 bg-gold/10 p-3 text-sm font-semibold">
          They’re happy to be surprised.
        </Card>
      )}
      {claimedItems.length > 0 && (
        <section aria-labelledby="already-claimed-heading" className="space-y-2.5">
          <h2 id="already-claimed-heading" className="text-lg font-bold">
            Already picked
          </h2>
          {claimedItems.map((item) => (
            <RecipientGiftCard
              key={item.id}
              item={item}
              exchangeId={exchangeId}
              claimState="taken"
              claimable={editable}
              budgetMax={exchange.budgetMax}
            />
          ))}
        </section>
      )}
      {otherItems.length > 0 && (
        <section aria-labelledby="gift-ideas-heading" className="space-y-2.5">
          <h2 id="gift-ideas-heading" className="text-lg font-bold">
            {claimedItems.length ? "Gift ideas" : "Gift ideas"}
          </h2>
          {otherItems.map((item) => (
            <RecipientGiftCard
              key={item.id}
              item={item}
              exchangeId={exchangeId}
              claimState={states.get(item.id) ?? "available"}
              claimable={editable}
              budgetMax={exchange.budgetMax}
            />
          ))}
        </section>
      )}
      {!wishlist.items.length && (
        <Card className="p-5 text-center">
          <p className="font-semibold">No gift ideas added yet</p>
          <p className="text-muted-foreground mt-1 text-sm">Check back later for updates.</p>
        </Card>
      )}
    </PageContainer>
  );
}
