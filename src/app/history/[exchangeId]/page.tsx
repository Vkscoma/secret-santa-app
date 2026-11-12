import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, lt } from "drizzle-orm";
import { ArrowLeft, CalendarDays, Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { Card } from "@/components/ui/card";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { isPastHistoryExchange, mayShowSantaIdentity } from "@/lib/history-policy";
import { assignments, exchangeParticipants, exchanges, user, wishlistItems, wishlists } from "@/lib/schema";
import { normalizeUnfurlUrl } from "@/lib/url-safety";

type PageProps = { params: Promise<{ exchangeId: string }> };

function priorityLabel(priority: string) {
  if (priority === "most_wanted") return "Most wanted";
  if (priority === "nice_to_have") return "Nice to have";
  return "Would like";
}

function safeProductUrl(value: string | null) {
  if (!value) return null;
  try { return normalizeUnfurlUrl(value).toString(); } catch { return null; }
}

export default async function HistoryExchangePage({ params }: PageProps) {
  const [{ exchangeId }, session] = await Promise.all([params, requireAllowlisted()]);
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const currentYear = new Date().getFullYear();
  const [exchange] = await db.select({
    id: exchanges.id,
    name: exchanges.name,
    year: exchanges.year,
    date: exchanges.exchangeAt,
    timeZone: exchanges.timeZone,
    budgetMin: exchanges.budgetMin,
    budgetMax: exchanges.budgetMax,
    status: exchanges.status,
    autoReveal: exchanges.autoReveal,
  }).from(exchanges).innerJoin(exchangeParticipants, eq(exchangeParticipants.exchangeId, exchanges.id))
    .where(and(eq(exchanges.id, exchangeId), eq(exchangeParticipants.userId, session.user.id), lt(exchanges.year, currentYear))).limit(1);
  if (!exchange || !isPastHistoryExchange(exchange.year, currentYear, exchange.status)) notFound();

  const [recipient] = await db.select({ id: user.id, name: user.displayName, fallbackName: user.name })
    .from(assignments).innerJoin(user, eq(assignments.receiverId, user.id))
    .where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.giverId, session.user.id))).limit(1);
  let santa: { name: string | null; fallbackName: string } | undefined;
  if (mayShowSantaIdentity(exchange.status, exchange.autoReveal, exchange.date)) {
    const [assignment] = await db.select({ name: user.displayName, fallbackName: user.name })
      .from(assignments).innerJoin(user, eq(assignments.giverId, user.id))
      .where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.receiverId, session.user.id))).limit(1);
    santa = assignment;
  }

  const [recipientWishlist] = recipient ? await db.select({ id: wishlists.id, likes: wishlists.likes, surpriseMe: wishlists.surpriseMe })
    .from(wishlists).where(and(eq(wishlists.exchangeId, exchange.id), eq(wishlists.userId, recipient.id))).limit(1) : [];
  const items = recipientWishlist ? await db.select({
    title: wishlistItems.title,
    url: wishlistItems.url,
    imageUrl: wishlistItems.imageUrl,
    storeName: wishlistItems.storeName,
    notes: wishlistItems.notes,
    priority: wishlistItems.priority,
    priceMin: wishlistItems.priceMin,
    priceMax: wishlistItems.priceMax,
    priceBucket: wishlistItems.priceBucket,
  }).from(wishlistItems).where(eq(wishlistItems.wishlistId, recipientWishlist.id))
    .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt)) : [];
  const budget = exchange.budgetMin === exchange.budgetMax
    ? `$${exchange.budgetMax ?? "—"}`
    : `$${exchange.budgetMin ?? 0}–$${exchange.budgetMax ?? "—"}`;

  return <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
    <Link href="/history" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> Exchange history</Link>
    <PageHeading eyebrow={`${exchange.year} exchange`} title={exchange.name} description="Your saved, read-only gift ideas from that year." />
    <Card className="space-y-3 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: exchange.timeZone }).format(exchange.date)} · {budget} budget</p>
      {recipient ? <p className="text-lg font-bold">You gave to {recipient.name || recipient.fallbackName}</p> : <p className="text-sm text-muted-foreground">Your giver assignment is not available for this exchange.</p>}
      {santa ? <p className="text-sm">Your Secret Santa was <span className="font-semibold">{santa.name || santa.fallbackName}</span>.</p> : <p className="text-sm text-muted-foreground">Your Secret Santa’s identity is still secret.</p>}
    </Card>
    {recipient && <Card className="overflow-hidden p-0">
      <div className="panel-pattern bg-pine px-5 py-4 text-pine-foreground sm:px-6"><h2 className="text-lg font-bold">{recipient.name || recipient.fallbackName}’s saved wish list</h2><p className="mt-1 text-sm text-pine-foreground/80">{items.length} {items.length === 1 ? "gift idea" : "gift ideas"} from {exchange.year}</p></div>
      <div className="space-y-3 p-4 sm:p-5">
        {recipientWishlist?.surpriseMe && <div className="rounded-xl bg-gold/10 p-4"><p className="font-semibold">Things they like</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{recipientWishlist.likes || "They asked for a surprise."}</p></div>}
        {items.length ? items.map((item, index) => {
          const price = item.priceMin !== null || item.priceMax !== null
            ? `$${item.priceMin ?? 0}${item.priceMax !== null && item.priceMax !== item.priceMin ? `–$${item.priceMax}` : ""}`
            : item.priceBucket?.replaceAll("_", " ");
          const imageUrl = safeProductUrl(item.imageUrl);
          const productUrl = safeProductUrl(item.url);
          let store = item.storeName || "Gift idea";
          if (!item.storeName && productUrl) store = new URL(productUrl).hostname;
          return <article key={`${index}-${item.title}`} className="flex gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-sm sm:gap-4 sm:p-4">
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary text-pine">{imageUrl ? <Image src={imageUrl} alt="" width={48} height={48} unoptimized className="size-full object-cover" /> : <Gift className="size-5" aria-hidden="true" />}</div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{store} · {priorityLabel(item.priority)}</p>
              {item.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}
              {price && <p className="mt-2 text-xs font-semibold text-pine dark:text-pine-foreground">{price}</p>}
              {productUrl && <a href={productUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-primary underline-offset-4 hover:underline">Open saved link</a>}
            </div>
          </article>;
        }) : <div className="rounded-xl border border-dashed border-border p-5 text-center"><Gift className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">No gift ideas were saved for this list.</p></div>}
      </div>
    </Card>}
  </div>;
}
