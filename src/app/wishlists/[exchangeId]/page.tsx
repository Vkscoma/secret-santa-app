import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { ArrowLeft, Gift, Heart, Sparkles } from "lucide-react";
import { PageHeading, ProgressNudge } from "@/components/secret-santa/components";
import { ProductImage } from "@/components/secret-santa/product-image";
import { RefreshWishlistImage } from "@/components/secret-santa/refresh-wishlist-image";
import { WishlistComposer } from "@/components/secret-santa/wishlist-composer";
import { WishlistImagePicker } from "@/components/secret-santa/wishlist-image-picker";
import { WishlistPasteProvider, PendingWishlistCards, WishlistEmptyState } from "@/components/secret-santa/wishlist-paste-provider";
import { WishlistPrice } from "@/components/secret-santa/wishlist-price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  copyPreviousWishlist,
  deleteWishlistItem,
  moveWishlistItem,
  saveWishlistPreferences,
  updateWishlistItem,
} from "@/lib/actions/wishlists";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  assignments,
  exchangeParticipants,
  exchanges,
  wishlistItems,
  wishlists,
} from "@/lib/schema";
import { normalizeUnfurlUrl } from "@/lib/unfurl";

type PageProps = { params: Promise<{ exchangeId: string }>; searchParams: Promise<{ url?: string; sharedTitle?: string; sharedImage?: string; sharedPrice?: string; sharedBrand?: string }> };

const priorityLabel: Record<string, string> = {
  most_wanted: "Most wanted",
  would_like: "Would like",
  nice_to_have: "Nice to have",
};


function safeProductUrl(value: string | null) {
  if (!value) return null;
  try { normalizeUnfurlUrl(value); return value; } catch { return null; }
}

function safeProductImageUrl(value: string | null) {
  if (!value) return null;
  try { return normalizeUnfurlUrl(value).toString(); } catch { return null; }
}

function safeHost(value: string | null) {
  const safeUrl = safeProductUrl(value);
  return safeUrl ? new URL(safeUrl).hostname : "Gift idea";
}

