import Link from "next/link";
import { CalendarDays, Gift } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ExchangeOption = { id: string; name: string; year: number; date: Date };
export type MobileWishDraft = { url: string; title?: string; image?: string; price?: string | number; brand?: string };

export function mobileWishDestination(exchangeId: string, draft: MobileWishDraft) {
  const query = new URLSearchParams({ url: draft.url });
  if (draft.title) query.set("sharedTitle", draft.title);
  if (draft.image) query.set("sharedImage", draft.image);
  if (draft.price !== undefined) query.set("sharedPrice", String(draft.price));
  if (draft.brand) query.set("sharedBrand", draft.brand);
  return `/wishlists/${encodeURIComponent(exchangeId)}?${query.toString()}`;
}

export function MobileWishlistPicker({ exchanges, draft }: { exchanges: ExchangeOption[]; draft: MobileWishDraft }) {
  return <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
    <PageHeading eyebrow="Add to a wish list" title="Choose an exchange" description="Pick which wish list should get this shared item." />
    {exchanges.length ? <div className="space-y-3">{exchanges.map((exchange) => <Card key={exchange.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-pine"><Gift className="size-5" /></span><div className="min-w-0"><h2 className="truncate font-bold">{exchange.name}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" />{exchange.year} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(exchange.date)}</p></div></div>
      <Button asChild><Link href={mobileWishDestination(exchange.id, draft)}>Add here</Link></Button>
    </Card>)}</div> : <Card className="space-y-3 p-6 text-center"><Gift className="mx-auto size-8 text-primary" /><h2 className="font-bold">You’re not in an exchange yet</h2><p className="text-sm text-muted-foreground">An administrator needs to add you to an exchange before you can add a wish.</p></Card>}
  </div>;
}
