import Link from "next/link";
import { ArrowRight, Gift, Heart, Sparkles } from "lucide-react";
import { FestiveIllustration } from "@/components/secret-santa/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="mx-auto grid min-h-[calc(100svh-8rem)] max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="mx-auto max-w-2xl space-y-7">
        <div className="border-gold/40 bg-gold/10 text-gold-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
          <Sparkles className="size-3.5" /> A little holiday magic
        </div>
        <div className="space-y-4">
          <h1 className="max-w-xl text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
            Family<span className="text-primary">Secret Santa</span> Application.
          </h1>
          <p className="text-muted-foreground max-w-xl text-base leading-7 sm:text-lg">
            Bring your favorite people together, share the little things you love, and keep every
            surprise right where it belongs.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-xl px-6">
            <Link href="/preview/home">
              See the exchange preview <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6">
            <Link href="/preview/wishlists">Explore wish lists</Link>
          </Button>
        </div>
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <Card className="flex items-center gap-3 p-4 shadow-none">
            <span className="bg-secondary text-pine grid size-9 place-items-center rounded-lg">
              <Gift className="size-4" />
            </span>
            <span className="text-sm font-semibold">Draw names fairly</span>
          </Card>
          <Card className="flex items-center gap-3 p-4 shadow-none">
            <span className="bg-accent text-primary grid size-9 place-items-center rounded-lg">
              <Heart className="size-4" />
            </span>
            <span className="text-sm font-semibold">Share thoughtful hints</span>
          </Card>
          <Card className="flex items-center gap-3 p-4 shadow-none">
            <span className="bg-gold/20 text-gold-foreground grid size-9 place-items-center rounded-lg">
              <Sparkles className="size-4" />
            </span>
            <span className="text-sm font-semibold">Keep the surprise</span>
          </Card>
        </div>
      </section>
      <div className="hidden lg:block">
        <FestiveIllustration />
      </div>
    </div>
  );
}
