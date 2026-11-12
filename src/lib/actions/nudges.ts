"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { requireNonAdminExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { appUrl, sendNotificationEmail } from "@/lib/email";
import { assignments, exchanges, user, wishlistItems, wishlists } from "@/lib/schema";

const exchangeIdSchema = z.string().uuid();

export async function nudgeRecipient(exchangeIdValue: string): Promise<{ ok: boolean; message: string }> {
  const parsed = exchangeIdSchema.safeParse(exchangeIdValue);
  if (!parsed.success) return { ok: false, message: "Could not send the reminder." };
  try {
    const session = await requireNonAdminExchangeMember(parsed.data);
    const [record] = await db.select({ recipientEmail: user.email, notificationPrefs: user.notificationPrefs, exchangeName: exchanges.name, status: exchanges.status, hasWishlistItems: sql<boolean>`exists (select 1 from ${wishlists} inner join ${wishlistItems} on ${wishlistItems.wishlistId} = ${wishlists.id} where ${wishlists.exchangeId} = ${assignments.exchangeId} and ${wishlists.userId} = ${assignments.receiverId})` })
      .from(assignments)
      .innerJoin(user, eq(assignments.receiverId, user.id))
      .innerJoin(exchanges, eq(assignments.exchangeId, exchanges.id))
      .where(and(eq(assignments.exchangeId, parsed.data), eq(assignments.giverId, session.user.id)))
      .limit(1);
    if (!record || record.status === "open" || record.status === "closed" || !record.recipientEmail) {
      return { ok: false, message: "Your recipient can’t be nudged right now." };
    }
    if (record.hasWishlistItems) return { ok: false, message: "Your recipient has added gift ideas already." };
    if (record.notificationPrefs?.nudges === false) return { ok: false, message: "Your recipient has turned off wishlist nudges." };
    if (!(await consumeAuthRateLimit(`wishlist-nudge:${session.user.id}:${parsed.data}`))) {
      return { ok: false, message: "Please wait before sending another reminder." };
    }

    await sendNotificationEmail({ to: record.recipientEmail, kind: "manual-nudge", exchangeName: record.exchangeName, url: appUrl(`/wishlists/${parsed.data}`) });
    return { ok: true, message: "Your recipient has been nudged by email." };
  } catch {
    return { ok: false, message: "The reminder couldn’t be sent. Please try again later." };
  }
}
