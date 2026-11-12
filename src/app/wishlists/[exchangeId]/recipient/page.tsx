import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { ProductImage } from "@/components/secret-santa/product-image";
import { WishlistBreadcrumb } from "@/components/secret-santa/wishlist-breadcrumb";
import { WishlistPrice } from "@/components/secret-santa/wishlist-price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toggleWishlistClaim } from "@/lib/actions/wishlists";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { assignments, exchanges, itemClaims, wishlistItems, wishlists, user } from "@/lib/schema";
import { normalizeUnfurlUrl } from "@/lib/unfurl";

type PageProps = { params: Promise<{ exchangeId: string }> };

function safeHost(value: string | null) {
  if (!value) return "Gift idea";
  const safeUrl = safeProductUrl(value);
  return safeUrl ? new URL(safeUrl).hostname : "Gift idea";
}

function safeProductUrl(value: string | null) {
  if (!value) return null;
  try { normalizeUnfurlUrl(value); return value; } catch { return null; }
}

function safeProductImageUrl(value: string | null) {
  if (!value) return null;
  try { return normalizeUnfurlUrl(value).toString(); } catch { return null; }
}


export default async function RecipientWishlistPage({ params }: PageProps) {
  const { exchangeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const session = await requireExchangeMember(exchangeId);
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange) notFound();
  const [assignment] = await db.select({ recipientId: assignments.receiverId, recipientName: user.displayName, name: user.name, sizes: user.sizes, shippingAddress: user.shippingAddress })
    .from(assignments)
    .innerJoin(user, eq(assignments.receiverId, user.id))
    .where(and(eq(assignments.exchangeId, exchangeId), eq(assignments.giverId, session.user.id))).limit(1);
  if (!assignment) {
    return <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <WishlistBreadcrumb items={[{ label: "Home", href: "/" }, { label: "My Wishlists", href: "/wishlists" }, { label: `My List · ${exchange.name} (${exchange.year})`, href: `/wishlists/${exchangeId}` }, { label: "Recipient’s List" }]} />
      <PageHeading eyebrow={exchange.name} title="Your recipient’s list" description="Once the names are drawn, their gift ideas will be waiting here." />
      <Card className="p-6 text-center"><Gift className="mx-auto size-8 text-primary" /><p className="mt-2 font-semibold">Names haven’t been drawn yet</p></Card>
    </div>;
  }
  const recipientName = assignment.recipientName || assignment.name;
  const [recipientList] = await db.select({ id: wishlists.id, surpriseMe: wishlists.surpriseMe, likes: wishlists.likes })
    .from(wishlists).where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, assignment.recipientId))).limit(1);
  const items = recipientList
    ? await db.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, recipientList.id))
      .orderBy(desc(sql`case ${wishlistItems.priority} when 'most_wanted' then 3 when 'would_like' then 2 else 1 end`), asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt))
    : [];
  const claimRows = items.length
    ? await db.select({ itemId: itemClaims.itemId }).from(itemClaims)
      .where(and(eq(itemClaims.giverId, session.user.id), inArray(itemClaims.itemId, items.map(({ id }) => id))))
    : [];
  const claimedIds = new Set(claimRows.map(({ itemId }) => itemId));

  return (
    <div className="mx-auto max-w-4xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <WishlistBreadcrumb items={[{ label: "Home", href: "/" }, { label: "My Wishlists", href: "/wishlists" }, { label: `My List · ${exchange.name} (${exchange.year})`, href: `/wishlists/${exchangeId}` }, { label: "Recipient’s List" }]} />
      <PageHeading eyebrow={`${exchange.year} exchange`} title={`${recipientName}’s wish list`} description="Only you can see this assigned recipient’s gift list and your claim status." />
      {recipientList?.likes && <Card className="p-5"><h2 className="font-bold">Things they like</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{recipientList.likes}</p></Card>}
      {(assignment.sizes || assignment.shippingAddress) && <Card className="space-y-2 p-5"><h2 className="font-bold">Helpful details</h2>{assignment.sizes && <p className="text-sm text-muted-foreground"><strong className="text-foreground">Sizes:</strong> {assignment.sizes}</p>}{assignment.shippingAddress && <p className="whitespace-pre-wrap text-sm text-muted-foreground"><strong className="text-foreground">Shipping address:</strong> {assignment.shippingAddress}</p>}</Card>}
      {recipientList?.surpriseMe && <Card className="border-gold/40 bg-gold/10 p-4 text-sm font-semibold">They’re happy to be surprised.</Card>}
      {items.length ? <div className="space-y-3">{items.map((item) => {
        const claimed = claimedIds.has(item.id);
        const productUrl = safeProductUrl(item.url);
        const overBudget = exchange.budgetMax !== null && item.priceMin !== null && item.priceMin > exchange.budgetMax;
        return <Card key={item.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <ProductImage src={safeProductImageUrl(item.imageUrl)} alt={`${item.title} product image`} className="size-16" iconClassName="size-5" />
            <div className="min-w-0"><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.storeName || safeHost(item.url)}</p>
              {item.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground"><WishlistPrice minimum={item.priceMin} maximum={item.priceMax} previewPrice={item.previewPrice} previewCurrency={item.previewCurrency} fetchedAt={item.priceFetchedAt} />{overBudget && <span className="rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground">Over budget</span>}{productUrl && <a href={productUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-2.5 py-1 font-semibold hover:text-primary">Open product link</a>}</div>
            </div>
          </div>
          <form action={toggleWishlistClaim} className="shrink-0">
            <input type="hidden" name="exchangeId" value={exchangeId} /><input type="hidden" name="itemId" value={item.id} />
            <Button type="submit" variant={claimed ? "secondary" : "outline"}>{claimed ? "Unmark as claimed" : "I’ve got this"}</Button>
          </form>
        </Card>;
      })}</div> : <Card className="p-6 text-center"><p className="font-semibold">No gift ideas added yet</p><p className="mt-1 text-sm text-muted-foreground">Check back later for updates.</p></Card>}
    </div>
  );
}
