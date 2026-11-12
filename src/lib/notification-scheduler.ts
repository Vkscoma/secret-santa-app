import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { appUrl, deliverIdempotently, sendNotificationEmail } from "@/lib/email";
import { retryableEmailLogPredicate } from "@/lib/email-log-predicate";
import { dueReminderMilestones, reminderIdempotencyKey, selectWishlistDigestCandidates, wishlistDigestIdempotencyKey } from "@/lib/notification-policy";
import { assignments, emailLog, exchangeParticipants, exchanges, user, wishlists, wishlistItems } from "@/lib/schema";

type Candidate = { to: string; userId: string; exchangeId: string; exchangeName: string; kind: "assignment" | "reminder" | "empty-wishlist" | "wishlist-digest"; path: string; key: string; name?: string; detail?: string };

function localDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayDistance(from: string, to: string) {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year!, month! - 1, day!);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function weekKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

async function deliver(candidate: Candidate) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  return deliverIdempotently({
    claim: async () => {
      const [claim] = await db.insert(emailLog).values({
        recipientUserId: candidate.userId,
        exchangeId: candidate.exchangeId,
        type: candidate.kind,
        idempotencyKey: candidate.key,
        status: "pending",
      }).onConflictDoUpdate({
        target: emailLog.idempotencyKey,
        set: { status: "pending", error: null, errorAt: null, updatedAt: now },
        setWhere: retryableEmailLogPredicate(staleBefore),
      }).returning({ id: emailLog.id });
      return claim ?? null;
    },
    send: async () => sendNotificationEmail({
        to: candidate.to,
        kind: candidate.kind,
        url: appUrl(candidate.path),
        ...(candidate.name ? { name: candidate.name } : {}),
        exchangeName: candidate.exchangeName,
        ...(candidate.detail ? { detail: candidate.detail } : {}),
        idempotencyKey: candidate.key,
      }),
    markSent: async (claim, response) => {
      await db.update(emailLog).set({ status: "sent", sentAt: new Date(), providerId: response?.id ?? null, error: null }).where(eq(emailLog.id, claim.id));
    },
    markFailed: async (claim, error) => {
      await db.update(emailLog).set({ status: "failed", errorAt: new Date(), error: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed." }).where(eq(emailLog.id, claim.id));
    },
  });
}

export async function sendAssignmentNotifications(exchangeId: string) {
  const exchange = await db.select({ id: exchanges.id, name: exchanges.name }).from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange[0]) return { sent: 0, failed: 0 };
  const giver = alias(user, "assignment_email_giver");
  const rows = await db.select({ assignmentId: assignments.id, userId: giver.id, to: giver.email })
    .from(assignments).innerJoin(giver, eq(assignments.giverId, giver.id)).where(eq(assignments.exchangeId, exchangeId));
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await deliver({ userId: row.userId, to: row.to, exchangeId, exchangeName: exchange[0].name, kind: "assignment", path: "/", key: `assignment:${exchangeId}:${row.userId}:${row.assignmentId}` });
    if (result === "sent") sent++;
    if (result === "failed") failed++;
  }
  return { sent, failed };
}

export async function sendManualExchangeReminders(exchangeId: string) {
  const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange || exchange.status === "closed") return { attempted: 0, sent: 0, failed: 0 };
  const rows = await db.select({ id: user.id, email: user.email, name: user.name, prefs: user.notificationPrefs })
    .from(exchangeParticipants).innerJoin(user, eq(exchangeParticipants.userId, user.id))
    .where(eq(exchangeParticipants.exchangeId, exchangeId));
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.prefs?.reminders === false) continue;
    attempted++;
    const result = await deliver({ userId: row.id, to: row.email, name: row.name, exchangeId, exchangeName: exchange.name, kind: "reminder", path: "/", key: `manual-reminder:${exchangeId}:${row.id}:${new Date().toISOString().slice(0, 10)}`, detail: `A reminder about ${exchange.name}. The exchange is scheduled for ${localDate(exchange.exchangeAt, exchange.timeZone)}.` });
    if (result === "sent") sent++;
    if (result === "failed") failed++;
  }
  return { attempted, sent, failed };
}

