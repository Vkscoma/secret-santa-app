import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { ArrowRight, Gift, Sparkles } from "lucide-react";
import { PageHeading, ProgressNudge } from "@/components/secret-santa/components";
import { NudgeButton } from "@/components/secret-santa/nudge-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignments, exchangeParticipants, exchanges, user, wishlistItems, wishlists } from "@/lib/schema";
import { headers } from "next/headers";
import { isEmailAllowlisted } from "@/lib/auth-access";
import { calendarDaysUntil } from "@/lib/exchange-countdown";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(await isEmailAllowlisted(session.user.email))) return <div className="mx-auto grid min-h-[calc(100svh-8rem)] max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="mx-auto max-w-2xl space-y-7"><div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold-foreground"><Sparkles className="size-3.5" /> A little holiday magic</div><div className="space-y-4"><h1 className="max-w-xl text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">Family <span className="text-primary">Secret Santa</span></h1><p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">Bring your favorite people together, share the little things you love, and keep every surprise right where it belongs.</p></div><Button asChild size="lg"><Link href="/login">Log In <ArrowRight className="size-4" /></Link></Button></section></div>;
  const rows = await db.select({ id: exchanges.id, name: exchanges.name, year: exchanges.year, budgetMin: exchanges.budgetMin, budgetMax: exchanges.budgetMax, exchangeAt: exchanges.exchangeAt, timeZone: exchanges.timeZone, status: exchanges.status, wishlistId: wishlists.id, ownItems: sql<number>`count(distinct ${wishlistItems.id})::int` })
    .from(exchangeParticipants).innerJoin(exchanges, eq(exchangeParticipants.exchangeId, exchanges.id))
    .leftJoin(wishlists, and(eq(wishlists.exchangeId, exchanges.id), eq(wishlists.userId, session.user.id)))
    .leftJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
    .where(eq(exchangeParticipants.userId, session.user.id)).groupBy(exchanges.id, wishlists.id).orderBy(asc(exchanges.exchangeAt));
  const cards = await Promise.all(rows.map(async (exchange) => {
    const [giving] = await db.select({ assignmentId: assignments.id, recipientId: assignments.receiverId, displayName: user.displayName, name: user.name }).from(assignments).innerJoin(user, eq(assignments.receiverId, user.id)).where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.giverId, session.user.id))).limit(1);
    return { exchange, giving };
  }));
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12"><PageHeading title="Your Secret Santa" description="Everything for your holiday exchange, all in one place." />{cards.length === 0 ? <Card className="space-y-3 p-6 text-center"><Gift className="mx-auto size-8 text-primary" /><h2 className="font-bold">No exchanges yet</h2><p className="text-sm text-muted-foreground">When you join an exchange, it will appear here.</p></Card> : cards.map(({ exchange, giving }) => {
    const days = calendarDaysUntil(exchange.exchangeAt, new Date(now), exchange.timeZone);
    const budget = exchange.budgetMin === exchange.budgetMax ? `$${exchange.budgetMax ?? "—"}` : `$${exchange.budgetMin ?? 0}–$${exchange.budgetMax ?? "—"}`;
    return <section key={exchange.id} className="space-y-4"><Card className="space-y-5 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{exchange.year} exchange</p><h2 className="mt-1 text-2xl font-extrabold">{exchange.name}</h2></div><span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">{budget} budget</span></div><div className="rounded-xl bg-gold/10 p-4"><p className="font-bold">{exchange.status === "open" ? "Names haven't been drawn yet" : `${days > 0 ? `${days} days until the exchange` : "Exchange day is here"}`}</p><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: exchange.timeZone }).format(exchange.exchangeAt)} · {exchange.timeZone}</p></div>{giving ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><p className="text-sm text-muted-foreground">You’re shopping for</p><p className="text-lg font-bold">{giving.displayName || giving.name}</p></div><Button asChild><Link href={`/wishlists/${exchange.id}/recipient`}>View their list <ArrowRight className="size-4" /></Link></Button></div> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Your recipient and their list will appear after names are drawn.</p>}{giving && exchange.status !== "closed" && <NudgeButton exchangeId={exchange.id} />}<Link href={`/wishlists/${exchange.id}`} className="block"><ProgressNudge count={exchange.ownItems} /></Link></Card></section>;
  })}</div>;
}
