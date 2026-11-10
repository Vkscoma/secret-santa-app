import {
  ArrowUpRight,
  Gift,
  Heart,
  MoreHorizontal,
  Plus,
  Snowflake,
  Sparkles,
  Star,
  TreePine,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-7 space-y-2">
      {eyebrow ? (
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-pine dark:text-pine-foreground">
          <Snowflake className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  actions = true,
}: {
  title: string;
  subtitle: string;
  actions?: boolean;
}) {
  return (
    <div className="panel-pattern relative overflow-hidden rounded-t-xl bg-pine px-5 py-4 text-pine-foreground sm:px-6">
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          <p className="mt-1 text-sm text-pine-foreground/80">{subtitle}</p>
        </div>
        {actions ? (
          <div className="flex gap-2">
            <button aria-label="List settings" className="rounded-lg bg-white/12 p-2 transition hover:bg-white/20">
              <span aria-hidden="true">⚙</span>
            </button>
            <button aria-label="Share list" className="rounded-lg bg-white/12 p-2 transition hover:bg-white/20">
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      <StringLights />
    </div>
  );
}

export function StringLights() {
  return (
    <div className="string-lights absolute inset-x-0 bottom-0 z-10 flex h-1 justify-around" aria-hidden="true">
      <span className="size-1 rounded-full bg-primary text-primary" />
      <span className="size-1 rounded-full bg-gold text-gold" />
      <span className="size-1 rounded-full bg-snow text-snow" />
      <span className="size-1 rounded-full bg-primary text-primary" />
      <span className="size-1 rounded-full bg-gold text-gold" />
      <span className="size-1 rounded-full bg-snow text-snow" />
      <span className="size-1 rounded-full bg-primary text-primary" />
      <span className="size-1 rounded-full bg-gold text-gold" />
      <span className="size-1 rounded-full bg-snow text-snow" />
      <span className="size-1 rounded-full bg-primary text-primary" />
    </div>
  );
}

export function ProgressNudge({
  count,
  target = 3,
}: {
  count: number;
  target?: number;
}) {
  const remaining = Math.max(target - count, 0);
  const value = Math.min((count / target) * 100, 100);
  return (
    <Card className="flex items-center gap-4 border-gold/30 bg-gradient-to-r from-gold/10 via-card to-card p-4 shadow-none">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-foreground dark:text-gold">
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <p className="text-sm font-bold">{remaining ? `Add ${remaining} more ${remaining === 1 ? "gift" : "gifts"}` : "Your list is looking lovely"}</p>
          <span className="text-xs font-medium text-muted-foreground">{count}/{target}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Tell your Secret Santa what you’d really like.</p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Wishlist progress"
          aria-valuenow={count}
          aria-valuemin={0}
          aria-valuemax={target}
        >
          <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${value}%` }} />
        </div>
      </div>
    </Card>
  );
}

export type WishItem = {
  title: string;
  store: string;
  domain: string;
  notes?: string;
  priority: "Most wanted" | "Would like" | "Nice to have";
  price?: string;
  icon?: "gift" | "tree" | "star";
};

export function WishlistItemCard({
  item,
  readOnly = false,
}: {
  item: WishItem;
  readOnly?: boolean;
}) {
  const Icon = item.icon === "tree" ? TreePine : item.icon === "star" ? Star : Gift;
  return (
    <article className="group flex gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-sm transition hover:shadow-md sm:gap-4 sm:p-4">
      {!readOnly ? (
        <button className="mt-1 hidden shrink-0 cursor-grab text-muted-foreground/65 sm:block" aria-label={`Reorder ${item.title}`}>
          <span aria-hidden="true">⠿</span>
        </button>
      ) : null}
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary text-pine dark:text-pine-foreground sm:size-[72px]">
        <Icon className="size-7" strokeWidth={1.6} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-bold leading-snug">{item.title}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.store} <span className="px-1">·</span> {item.domain}</p>
          </div>
          {item.priority === "Most wanted" ? <Star className="mt-0.5 size-4 shrink-0 fill-gold text-gold" aria-label="Most wanted" /> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 border-0 bg-secondary px-2 text-[10px] text-secondary-foreground">{item.priority}</Badge>
          {item.price ? <Badge variant="outline" className="h-5 px-2 text-[10px]">{item.price}</Badge> : null}
          {item.notes ? <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">{item.notes}</span> : null}
        </div>
      </div>
      {!readOnly ? (
        <button className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive" aria-label={`Remove ${item.title}`}>×</button>
      ) : null}
    </article>
  );
}

export function WishComposer() {
  return (
    <Card className="overflow-hidden border-border/80 p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Gift className="size-5" aria-hidden="true" /></div>
        <div><h2 className="text-xl font-bold">Add a wish</h2><p className="mt-1 text-sm text-muted-foreground">A link, a little detail, or just an idea.</p></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="h-12 rounded-xl px-4" placeholder="Add a wish or paste a link" aria-label="Add a wish or paste a link" />
        <Button className="h-12 rounded-xl px-5"><Plus className="size-4" aria-hidden="true" /> Add</Button>
      </div>
      <details open className="group mt-5 border-t pt-4">
        <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">More details <span className="float-right text-muted-foreground transition group-open:rotate-180">⌄</span></summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Notes <Textarea placeholder="Size, color, model, or anything helpful…" className="min-h-20 resize-none" /></label>
          <fieldset className="space-y-2 text-sm font-medium"><legend>Priority</legend><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary">Most wanted</Button><Button type="button" size="sm" variant="outline">Would like</Button><Button type="button" size="sm" variant="outline">Nice to have</Button></div></fieldset>
          <label className="space-y-2 text-sm font-medium">Price range <div className="flex gap-2"><Input inputMode="decimal" placeholder="Min" /><Input inputMode="decimal" placeholder="Max" /></div></label>
        </div>
        <Button className="mt-5 w-full rounded-xl" size="lg">Add to my list <ArrowUpRight className="size-4" /></Button>
      </details>
    </Card>
  );
}

export function GiftTag({ recipient = "Names haven’t been drawn yet" }: { recipient?: string }) {
  const waiting = recipient.startsWith("Names");
  return (
    <div className="relative overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-br from-gold/20 via-card to-card p-5 shadow-sm dark:shadow-lg">
      <div className="absolute -right-4 -top-5 size-24 rounded-full border-[12px] border-gold/10" aria-hidden="true" />
      <div className="relative flex gap-4">
        <div className="relative mt-1 grid size-12 shrink-0 place-items-center rounded-full border border-gold/60 bg-card text-gold-foreground dark:text-gold"><Gift className="size-5" /><span className="absolute -top-2 size-3 rounded-full border-2 border-card bg-gold" /></div>
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">Your gift tag</p><p className="mt-1 text-lg font-extrabold text-foreground">{waiting ? recipient : `You’re shopping for ${recipient}`}</p><p className="mt-1 text-sm text-muted-foreground">{waiting ? "The organizer will draw names soon. The surprise is safe with us." : "Their wish list is ready whenever you are."}</p></div>
      </div>
    </div>
  );
}

export function HobbiesCard({ likes = "Coffee, long walks, cozy socks, and trying new recipes." }: { likes?: string }) {
  return (
    <Card className="p-4 shadow-none sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><UserRound className="size-4 text-pine dark:text-pine-foreground" /><h3 className="font-bold">Things I like</h3></div>
        <button aria-label="More hobbies options" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><MoreHorizontal className="size-4" /></button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{likes || "You haven’t added any hobbies or interests yet."}</p>
      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-pine dark:text-pine-foreground"><Heart className="size-3.5" /> Surprise me is on</div>
    </Card>
  );
}

export function FloatingAddButton() {
  return <Button aria-label="Add a wish" className="fixed bottom-6 right-5 z-20 size-14 rounded-full p-0 shadow-lg sm:hidden"><Plus className="size-6" /></Button>;
}

export function Snowfall() {
  return <div className="pointer-events-none relative z-0 mb-2 hidden h-7 overflow-hidden text-snow/60 dark:block" aria-hidden="true"><Snowflake className="snowfall absolute left-[12%] top-0 size-4" /><Snowflake className="snowfall absolute left-[74%] top-1 size-3" /><Snowflake className="snowfall absolute left-[88%] top-0 size-4" /></div>;
}

export function FestiveIllustration() {
  return (
    <div className="relative mx-auto hidden w-full max-w-[300px] lg:block" aria-label="Snowy holiday scene with a tree and gifts" role="img">
      <div className="absolute inset-x-8 bottom-7 h-24 rounded-[50%] bg-secondary/75 blur-2xl" />
      <svg viewBox="0 0 320 320" className="relative w-full drop-shadow-sm" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="248" cy="74" r="34" className="fill-gold/35" />
        <path d="M60 238c37-21 61-10 92 0 38 13 76-1 111-3 22-1 40 5 58 17v36H0v-31c18-13 38-25 60-19Z" className="fill-snow" />
        <path d="m122 218 36-84 37 84h-19l27 31h-90l27-31h-18Z" className="fill-pine" />
        <path d="m137 185 21-51 21 51h-42Zm-17 34 19-23 19 23h-38Zm34 0 19-23 20 23h-39Z" className="fill-pine/85" />
        <path d="M154 249v-27h12v27" className="fill-gold-foreground" />
        <path d="m155 131 3-8 4 8h-7Z" className="fill-gold" />
        <rect x="49" y="219" width="47" height="39" rx="5" className="fill-primary" />
        <path d="M69 219v39m-20-24h47" className="stroke-primary-foreground/80" strokeWidth="4" />
        <path d="m69 219-8-8 12 3 7-7 1 12m-12 0 8-8" className="stroke-gold" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="215" y="229" width="54" height="33" rx="5" className="fill-gold" />
        <path d="M238 229v33m-23-18h54" className="stroke-gold-foreground/60" strokeWidth="4" />
        <path d="M73 94h35m-17-17v34m-31 24h18m-9-9v18m166-71h25m-13-13v26" className="stroke-gold/70" strokeWidth="2" strokeLinecap="round" />
        <circle cx="78" cy="178" r="3" className="fill-primary/70" /><circle cx="236" cy="169" r="4" className="fill-gold" /><circle cx="108" cy="152" r="2.5" className="fill-pine/60" />
      </svg>
      <p className="relative -mt-2 text-center text-xs font-semibold tracking-wide text-muted-foreground">A little joy, wrapped up.</p>
    </div>
  );
}