export default async function WishlistDetailPage({ params, searchParams }: PageProps) {
  const [{ exchangeId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const session = await requireExchangeMember(exchangeId);
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange) notFound();
  const [wishlist] = await db.select().from(wishlists)
    .where(and(eq(wishlists.exchangeId, exchangeId), eq(wishlists.userId, session.user.id))).limit(1);
  const items = wishlist
    ? await db.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, wishlist.id))
      .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt))
    : [];
  const [previous] = await db.select({ id: exchanges.id, name: exchanges.name, year: exchanges.year }).from(exchanges)
    .innerJoin(exchangeParticipants, eq(exchangeParticipants.exchangeId, exchanges.id))
    .innerJoin(wishlists, and(eq(wishlists.exchangeId, exchanges.id), eq(wishlists.userId, session.user.id)))
    .where(and(eq(exchangeParticipants.userId, session.user.id), lt(exchanges.year, exchange.year)))
    .orderBy(desc(exchanges.year)).limit(1);
  const [myAssignment] = await db.select({ id: assignments.id }).from(assignments)
    .where(and(eq(assignments.exchangeId, exchangeId), eq(assignments.giverId, session.user.id))).limit(1);
  const editable = exchange.status !== "closed";

  return (
    <WishlistPasteProvider><div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/wishlists" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> All wish lists</Link>
      <PageHeading eyebrow={`${exchange.year} exchange`} title={`${exchange.name}: my list`} description="Share the little details that make it easier for your Santa to find something you’ll love." />
      <ProgressNudge count={items.length} target={3} />

      <Card className="space-y-4 border-gold/40 bg-gold/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-foreground"><Sparkles className="size-5" /></span>
          <div className="min-w-0 flex-1"><h2 className="font-bold">A few more clues</h2><p className="mt-1 text-sm text-muted-foreground">Add the things you like, or let your Santa surprise you.</p></div>
        </div>
        {editable ? <form action={saveWishlistPreferences} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="exchangeId" value={exchangeId} />
          <label className="grid gap-1.5 text-sm font-medium">Things I like
            <textarea name="likes" maxLength={1000} rows={2} defaultValue={wishlist?.likes ?? ""} placeholder="Cozy evenings, hiking, favorite flavors…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="surpriseMe" defaultChecked={wishlist?.surpriseMe ?? false} className="size-4 accent-primary" /><Heart className="size-4 text-primary" /> Surprise me</label>
            <Button type="submit" variant="outline">Save preferences</Button>
          </div>
        </form> : <div className="space-y-2 text-sm"><p><strong>Things I like:</strong> {wishlist?.likes || "Not added"}</p><p><strong>Surprise me:</strong> {wishlist?.surpriseMe ? "Yes" : "No"}</p></div>}
      </Card>

      {editable && <WishlistComposer exchangeId={exchangeId} {...(query.url ? { initialUrl: query.url } : {})} {...(query.sharedTitle ? { initialTitle: query.sharedTitle } : {})} {...(query.sharedImage ? { initialImageUrl: query.sharedImage } : {})} {...(query.sharedPrice ? { initialPrice: query.sharedPrice } : {})} {...(query.sharedBrand ? { initialStoreName: query.sharedBrand } : {})} />}

      <section className="space-y-4" aria-labelledby="wish-items-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="wish-items-heading" className="text-xl font-bold">My gift ideas</h2><p className="text-sm text-muted-foreground">Only you can edit this list.</p></div>
          {myAssignment && exchange.status !== "open" && <Button asChild variant="outline"><Link href={`/wishlists/${exchangeId}/recipient`}>See my recipient’s list</Link></Button>}
        </div>
        <PendingWishlistCards savedItemIds={items.map((item) => item.id)} />
        {items.length ? <div className="space-y-3">
          {items.map((item, index) => {
            const productUrl = safeProductUrl(item.url);
            return <Card key={item.id} className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <ProductImage src={safeProductImageUrl(item.imageUrl)} alt={`${item.title} product image`} className="size-20 sm:size-24" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.storeName || safeHost(item.url)}</p></div>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{priorityLabel[item.priority] ?? "Would like"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <WishlistPrice minimum={item.priceMin} maximum={item.priceMax} previewPrice={item.previewPrice} previewCurrency={item.previewCurrency} fetchedAt={item.priceFetchedAt} />
                  {item.notes && <span className="max-w-full rounded-full bg-muted px-2.5 py-1">{item.notes}</span>}
                  {productUrl && <a href={productUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-2.5 py-1 font-semibold hover:text-primary">Open product link</a>}
                </div>
              </div>
            </div>
            {editable && <details className="border-t border-border pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Edit this gift</summary>
              {item.url && <RefreshWishlistImage exchangeId={exchangeId} itemId={item.id} />}
              <form action={updateWishlistItem} className="mt-3 grid gap-3">
                <input type="hidden" name="exchangeId" value={exchangeId} /><input type="hidden" name="itemId" value={item.id} />
                <label className="grid gap-1 text-sm font-medium">Title<input name="title" required maxLength={200} defaultValue={item.title} className="h-10 rounded-md border border-input bg-background px-3" /></label>
                <label className="grid gap-1 text-sm font-medium">Product link<input name="url" type="url" maxLength={2000} defaultValue={item.url ?? ""} className="h-10 rounded-md border border-input bg-background px-3" /></label>
                <label className="grid gap-1 text-sm font-medium">Store<input name="storeName" maxLength={100} defaultValue={item.storeName ?? ""} className="h-10 rounded-md border border-input bg-background px-3" /></label>
                <WishlistImagePicker exchangeId={exchangeId} itemId={item.id} imageUrl={item.imageUrl ?? ""} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm font-medium">Priority<select name="priority" defaultValue={item.priority} className="h-10 rounded-md border border-input bg-background px-3"><option value="most_wanted">Most wanted</option><option value="would_like">Would like</option><option value="nice_to_have">Nice to have</option></select></label>
                  <label className="grid gap-1 text-sm font-medium">Price from<input name="priceMin" type="number" min="0" max="1000000" step="1" defaultValue={item.priceMin ?? ""} className="h-10 rounded-md border border-input bg-background px-3" /></label>
                  <label className="grid gap-1 text-sm font-medium">Price up to<input name="priceMax" type="number" min="0" max="1000000" step="1" defaultValue={item.priceMax ?? ""} className="h-10 rounded-md border border-input bg-background px-3" /></label>
                </div>
                <label className="grid gap-1 text-sm font-medium">Notes<textarea name="notes" maxLength={1000} rows={2} defaultValue={item.notes ?? ""} className="rounded-md border border-input bg-background px-3 py-2" /></label>
                <Button type="submit" size="sm">Save changes</Button>
              </form>
              <form action={deleteWishlistItem} className="mt-2"><input type="hidden" name="exchangeId" value={exchangeId} /><input type="hidden" name="itemId" value={item.id} /><Button type="submit" size="sm" variant="destructive">Remove</Button></form>
              <div className="mt-3 flex gap-2">
                <form action={moveWishlistItem}><input type="hidden" name="exchangeId" value={exchangeId} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="direction" value="up" /><Button type="submit" size="sm" variant="ghost" disabled={index === 0}>Move up</Button></form>
                <form action={moveWishlistItem}><input type="hidden" name="exchangeId" value={exchangeId} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="direction" value="down" /><Button type="submit" size="sm" variant="ghost" disabled={index === items.length - 1}>Move down</Button></form>
              </div>
            </details>}
            </Card>;
          })}
        </div> : <WishlistEmptyState><Card className="grid min-h-36 place-items-center border-dashed p-6 text-center">
          <div><Gift className="mx-auto size-7 text-primary" /><p className="mt-2 font-semibold">Your list is ready for its first wish</p><p className="mt-1 text-sm text-muted-foreground">Add a favorite thing, a useful hint, or a link.</p></div>
        </Card></WishlistEmptyState>}
      </section>

      {editable && previous && items.length === 0 && <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold">Start with last year’s list</h2><p className="text-sm text-muted-foreground">Copy items and preferences from {previous.name}. The original list stays unchanged.</p></div>
        <form action={copyPreviousWishlist}><input type="hidden" name="exchangeId" value={exchangeId} /><Button type="submit" variant="outline">Copy {previous.year} list</Button></form>
      </Card>}
      {!editable && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">This exchange is closed. Its wishlist is saved for history.</p>}
    </div></WishlistPasteProvider>
  );
}
