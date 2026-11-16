import Link from "next/link";
import { CalendarDays, Clock3, PackageCheck, Sparkles } from "lucide-react";
import { FestiveIllustration, GiftTag, PageHeading, ProgressNudge, Snowfall } from "@/components/secret-santa/components";
import { RecipientGiftCard, type RecipientGiftItem } from "@/components/secret-santa/recipient-gift-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const recipientName = "Michelle";
const recipientItems: RecipientGiftItem[] = [
  { id: "preview-kate-spade", title: "www.katespadeoutlet.com", url: "https://www.katespadeoutlet.com/products/example", storeName: "www.katespadeoutlet.com", imageUrl: null, notes: "A small crossbody in black", priority: "most_wanted", priceMin: 60, priceMax: 90, previewPrice: null, previewCurrency: null, priceFetchedAt: null },
  { id: "preview-quince", title: "www.quince.com", url: "https://www.quince.com/products/example", storeName: "www.quince.com", imageUrl: null, notes: "Soft and easy to care for", priority: "would_like", priceMin: null, priceMax: null, previewPrice: null, previewCurrency: null, priceFetchedAt: null },
];

export default function PreviewHomePage() {
  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-11">
      <Snowfall />
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="mx-auto min-w-0 w-full max-w-3xl">
          <PageHeading eyebrow="Christmas 2026" title="The countdown is on" description="Your family’s little corner of holiday magic." />
          <div className="space-y-4">
            <Card className="flex w-full min-w-0 flex-col items-stretch gap-4 border-pine/15 dark:border-border/80 bg-gradient-to-br from-pine/10 via-card to-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground">Until gift day</p><div className="mt-2 flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums tracking-tight">45</span><span className="font-semibold text-muted-foreground">days to go</span></div><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4 shrink-0" /> Friday, December 25</p></div>
              <div className="grid w-full min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 rounded-xl border border-border/70 dark:border-border/80 bg-card/80 p-4 sm:block sm:w-auto sm:min-w-32"><p className="text-xs font-semibold uppercase tracking-wide text-foreground">Gift budget</p><p className="row-span-2 text-right text-2xl font-extrabold text-foreground sm:mt-1 sm:text-left">$50</p><p className="text-xs text-muted-foreground">give a little, receive a little</p></div>
            </Card>

            <GiftTag recipient={recipientName} />

            <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
              <div className="panel-pattern flex flex-col items-start gap-3 bg-pine px-5 py-4 text-pine-foreground sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-pine-foreground/75">Your recipient</p><h2 className="text-lg font-bold">{recipientName}’s wish list</h2></div>{recipientItems.length === 0 && <Button variant="neutral-inverse" size="sm" className="h-11 shrink-0"><Clock3 className="size-3.5" /> Nudge by email</Button>}</div>
              <div className="min-w-0 space-y-3 p-4 sm:p-5">{recipientItems.map((item) => <RecipientGiftCard key={item.id} item={item} exchangeId="preview" claimed={false} compact previewMode />)}<div className="flex justify-center pt-1 sm:justify-end"><Button asChild variant="neutral" size="sm" className="max-w-full whitespace-normal text-center leading-5"><Link href="/preview/wishlists/sample">See all of {recipientName}’s list</Link></Button></div></div>
            </section>

            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]"><ProgressNudge count={2} target={3} /><Card className="flex items-center gap-3 p-4 shadow-none"><div className="grid size-10 place-items-center rounded-full bg-gold/20 text-gold-foreground dark:text-gold"><PackageCheck className="size-5" /></div><div><p className="text-sm font-bold">2 wishes on your list</p><p className="mt-0.5 text-xs text-muted-foreground">One more hint would be lovely.</p></div></Card></div>
            <div className="flex items-center gap-2 rounded-xl bg-accent/70 p-3 text-xs text-accent-foreground dark:bg-accent"><Sparkles className="size-4 shrink-0" /> Remember: the best gifts come with a little thought.</div>
          </div>
        </section>
        <aside className="hidden pt-24 lg:block"><FestiveIllustration /></aside>
      </div>
    </div>
  );
}