export async function runNotificationSchedule(now = new Date()) {
  let sent = 0;
  let failed = 0;
  const activeExchanges = await db.select().from(exchanges).where(inArray(exchanges.status, ["open", "drawn", "revealed"]));

  for (const exchange of activeExchanges) {
    const today = localDate(now, exchange.timeZone);
    const daysUntil = dayDistance(today, localDate(exchange.exchangeAt, exchange.timeZone));
    const participants = await db.select({ userId: user.id, email: user.email, name: user.name, prefs: user.notificationPrefs })
      .from(exchangeParticipants).innerJoin(user, eq(exchangeParticipants.userId, user.id)).where(eq(exchangeParticipants.exchangeId, exchange.id));

    for (const participant of participants) {
      const assignment = await db.select({ id: assignments.id })
        .from(assignments).where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.giverId, participant.userId))).limit(1);
      if (assignment[0]) {
        await deliver({ userId: participant.userId, to: participant.email, exchangeId: exchange.id, exchangeName: exchange.name, kind: "assignment", path: "/", key: `assignment:${exchange.id}:${participant.userId}:${assignment[0].id}` }).then((status) => { if (status === "sent") sent++; if (status === "failed") failed++; });
      }

      if (participant.prefs?.reminders !== false) {
        for (const milestone of dueReminderMilestones(daysUntil)) {
          const result = await deliver({ userId: participant.userId, to: participant.email, name: participant.name, exchangeId: exchange.id, exchangeName: exchange.name, kind: "reminder", path: "/", key: reminderIdempotencyKey(exchange.id, participant.userId, milestone), detail: `Your exchange is ${milestone} day${milestone === 1 ? "" : "s"} from its scheduled date. Open Secret Santa to check your gift ideas.` });
          if (result === "sent") sent++;
          if (result === "failed") failed++;
        }
      }
    }

    const giver = alias(user, "wishlist_digest_giver");
    const digestCutoff = new Date(now.getTime() - 24 * 60 * 60_000);
    const digestRows = await db.select({ giverId: giver.id, email: giver.email })
      .from(assignments).innerJoin(giver, eq(assignments.giverId, giver.id))
      .innerJoin(wishlists, and(eq(wishlists.exchangeId, assignments.exchangeId), eq(wishlists.userId, assignments.receiverId)))
      .where(and(eq(assignments.exchangeId, exchange.id), gte(wishlists.updatedAt, digestCutoff), lte(wishlists.updatedAt, now)));
    const staleBefore = new Date(now.getTime() - 10 * 60_000);
    const retryRows = await db.select({ giverId: giver.id, email: giver.email, key: emailLog.idempotencyKey })
      .from(emailLog).innerJoin(giver, eq(emailLog.recipientUserId, giver.id))
      .where(and(eq(emailLog.exchangeId, exchange.id), eq(emailLog.type, "wishlist-digest"), retryableEmailLogPredicate(staleBefore)));
    const digestCandidates = selectWishlistDigestCandidates(
      digestRows.map((row) => ({ ...row, key: wishlistDigestIdempotencyKey(exchange.id, row.giverId, today) })),
      retryRows,
    );
    for (const row of digestCandidates) {
      const [preference] = await db.select({ notificationPrefs: giver.notificationPrefs }).from(giver).where(eq(giver.id, row.giverId)).limit(1);
      if (preference?.notificationPrefs?.digests === false) continue;
      const result = await deliver({ userId: row.giverId, to: row.email, exchangeId: exchange.id, exchangeName: exchange.name, kind: "wishlist-digest", path: `/wishlists/${exchange.id}/recipient`, key: row.key });
      if (result === "sent") sent++;
      if (result === "failed") failed++;
    }

    if (exchange.status !== "open") {
      const emptyRows = await db.select({ ownerId: exchangeParticipants.userId, email: user.email, name: user.name, prefs: user.notificationPrefs, surpriseMe: wishlists.surpriseMe })
        .from(exchangeParticipants).innerJoin(user, eq(exchangeParticipants.userId, user.id))
        .leftJoin(wishlists, and(eq(wishlists.exchangeId, exchange.id), eq(wishlists.userId, exchangeParticipants.userId)))
        .leftJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
        .where(and(eq(exchangeParticipants.exchangeId, exchange.id), isNull(wishlistItems.id), or(isNull(wishlists.id), eq(wishlists.surpriseMe, false))));
      for (const row of emptyRows) {
        if (row.prefs?.nudges === false) continue;
        const lastWeek = await db.select({ sentAt: emailLog.sentAt }).from(emailLog)
          .where(and(eq(emailLog.recipientUserId, row.ownerId), eq(emailLog.exchangeId, exchange.id), eq(emailLog.type, "empty-wishlist"), eq(emailLog.status, "sent"))).orderBy(sql`${emailLog.sentAt} desc`).limit(1);
        if (lastWeek[0]?.sentAt && now.getTime() - lastWeek[0].sentAt.getTime() < 7 * 86_400_000) continue;
        const key = `empty-wishlist:${exchange.id}:${row.ownerId}:${weekKey(today)}`;
        const result = await deliver({ userId: row.ownerId, to: row.email, name: row.name, exchangeId: exchange.id, exchangeName: exchange.name, kind: "empty-wishlist", path: `/wishlists/${exchange.id}`, key });
        if (result === "sent") sent++;
        if (result === "failed") failed++;
      }
    }
  }

  return { sent, failed };
}
