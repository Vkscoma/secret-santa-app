"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { isSuperAdminEmail } from "@/lib/auth-access";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { evaluatePairings, type PairingCheckState } from "@/lib/pairing-check";
import { assignments, exchangeParticipants, exchanges, exclusions } from "@/lib/schema";

export type { PairingCheckResult, PairingCheckState, PairingRuleResult } from "@/lib/pairing-check";

export async function checkExchangePairings(_previous: PairingCheckState, formData: FormData): Promise<PairingCheckState> {
  const session = await requireAdmin();
  if (!isSuperAdminEmail(session.user.email)) throw new Error("Forbidden");

  const parsedId = z.string().uuid().safeParse(formData.get("exchangeId"));
  if (!parsedId.success) return { error: "This exchange could not be checked. Refresh the page and try again." };
  const exchangeId = parsedId.data;

  try {
    const [exchange] = await db.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
    if (!exchange) return { error: "This exchange could not be found." };
    if (exchange.status !== "drawn") return { error: "Pairings can only be checked after names have been drawn and before the public reveal." };

    const [participantRows, pairingRows, exclusionRows] = await Promise.all([
      db.select({ userId: exchangeParticipants.userId }).from(exchangeParticipants).where(eq(exchangeParticipants.exchangeId, exchangeId)),
      db.select({ giverId: assignments.giverId, receiverId: assignments.receiverId }).from(assignments).where(eq(assignments.exchangeId, exchangeId)),
      db.select({ giverId: exclusions.giverId, receiverId: exclusions.receiverId }).from(exclusions).where(eq(exclusions.exchangeId, exchangeId)),
    ]);

    return { result: evaluatePairings(
      participantRows.map(({ userId }) => userId),
      pairingRows,
      exclusionRows,
    ) };
  } catch {
    return { error: "We couldn’t check the pairings just now. Try again in a moment." };
  }
}
