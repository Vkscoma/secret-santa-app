import Link from "next/link";
import { ArrowLeft, Heart, Settings2, Share2 } from "lucide-react";
import { FestiveIllustration, HobbiesCard, PageHeading, PanelHeader, ProgressNudge, WishComposer, WishlistItemCard, type WishItem } from "@/components/secret-santa/components";
import { MobileAddWish } from "@/components/secret-santa/mobile-add-wish";
import { Button } from "@/components/ui/button";

const items: WishItem[] = [
  { title: "The Little Book of Hygge", store: "Bookshop.org", domain: "bookshop.org", notes: "Hardcover, if possible", priority: "Most wanted", price: "$18–25", icon: "gift" },
  { title: "Ceramic pour-over coffee set", store: "East Fork", domain: "eastfork.com", notes: "Warm white or moss", priority: "Would like", price: "$35–55", icon: "tree" },
  { title: "A cozy wool blanket for slow Sundays", store: "Any local shop", domain: "idea only", notes: "Soft, earthy colors", priority: "Nice to have", price: "$$", icon: "star" },
];

function WishListPanel() {
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <PanelHeader title="Christmas 2026" subtitle="3 gifts · Budget $50" />
      <div className="space-y-4 p-4 sm:p-5">
        <ProgressNudge count={3} target={3} />
        <div className="space-y-3">{items.map((item) => <WishlistItemCard key={item.title} item={item} />)}</div>
        <div className="flex justify-center"><Button variant="outline" size="sm" className="rounded-full"><Heart className="size-3.5 text-primary" /> Things I like</Button></div>
        <HobbiesCard />
      </div>
    </section>
  );
}

export default function PreviewWishlistEditorPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/preview/wishlists" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> All wish lists</Link>
      <PageHeading eyebrow="Christmas 2026" title="A list full of little joys" description="Add a wish or browse the ideas you’ve already saved. Your Secret Santa will thank you." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.92fr)] xl:gap-8">
        <div className="order-2 space-y-4 lg:order-1">
          <div className="hidden lg:block"><WishComposer /></div>
        </div>
        <div className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2"><WishListPanel /><div className="flex justify-end gap-2"><Button variant="outline" className="rounded-xl"><Settings2 className="size-4" /> List settings</Button><Button variant="outline" className="rounded-xl"><Share2 className="size-4" /> Share</Button></div><div className="hidden lg:block"><FestiveIllustration /></div></div>
      </div>
      <MobileAddWish />
    </div>
  );
}
