import Link from "next/link";
import { CalendarDays, Clock3, PackageCheck, Sparkles } from "lucide-react";
import {
  FestiveIllustration,
  GiftTag,
  PageHeading,
  ProgressNudge,
  Snowfall,
} from "@/components/secret-santa/components";
import {
  RecipientGiftCard,
  type RecipientGiftItem,
} from "@/components/secret-santa/recipient-gift-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const recipientName = "Michelle";
const recipientItems: RecipientGiftItem[] = [
  {
    id: "preview-kate-spade",
    title: "www.katespadeoutlet.com",
    url: "https://www.katespadeoutlet.com/products/example",
    storeName: "www.katespadeoutlet.com",
    imageUrl: null,
    notes: "A small crossbody in black",
    priority: "most_wanted",
    priceMin: 60,
    priceMax: 90,
    previewPrice: null,
    previewCurrency: null,
    priceFetchedAt: null,
  },
  {
    id: "preview-quince",
    title: "www.quince.com",
    url: "https://www.quince.com/products/example",
    storeName: "www.quince.com",
    imageUrl: null,
    notes: "Soft and easy to care for",
    priority: "would_like",
    priceMin: null,
    priceMax: null,
    previewPrice: null,
    previewCurrency: null,
    priceFetchedAt: null,
  },
];

export default function PreviewHomePage() {
  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-11">
      <Snowfall />
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="mx-auto w-full max-w-3xl min-w-0">
          <PageHeading
            eyebrow="Christmas 2026"
            title="The countdown is on"
            description="Your family’s little corner of holiday magic."
          />
          <div className="space-y-4">
            <Card className="border-pine/15 dark:border-border/80 from-pine/10 via-card to-card flex w-full min-w-0 flex-col items-stretch gap-4 bg-gradient-to-br p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-foreground text-xs font-bold tracking-[0.15em] uppercase">
                  Until gift day
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight tabular-nums">45</span>
                  <span className="text-muted-foreground font-semibold">days to go</span>
                </div>
                <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                  <CalendarDays className="size-4 shrink-0" /> Friday, December 25
                </p>
              </div>
              <div className="border-border/70 dark:border-border/80 bg-card/80 grid w-full min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 rounded-xl border p-4 sm:block sm:w-auto sm:min-w-32">
                <p className="text-foreground text-xs font-semibold tracking-wide uppercase">
                  Gift budget
                </p>
                <p className="text-foreground row-span-2 text-right text-2xl font-extrabold sm:mt-1 sm:text-left">
                  $50
                </p>
                <p className="text-muted-foreground text-xs">give a little, receive a little</p>
              </div>
            </Card>

            <GiftTag recipient={recipientName} />

            <section className="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
              <div className="panel-pattern bg-pine text-pine-foreground flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-pine-foreground/75 text-xs font-bold tracking-wider uppercase">
                    Your recipient
                  </p>
                  <h2 className="text-lg font-bold">{recipientName}’s wish list</h2>
                </div>
                {recipientItems.length === 0 && (
                  <Button variant="neutral-inverse" size="sm" className="h-11 shrink-0">
                    <Clock3 className="size-3.5" /> Nudge by email
                  </Button>
                )}
              </div>
              <div className="min-w-0 space-y-3 p-4 sm:p-5">
                {recipientItems.map((item) => (
                  <RecipientGiftCard
                    key={item.id}
                    item={item}
                    exchangeId="preview"
                    claimState="available"
                    compact
                    previewMode
                  />
                ))}
                <div className="flex justify-center pt-1 sm:justify-end">
                  <Button
                    asChild
                    variant="neutral"
                    size="sm"
                    className="max-w-full text-center leading-5 whitespace-normal"
                  >
                    <Link href="/preview/wishlists/sample">See all of {recipientName}’s list</Link>
                  </Button>
                </div>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <ProgressNudge count={2} target={3} />
              <Card className="flex items-center gap-3 p-4 shadow-none">
                <div className="bg-gold/20 text-gold-foreground dark:text-gold grid size-10 place-items-center rounded-full">
                  <PackageCheck className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">2 wishes on your list</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    One more hint would be lovely.
                  </p>
                </div>
              </Card>
            </div>
            <div className="bg-accent/70 text-accent-foreground dark:bg-accent flex items-center gap-2 rounded-xl p-3 text-xs">
              <Sparkles className="size-4 shrink-0" /> Remember: the best gifts come with a little
              thought.
            </div>
          </div>
        </section>
        <aside className="hidden pt-24 lg:block">
          <FestiveIllustration />
        </aside>
      </div>
    </div>
  );
}
