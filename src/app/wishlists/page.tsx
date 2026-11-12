import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowRight, Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { WishlistBreadcrumb } from "@/components/secret-santa/wishlist-breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { exchangeParticipants, exchanges, wishlistItems, wishlists } from "@/lib/schema";

const giftTileColors = [
  "bg-primary/80 text-primary-foreground",
  "bg-pine/70 text-pine-foreground",
  "bg-gold text-gold-foreground",
  "bg-secondary text-secondary-foreground",
  "bg-accent text-accent-foreground",
  "bg-primary/40 text-primary-foreground",
] as const;

export default async function WishlistsPage() {
  const session = await requireAllowlisted();
  const currentYear = new Date().getFullYear();
  const rows = await db
    .select({
      id: exchanges.id,
      name: exchanges.name,
      year: exchanges.year,
      status: exchanges.status,
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

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <WishlistBreadcrumb items={[{ label: "Home", href: "/" }, { label: "My Wishlists" }]} />
      <PageHeading
        eyebrow="Your gift ideas"
        title="My Wishlists"
        description="Keep a thoughtful list for each exchange and give your Secret Santa a few good clues."
      />
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((exchange) => (
            <Card key={exchange.id} className="border-border/80 overflow-hidden shadow-sm">
              <div className="p-5 sm:p-6">
                <p className="text-pine dark:text-pine-foreground mb-1 text-xs font-bold tracking-wider uppercase">
                  {exchange.year < currentYear
                    ? "Past exchange"
                    : exchange.year > currentYear
                      ? "Upcoming exchange"
                      : "This year"}
                </p>
                <Link
                  href={
                    exchange.year < currentYear
                      ? `/history/${exchange.id}`
                      : `/wishlists/${exchange.id}`
                  }
                  className="group hover:text-primary flex w-fit items-center gap-2 text-lg font-bold"
                >
                  {exchange.name}
                  <ArrowRight
                    className="size-4 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
                <p className="text-muted-foreground mt-1 text-sm">
                  {exchange.itemCount} {exchange.itemCount === 1 ? "gift" : "gifts"}{" "}
                  <span className="px-1">·</span>{" "}
                  <span className="capitalize">{exchange.status}</span>
                </p>
                {exchange.year >= currentYear && exchange.status !== "open" && (
                  <Link
                    href={`/wishlists/${exchange.id}/recipient`}
                    className="text-gold mt-2 inline-flex items-center text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    Recipient’s list
                  </Link>
                )}
              </div>
              <div className="bg-muted/75 flex min-h-16 flex-wrap items-center gap-2 border-t px-5 py-3 sm:px-6">
                {Array.from(
                  { length: Math.min(exchange.itemCount, giftTileColors.length) },
                  (_, index) => (
                    <span
                      key={`${exchange.id}-gift-${index}`}
                      className={`grid size-10 place-items-center rounded-lg ${giftTileColors[index]}`}
                      aria-hidden="true"
                    >
                      <Gift className="size-4" />
                    </span>
                  )
                )}
                {exchange.itemCount === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No gifts on your list yet. Add a few ideas to help your Secret Santa.
                  </p>
                ) : exchange.itemCount > giftTileColors.length ? (
                  <p className="text-muted-foreground ml-1 self-center text-xs">
                    and {exchange.itemCount - giftTileColors.length} more{" "}
                    {exchange.itemCount - giftTileColors.length === 1 ? "gift" : "gifts"}…
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="space-y-3 p-6 text-center sm:p-8">
          <Gift className="text-primary mx-auto size-8" />
          <h2 className="text-lg font-bold">You’re not in an exchange yet</h2>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            When an administrator adds you to an exchange, your list will show up here.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/">Back home</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
