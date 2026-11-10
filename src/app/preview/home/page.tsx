import Link from "next/link";
import { CalendarDays, Clock3, MessageCircle, PackageCheck, Sparkles } from "lucide-react";
import { FestiveIllustration, GiftTag, PageHeading, ProgressNudge, Snowfall, WishlistItemCard, type WishItem } from "@/components/secret-santa/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const recipientItems: WishItem[] = [
  { title: "A beginner’s sourdough baking kit", store: "King Arthur Baking", domain: "kingarthurbaking.com", notes: "No special tools needed", priority: "Most wanted", price: "$32", icon: "gift" },
  { title: "A little indoor herb garden", store: "Local garden shop", domain: "idea only", notes: "Basil and mint are favorites", priority: "Would like", price: "$25–40", icon: "tree" },
];

export default function PreviewHomePage() {
  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-11">
      <Snowfall />
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="mx-auto min-w-0 w-full max-w-3xl">
          <PageHeading eyebrow="Christmas 2026" title="The countdown is on" description="Your family’s little corner of holiday magic." />
          <div className="space-y-4">
            <Card className="flex w-full min-w-0 flex-col items-stretch gap-4 border-pine/15 bg-gradient-to-br from-pine/10 via-card to-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground">Until gift day</p><div className="mt-2 flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums tracking-tight">45</span><span className="font-semibold text-muted-foreground">days to go</span></div><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4 shrink-0" /> Friday, December 25</p></div>
              <div className="grid w-full min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 rounded-xl border border-border/70 bg-card/80 p-4 sm:block sm:w-auto sm:min-w-32"><p className="text-xs font-semibold uppercase tracking-wide text-foreground">Gift budget</p><p className="row-span-2 text-right text-2xl font-extrabold text-foreground sm:mt-1 sm:text-left">$50</p><p className="text-xs text-muted-foreground">give a little, receive a little</p></div>
            </Card>

            <GiftTag recipient="Maya" />

            <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
              <div className="panel-pattern flex flex-col items-start gap-3 bg-pine px-5 py-4 text-pine-foreground sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-pine-foreground/75">Your recipient</p><h2 className="text-lg font-bold">Maya’s wish list</h2></div><Button variant="secondary" size="sm" className="h-8 shrink-0 bg-white/15 text-white hover:bg-white/25"><Clock3 className="size-3.5" /> Chat with Maya</Button></div>
              <div className="min-w-0 space-y-3 p-4 sm:p-5">{recipientItems.map((item) => <div key={item.title} className="min-w-0 space-y-2"><WishlistItemCard item={item} readOnly /><label className="ml-2 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><input type="checkbox" className="size-4 accent-primary" /> I’m getting this</label></div>)}<div className="flex justify-center pt-1 sm:justify-end"><Button asChild variant="link" size="sm" className="max-w-full whitespace-normal text-center leading-5"><Link href="/preview/wishlists/sample">See all of Maya’s list</Link></Button></div></div>
            </section>

            <Card className="flex items-center gap-4 p-4 shadow-sm sm:p-5"><div className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-pine dark:text-pine-foreground"><MessageCircle className="size-5" /></div><div className="min-w-0 flex-1"><h2 className="font-bold">A note from your Secret Santa</h2><p className="mt-1 truncate text-sm text-muted-foreground">“Do you prefer coffee or tea in the morning?”</p></div><span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread message" /></Card>

            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]"><ProgressNudge count={2} target={3} /><Card className="flex items-center gap-3 p-4 shadow-none"><div className="grid size-10 place-items-center rounded-full bg-gold/20 text-gold-foreground dark:text-gold"><PackageCheck className="size-5" /></div><div><p className="text-sm font-bold">2 wishes on your list</p><p className="mt-0.5 text-xs text-muted-foreground">One more hint would be lovely.</p></div></Card></div>
            <div className="flex items-center gap-2 rounded-xl bg-accent/70 p-3 text-xs text-accent-foreground"><Sparkles className="size-4 shrink-0" /> Remember: the best gifts come with a little thought.</div>
          </div>
        </section>
        <aside className="hidden pt-24 lg:block"><FestiveIllustration /></aside>
      </div>
    </div>
  );
}
