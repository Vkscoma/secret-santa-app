import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { CalendarDays, Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { WishlistBreadcrumb } from "@/components/secret-santa/wishlist-breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { exchangeParticipants, exchanges } from "@/lib/schema";

export default async function WishlistsPage() {
  const session = await requireAllowlisted();
  const currentYear = new Date().getFullYear();
  const rows = await db
    .select({
      id: exchanges.id,
      name: exchanges.name,
      year: exchanges.year,
      date: exchanges.exchangeAt,
      status: exchanges.status,
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
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((exchange) => (
            <Card key={exchange.id} className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl">
                  <Gift className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold">{exchange.name}</h2>
                  <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                    <CalendarDays className="size-4" />
                    {exchange.year} ·{" "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                      exchange.date
                    )}
                  </p>
                </div>
                <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-semibold capitalize">
                  {exchange.status}
                </span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button asChild>
                  <Link
                    href={
                      exchange.year < currentYear
                        ? `/history/${exchange.id}`
                        : `/wishlists/${exchange.id}`
                    }
                  >
                    {exchange.year < currentYear ? "View saved list" : "Open my list"}
                  </Link>
                </Button>
                {exchange.year >= currentYear && exchange.status !== "open" && (
                  <Button asChild variant="outline">
                    <Link href={`/wishlists/${exchange.id}/recipient`}>Recipient’s List</Link>
                  </Button>
                )}
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
