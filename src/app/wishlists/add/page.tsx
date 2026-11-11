import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { MobileWishlistPicker, mobileWishDestination, type MobileWishDraft } from "@/components/secret-santa/mobile-wishlist-picker";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { iosWishlistPayloadSchema, parseIosPayload, safeSharedTitle } from "@/lib/mobile-wishlist";
import { exchangeParticipants, exchanges } from "@/lib/schema";

type Search = { url?: string; payload?: string; title?: string; image?: string; price?: string; brand?: string };

export default async function AddFromPhonePage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const payload = parseIosPayload(query.payload);
  const raw = payload ?? (query.url ? { url: query.url, title: query.title, image: query.image, price: query.price, brand: query.brand } : null);
  const parsed = raw ? iosWishlistPayloadSchema.safeParse(raw) : null;
  if (!parsed?.success) return <div className="mx-auto max-w-xl px-4 py-12 text-center"><h1 className="text-xl font-bold">Add a wish from your phone</h1><p className="mt-2 text-sm text-muted-foreground">Open this shortcut from a product page, or include a valid product link.</p></div>;
  const item = parsed.data;
  const title = safeSharedTitle(item.title);
  const rawPrice = item.price === undefined ? "" : String(item.price).replace(/[$,\s]/g, "");
  const numericPrice = /^(?:\d+)(?:\.\d{1,2})?$/.test(rawPrice) && Number(rawPrice) <= 1_000_000 ? rawPrice : undefined;
  const draft: MobileWishDraft = {
    url: item.url,
    ...(title ? { title } : {}),
    ...(item.image ? { image: item.image } : {}),
    ...(numericPrice && (!item.currency || item.currency.toUpperCase() === "USD") ? { price: numericPrice } : {}),
    ...(item.brand ? { brand: item.brand } : {}),
  };
  const session = await requireAllowlisted();
  const rows = await db.select({ id: exchanges.id, name: exchanges.name, year: exchanges.year, date: exchanges.exchangeAt })
    .from(exchangeParticipants).innerJoin(exchanges, eq(exchangeParticipants.exchangeId, exchanges.id))
    .where(eq(exchangeParticipants.userId, session.user.id)).orderBy(desc(exchanges.year));
  if (rows.length === 1) redirect(mobileWishDestination(rows[0]!.id, draft));
  return <MobileWishlistPicker exchanges={rows} draft={draft} />;
}
