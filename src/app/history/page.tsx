import Link from "next/link";
import { and, desc, eq, lt } from "drizzle-orm";
import { ArrowRight, CalendarDays, Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { isPastHistoryExchange, mayShowSantaIdentity } from "@/lib/history-policy";
import { assignments, exchangeParticipants, exchanges, user } from "@/lib/schema";

export default async function HistoryPage() {
  const session = await requireAllowlisted();
  const currentYear = new Date().getFullYear();
  const rows = await db.select({
    id: exchanges.id,
    name: exchanges.name,
    year: exchanges.year,
    date: exchanges.exchangeAt,
    timeZone: exchanges.timeZone,
    budgetMin: exchanges.budgetMin,
    budgetMax: exchanges.budgetMax,
    status: exchanges.status,
    autoReveal: exchanges.autoReveal,
  }).from(exchangeParticipants)
    .innerJoin(exchanges, eq(exchangeParticipants.exchangeId, exchanges.id))
    .where(and(eq(exchangeParticipants.userId, session.user.id), lt(exchanges.year, currentYear)))
    .orderBy(desc(exchanges.year), desc(exchanges.exchangeAt));
  const history = rows.filter((exchange) => isPastHistoryExchange(exchange.year, currentYear, exchange.status));
  const cards = await Promise.all(history.map(async (exchange) => {
    const [recipient] = await db.select({ name: user.displayName, fallbackName: user.name })
      .from(assignments).innerJoin(user, eq(assignments.receiverId, user.id))
      .where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.giverId, session.user.id))).limit(1);
    let santa: { name: string | null; fallbackName: string } | undefined;
    if (mayShowSantaIdentity(exchange.status, exchange.autoReveal, exchange.date)) {
      const [assignment] = await db.select({ name: user.displayName, fallbackName: user.name })
        .from(assignments).innerJoin(user, eq(assignments.giverId, user.id))
        .where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.receiverId, session.user.id))).limit(1);
      santa = assignment;
    }
    return { exchange, recipient, santa };
  }));

  return <div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
    <PageHeading eyebrow="Years of little surprises" title="Exchange history" description="Look back at your past exchanges and the gift ideas saved for each year." />
    {cards.length ? <div className="space-y-4">{cards.map(({ exchange, recipient, santa }) => {
      const budget = exchange.budgetMin === exchange.budgetMax
        ? `$${exchange.budgetMax ?? "—"}`
        : `$${exchange.budgetMin ?? 0}–$${exchange.budgetMax ?? "—"}`;
      return <Card key={exchange.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-pine"><Gift className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{exchange.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: exchange.timeZone }).format(exchange.date)} <span aria-hidden="true">·</span> {budget} budget</p>
            <p className="mt-2 text-sm">{recipient ? <>You gave to <span className="font-semibold">{recipient.name || recipient.fallbackName}</span></> : "Your assignment is unavailable."}</p>
            {santa && <p className="mt-1 text-sm text-muted-foreground">Your Secret Santa was <span className="font-semibold text-foreground">{santa.name || santa.fallbackName}</span>.</p>}
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0"><Link href={`/history/${exchange.id}`}>View saved list <ArrowRight className="size-4" /></Link></Button>
      </Card>;
    })}</div> : <Card className="space-y-3 p-6 text-center sm:p-8">
      <Gift className="mx-auto size-8 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-bold">Your first exchange is still ahead</h2>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">When a past exchange is saved, you’ll find it here.</p>
      <Button asChild variant="outline" className="mt-2"><Link href="/">Back home</Link></Button>
    </Card>}
  </div>;
}
