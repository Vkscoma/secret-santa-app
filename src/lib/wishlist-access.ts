import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exchanges, exchangeParticipants } from "@/lib/schema";

export async function requireEditableExchange(exchangeId: string, userId: string) {
  const [exchange] = await db.select({ status: exchanges.status, year: exchanges.year }).from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange) throw new Error("Exchange not found.");
  if (exchange.year < new Date().getFullYear()) throw new Error("Past exchange wishlists are read-only in history.");
  if (exchange.status === "closed") throw new Error("This exchange is closed; its wishlist is read-only.");
  const [membership] = await db.select({ id: exchangeParticipants.id }).from(exchangeParticipants)
    .where(and(eq(exchangeParticipants.exchangeId, exchangeId), eq(exchangeParticipants.userId, userId))).limit(1);
  if (!membership) throw new Error("You are not a participant in this exchange.");
}

