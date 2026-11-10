import Link from "next/link";
import { ArrowRight, Gift, Settings2, Share2 } from "lucide-react";
import { FestiveIllustration, PageHeading } from "@/components/secret-santa/components";
import { Card } from "@/components/ui/card";

const years = [
  { title: "Christmas 2026", count: "4 gifts", status: "This year", colors: ["bg-primary/80", "bg-pine/70", "bg-gold", "bg-secondary"] },
  { title: "Christmas 2025", count: "6 gifts", status: "Past exchange", colors: ["bg-gold", "bg-primary/70", "bg-pine/60", "bg-accent", "bg-secondary", "bg-primary/40"] },
];

export default function PreviewWishlistsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="mx-auto w-full max-w-3xl">
        <PageHeading eyebrow="Your holiday ideas" title="My wish lists" description="A few thoughtful hints make it easier for your Secret Santa to find something you’ll love." />
        <div className="space-y-4">
          {years.map((year, index) => (
            <Card key={year.title} className="overflow-hidden border-border/80 shadow-sm">
              <div className="flex items-start justify-between gap-3 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-pine dark:text-pine-foreground">{year.status}</p>
                  <Link href="/preview/wishlists/sample" className="group flex items-center gap-2 text-lg font-bold hover:text-primary">{year.title}<ArrowRight className="size-4 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" /></Link>
                  <p className="mt-1 text-sm text-muted-foreground">{year.count} <span className="px-1">·</span> Gift exchange</p>
                </div>
                <div className="flex gap-1.5">
                  <button aria-label={`Settings for ${year.title}`} className="rounded-lg bg-secondary p-2 text-secondary-foreground hover:bg-secondary/70"><Settings2 className="size-4" /></button>
                  <button aria-label={`Share ${year.title}`} className="rounded-lg bg-secondary p-2 text-secondary-foreground hover:bg-secondary/70"><Share2 className="size-4" /></button>
                </div>
              </div>
              <div className="flex gap-2 border-t bg-muted/75 px-5 py-3 sm:px-6">
                {year.colors.map((color, itemIndex) => <div key={`${year.title}-${itemIndex}`} className={`grid size-10 place-items-center rounded-lg ${color} ${color === "bg-secondary" ? "text-pine dark:text-pine-foreground" : "text-primary-foreground"}`}><Gift className="size-4" /></div>)}
                {index === 0 ? <p className="ml-1 self-center text-xs text-muted-foreground">and one more surprise…</p> : null}
              </div>
            </Card>
          ))}
        </div>
      </section>
      <aside className="hidden pt-16 lg:block"><FestiveIllustration /></aside>
    </div>
  );
}
