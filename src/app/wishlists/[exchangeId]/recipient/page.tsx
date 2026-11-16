import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Gift, Snowflake } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { formatRecipientFirstName, RecipientGiftCard } from "@/components/secret-santa/recipient-gift-card";
import { WishlistBreadcrumb } from "@/components/secret-santa/wishlist-breadcrumb";
import { Card } from "@/components/ui/card";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { assignments, exchanges, itemClaims, wishlistItems, wishlists, user } from "@/lib/schema";

type PageProps = { params: Promise<{ exchangeId: string }> };

function formatBudget(minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return "Not set";
  if (minimum === null) return `Up to $${maximum}`;
  if (maximum === null) return minimum === 0 ? "No limit" : `At least $${minimum}`;
  if (minimum === maximum) return `$${maximum}`;
  return `$${minimum}–$${maximum}`;
}

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
      sizes: user.sizes,
      shippingAddress: user.shippingAddress,
    })
    .from(assignments)
    .innerJoin(user, eq(assignments.receiverId, user.id))
    .where(and(eq(assignments.exchangeId, exchangeId), eq(assignments.giverId, session.user.id)))
    .limit(1);
  if (!assignment) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
        <WishlistBreadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "My Wishlists", href: "/wishlists" },
            {
              label: `My List · ${exchange.name} (${exchange.year})`,
              href: `/wishlists/${exchangeId}`,
            },
            { label: "Recipient’s List" },
          ]}
        />
        <PageHeading
          eyebrow={`${exchange.year} exchange`}
          title="Your recipient’s list"
          description="After names are drawn, their gift ideas will show up here."
        />
        <Card className="flex items-center gap-3 p-4">
          <Snowflake className="text-primary size-6 shrink-0" aria-hidden="true" />
          <p className="font-semibold">
            Names haven’t been drawn yet. Their gift ideas will show up here after the draw.
          </p>
        </Card>
      </div>
    );
  }

  const recipientName = formatRecipientFirstName(assignment.recipientName, assignment.name) || "Your recipient";
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
  const claimRows = items.length
    ? await db
        .select({ itemId: itemClaims.itemId })
        .from(itemClaims)
        .where(
          and(
            eq(itemClaims.giverId, session.user.id),
            inArray(
              itemClaims.itemId,
              items.map(({ id }) => id)
            )
          )
        )
    : [];
  const claimedIds = new Set(claimRows.map(({ itemId }) => itemId));
  const claimedItems = items.filter(({ id }) => claimedIds.has(id));
  const availableItems = items.filter(({ id }) => !claimedIds.has(id));
  const title =
    recipientName === "Your recipient"
      ? "Your recipient’s wish list"
      : `${recipientName}’s wish list`;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
      <WishlistBreadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "My Wishlists", href: "/wishlists" },
          {
            label: `My List · ${exchange.name} (${exchange.year})`,
            href: `/wishlists/${exchangeId}`,
          },
          { label: "Recipient’s List" },
        ]}
      />
      <PageHeading
        eyebrow={`${exchange.year} exchange`}
        title={title}
        description="Only you can see what you’ve claimed. Mark gifts you’re getting so you don’t forget."
      />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        aria-label="Exchange details"
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
              claimed
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
              claimed={false}
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
    </div>
  );
}
