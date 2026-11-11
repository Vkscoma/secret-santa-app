import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { MobileWishlistPicker, mobileWishDestination, type MobileWishDraft } from "@/components/secret-santa/mobile-wishlist-picker";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { firstHttpUrl, safeSharedTitle } from "@/lib/mobile-wishlist";
import { exchangeParticipants, exchanges } from "@/lib/schema";

type Search = { url?: string; text?: string; title?: string };

export default async function SharedWishlistPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireAllowlisted();
  const query = await searchParams;
  const url = firstHttpUrl(query.url, query.text);
  if (!url) return <div className="mx-auto max-w-xl px-4 py-12 text-center"><h1 className="text-xl font-bold">No product link found</h1><p className="mt-2 text-sm text-muted-foreground">Share a product page or paste its link into your wish list.</p></div>;
  const title = safeSharedTitle(query.title) ?? safeSharedTitle(query.text?.replace(url, ""));
  const draft: MobileWishDraft = { url, ...(title ? { title } : {}) };
  const rows = await db.select({ id: exchanges.id, name: exchanges.name, year: exchanges.year, date: exchanges.exchangeAt })
    .from(exchangeParticipants).innerJoin(exchanges, eq(exchangeParticipants.exchangeId, exchanges.id))
    .where(eq(exchangeParticipants.userId, session.user.id)).orderBy(desc(exchanges.year));
  if (rows.length === 1) redirect(mobileWishDestination(rows[0]!.id, draft));
  return <MobileWishlistPicker exchanges={rows} draft={draft} />;
}
