"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getEligibleUserIdsForExchange } from "@/lib/admin-data";
import { isSuperAdminEmail } from "@/lib/auth-access";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { drawSecretSanta } from "@/lib/draw";
import { localTimeToUtc } from "@/lib/exchange-time";
import { normalizeEmail } from "@/lib/invite-tokens";
import { createInviteRecord } from "@/lib/invites";
import {
  allowlist,
  assignments,
  auditLog,
  exchangeParticipants,
  exchanges,
  exclusions,
  inviteLinks,
  itemClaims,
  wishlistItems,
  wishlists,
  user,
} from "@/lib/schema";

const idSchema = z.string().uuid();
const exchangeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  year: z.coerce.number().int().min(2020).max(2200),
  budgetMin: z.preprocess((value) => value === "" ? null : Number(value), z.number().int().min(0).max(100_000).nullable()),
  budgetMax: z.preprocess((value) => value === "" ? null : Number(value), z.number().int().min(0).max(100_000).nullable()),
  exchangeAt: z.string().min(16),
  timeZone: z.string().min(1).max(80),
  notes: z.string().max(2_000),
  autoReveal: z.boolean(),
});

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function requireChecked(formData: FormData, key: string, message: string) {
  if (!z.literal("on").safeParse(formData.get(key)).success) throw new Error(message);
}

function auditValues(input: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return {
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  };
}

async function writeAudit(input: Parameters<typeof auditValues>[0]) {
  await db.insert(auditLog).values(auditValues(input));
}

function parseExchange(formData: FormData) {
  const parsed = exchangeSchema.safeParse({
    name: field(formData, "name"),
    year: field(formData, "year"),
    budgetMin: field(formData, "budgetMin"),
    budgetMax: field(formData, "budgetMax"),
    exchangeAt: field(formData, "exchangeAt"),
    timeZone: field(formData, "timeZone"),
    notes: field(formData, "notes"),
    autoReveal: formData.get("autoReveal") === "on",
  });
  if (!parsed.success) throw new Error("Check the exchange details and try again.");
  if (parsed.data.budgetMin !== null && parsed.data.budgetMax !== null && parsed.data.budgetMin > parsed.data.budgetMax) {
    throw new Error("The maximum budget must be at least the minimum budget.");
  }
  const exchangeAt = localTimeToUtc(parsed.data.exchangeAt, parsed.data.timeZone);
  return { ...parsed.data, exchangeAt };
}

export async function createExchange(formData: FormData) {
  const session = await requireAdmin();
  const values = parseExchange(formData);
  const [exchange] = await db.insert(exchanges).values({ ...values, createdBy: session.user.id }).returning({ id: exchanges.id });
  if (!exchange) throw new Error("Could not create the exchange.");
  await writeAudit({ actorId: session.user.id, action: "exchange.created", targetType: "exchange", targetId: exchange.id });
  revalidatePath("/admin");
  redirect(`/admin/exchanges/${exchange.id}`);
}

export async function updateExchange(formData: FormData) {
  const session = await requireAdmin();
  const id = idSchema.parse(field(formData, "exchangeId"));
  const values = parseExchange(formData);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, id)).for("update");
    if (!current) throw new Error("Exchange not found.");
    if (current.status !== "open") throw new Error("Exchange details are locked after the draw.");
    await tx.update(exchanges).set(values).where(eq(exchanges.id, id));
    await tx.insert(auditLog).values(auditValues({ actorId: session.user.id, action: "exchange.updated", targetType: "exchange", targetId: id }));
  });
  revalidatePath(`/admin/exchanges/${id}`);
  revalidatePath("/admin");
}

export async function setExchangeParticipants(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  const participantIds = [...new Set(formData.getAll("participantId").filter((value): value is string => typeof value === "string"))];
  if (participantIds.some((id) => !idSchema.safeParse(id).success)) throw new Error("Invalid participant selection.");
  const eligibleIds = await getEligibleUserIdsForExchange(exchangeId, participantIds);
  if (eligibleIds.size !== participantIds.length) throw new Error("Participants must have an eligible account for this exchange.");

  await db.transaction(async (tx) => {
    const [exchange] = await tx.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    if (exchange.status !== "open") throw new Error("Participants are locked after the draw.");
    await tx.delete(exchangeParticipants).where(eq(exchangeParticipants.exchangeId, exchangeId));
    if (participantIds.length) {
      await tx.insert(exchangeParticipants).values(participantIds.map((userId) => ({ exchangeId, userId })));
    }
    await tx.insert(auditLog).values(auditValues({ actorId: session.user.id, action: "exchange.participants_updated", targetType: "exchange", targetId: exchangeId, metadata: { count: participantIds.length } }));
  });
  revalidatePath(`/admin/exchanges/${exchangeId}`);
}

export async function setExchangeExclusions(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  const pairSchema = z.tuple([z.string().min(1), z.string().min(1)]);
  const pairs = formData.getAll("exclusion").map((value) => {
    if (typeof value !== "string") throw new Error("Invalid exclusion.");
    let untrusted: unknown;
    try { untrusted = JSON.parse(value); } catch { throw new Error("Invalid exclusion."); }
    const parsed = pairSchema.safeParse(untrusted);
    if (!parsed.success) throw new Error("Invalid exclusion.");
    const [giverId, receiverId] = parsed.data;
    if (giverId === receiverId) throw new Error("Exclusions must be between two different participants.");
    return { giverId, receiverId };
  });
  const deduped = [...new Map(pairs.map((pair) => [`${pair.giverId}\0${pair.receiverId}`, pair])).values()];

  await db.transaction(async (tx) => {
    const [exchange] = await tx.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    if (exchange.status !== "open") throw new Error("Exclusions are locked after the draw.");
    const participantRows = await tx.select({ userId: exchangeParticipants.userId }).from(exchangeParticipants).where(eq(exchangeParticipants.exchangeId, exchangeId));
    const currentIds = new Set(participantRows.map(({ userId }) => userId));
    if (pairs.some(({ giverId, receiverId }) => !currentIds.has(giverId) || !currentIds.has(receiverId))) {
      throw new Error("Exclusions must be between current participants.");
    }
    await tx.delete(exclusions).where(eq(exclusions.exchangeId, exchangeId));
    if (deduped.length) await tx.insert(exclusions).values(deduped.map((pair) => ({ ...pair, exchangeId })));
    await tx.insert(auditLog).values(auditValues({ actorId: session.user.id, action: "exchange.exclusions_updated", targetType: "exchange", targetId: exchangeId, metadata: { count: deduped.length } }));
  });
  revalidatePath(`/admin/exchanges/${exchangeId}`);
}

async function createDraw(exchangeId: string, actorId: string, redraw: boolean) {
  await db.transaction(async (tx) => {
    const [exchange] = await tx.select().from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    if (redraw ? exchange.status === "open" || exchange.status === "closed" : exchange.status !== "open") {
      throw new Error(redraw ? "Only a drawn or revealed exchange can be redrawn." : "This exchange has already been drawn.");
    }
    const participants = await tx.select({ userId: exchangeParticipants.userId }).from(exchangeParticipants).where(eq(exchangeParticipants.exchangeId, exchangeId));
    const participantIds = participants.map(({ userId }) => userId);
    if (participantIds.length < 2) throw new Error("Add at least two participants before drawing.");
    const excluded = await tx.select({ giverId: exclusions.giverId, receiverId: exclusions.receiverId }).from(exclusions).where(eq(exclusions.exchangeId, exchangeId));

  const prior = await tx.select({ giverId: assignments.giverId, receiverId: assignments.receiverId })
      .from(assignments)
      .innerJoin(exchanges, eq(assignments.exchangeId, exchanges.id))
      .where(and(sql`${exchanges.year} between ${exchange.year - 2} and ${exchange.year - 1}`, inArray(assignments.giverId, participantIds), inArray(assignments.receiverId, participantIds)));
    const result = drawSecretSanta({ participantIds, exclusions: excluded, previousPairs: prior });

    if (redraw) {
      const exchangeWishlistItems = tx.select({ id: wishlistItems.id })
        .from(wishlistItems)
        .innerJoin(wishlists, eq(wishlistItems.wishlistId, wishlists.id))
        .where(eq(wishlists.exchangeId, exchangeId));
      await tx.delete(itemClaims).where(inArray(itemClaims.itemId, exchangeWishlistItems));
      // Assignment-linked participant data is removed with the assignment.
      await tx.delete(assignments).where(eq(assignments.exchangeId, exchangeId));
    }
    await tx.insert(assignments).values(result.map((pair) => ({ exchangeId, ...pair })));
    await tx.update(exchanges).set({ status: "drawn" }).where(eq(exchanges.id, exchangeId));
    await tx.insert(auditLog).values(auditValues({
      actorId,
      action: redraw ? "exchange.redrawn" : "exchange.drawn",
      targetType: "exchange",
      targetId: exchangeId,
      metadata: { participants: participantIds.length, priorPairsConsidered: prior.length },
    }));
  });
}

export async function drawExchange(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  await createDraw(exchangeId, session.user.id, false);
  revalidatePath(`/admin/exchanges/${exchangeId}`);
  revalidatePath("/admin");
}

export async function redrawExchange(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  requireChecked(formData, "confirmRedraw", "Confirm the redraw and item claim reset before continuing.");
  await createDraw(exchangeId, session.user.id, true);
  revalidatePath(`/admin/exchanges/${exchangeId}`);
  revalidatePath("/admin");
}

export async function revealExchange(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  requireChecked(formData, "confirmReveal", "Confirm the reveal before continuing.");
  await db.transaction(async (tx) => {
    const [exchange] = await tx.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    if (exchange.status !== "drawn") throw new Error("Only a drawn exchange can be revealed.");
    await tx.update(exchanges).set({ status: "revealed" }).where(eq(exchanges.id, exchangeId));
    await tx.insert(auditLog).values(auditValues({ actorId: session.user.id, action: "exchange.revealed", targetType: "exchange", targetId: exchangeId }));
  });
  revalidatePath(`/admin/exchanges/${exchangeId}`);
  revalidatePath("/admin");
}

export async function closeExchange(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  await db.transaction(async (tx) => {
    const [exchange] = await tx.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");
    if (!exchange) throw new Error("Exchange not found.");
    if (exchange.status !== "revealed") throw new Error("Reveal the exchange before closing it.");
    await tx.update(exchanges).set({ status: "closed" }).where(eq(exchanges.id, exchangeId));
    await tx.insert(auditLog).values(auditValues({ actorId: session.user.id, action: "exchange.closed", targetType: "exchange", targetId: exchangeId }));
  });
  revalidatePath(`/admin/exchanges/${exchangeId}`);
  revalidatePath("/admin");
}

export async function addAllowlistEntry(formData: FormData) {
  const session = await requireAdmin();
  const parsed = z.string().trim().email().max(320).safeParse(field(formData, "email"));
  if (!parsed.success) throw new Error("Enter a valid email address.");
  const email = normalizeEmail(parsed.data);
  const exchangeId = field(formData, "exchangeId") || null;
  if (exchangeId) {
    const [exchange] = await db.select({ status: exchanges.status }).from(exchanges).where(eq(exchanges.id, idSchema.parse(exchangeId))).limit(1);
    if (!exchange || exchange.status !== "open") throw new Error("Allowlist entries can only be added to an open exchange.");
  }
  const conditions = exchangeId
    ? and(eq(allowlist.email, email), eq(allowlist.exchangeId, exchangeId))
    : and(eq(allowlist.email, email), isNull(allowlist.exchangeId));
  const [existing] = await db.select({ id: allowlist.id }).from(allowlist).where(conditions).limit(1);
  if (!existing) {
    await db.insert(allowlist).values({ email, exchangeId });
    await writeAudit({ actorId: session.user.id, action: "allowlist.added", targetType: "allowlist", metadata: { email, exchangeId } });
  }
  revalidatePath("/admin");
  if (exchangeId) revalidatePath(`/admin/exchanges/${exchangeId}`);
}

export async function removeAllowlistEntry(formData: FormData) {
  const session = await requireAdmin();
  const id = idSchema.parse(field(formData, "allowlistId"));
  const [entry] = await db.select({ id: allowlist.id, email: allowlist.email, exchangeId: allowlist.exchangeId }).from(allowlist).where(eq(allowlist.id, id)).limit(1);
  if (!entry) return;
  if (isSuperAdminEmail(entry.email) && entry.exchangeId === null) throw new Error("The configured super-admin cannot be removed from the global allowlist.");
  await db.delete(allowlist).where(eq(allowlist.id, id));
  await writeAudit({ actorId: session.user.id, action: "allowlist.removed", targetType: "allowlist", metadata: { email: entry.email, exchangeId: entry.exchangeId } });
  revalidatePath("/admin");
}

export type CreateInviteState = { message?: string; inviteUrl?: string };

export async function createExchangeInvite(_previous: CreateInviteState, formData: FormData): Promise<CreateInviteState> {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  const expiresInDays = z.coerce.number().int().min(1).max(365).safeParse(field(formData, "expiresInDays"));
  const maxUses = z.preprocess((value) => value === "" ? null : Number(value), z.number().int().min(1).max(10_000).nullable()).safeParse(field(formData, "maxUses"));
  if (!expiresInDays.success || !maxUses.success) return { message: "Check the invite expiration and use limit." };
  const [exchange] = await db.select({ name: exchanges.name, status: exchanges.status }).from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange || exchange.status !== "open") return { message: "Invites can only be created for an open exchange." };
  const { token } = await createInviteRecord({
    exchangeId,
    exchangeName: exchange.name,
    createdBy: session.user.id,
    expiresAt: new Date(Date.now() + expiresInDays.data * 86_400_000),
    maxUses: maxUses.data,
  });
  await writeAudit({ actorId: session.user.id, action: "invite.created", targetType: "exchange", targetId: exchangeId, metadata: { expiresInDays: expiresInDays.data, maxUses: maxUses.data } });
  revalidatePath(`/admin/exchanges/${exchangeId}`);
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return { message: "Invite created. Copy this private link now; the raw token is shown only once.", inviteUrl: `${origin.replace(/\/$/, "")}/join/${token}` };
}

export async function revokeExchangeInvite(formData: FormData) {
  const session = await requireAdmin();
  const inviteId = idSchema.parse(field(formData, "inviteId"));
  const [invite] = await db.select({ exchangeId: inviteLinks.exchangeId, revokedAt: inviteLinks.revokedAt }).from(inviteLinks).where(eq(inviteLinks.id, inviteId)).limit(1);
  if (!invite) return;
  if (invite.revokedAt) return;
  await db.update(inviteLinks).set({ revokedAt: new Date() }).where(eq(inviteLinks.id, inviteId));
  await writeAudit({ actorId: session.user.id, action: "invite.revoked", targetType: "exchange", targetId: invite.exchangeId, metadata: { inviteId } });
  revalidatePath(`/admin/exchanges/${invite.exchangeId}`);
}

export async function setUserRole(formData: FormData) {
  const session = await requireAdmin();
  const targetId = z.string().min(1).max(160).parse(field(formData, "userId"));
  const role = z.enum(["user", "admin"]).parse(field(formData, "role"));
  await db.transaction(async (tx) => {
    const admins = await tx.select({ id: user.id }).from(user).where(eq(user.role, "admin")).for("update");
    const [target] = await tx.select({ email: user.email, role: user.role }).from(user).where(eq(user.id, targetId)).for("update");
    if (!target) throw new Error("User not found.");
    if (isSuperAdminEmail(target.email) && role !== "admin") throw new Error("The configured super-admin role cannot be changed.");
    if (target.role === "admin" && role === "user" && admins.length <= 1) {
      throw new Error("The app must always have at least one administrator.");
    }
    await tx.update(user).set({ role }).where(eq(user.id, targetId));
    await tx.insert(auditLog).values({ actorId: session.user.id, action: "user.role_changed", targetType: "user", metadata: { userId: targetId, previousRole: target.role, role } });
  });
  revalidatePath("/admin");
}

export async function saveUserSettings(formData: FormData) {
  const session = await requireAdmin();
  const targetId = z.string().min(1).max(160).parse(field(formData, "userId"));
  const values = z.object({
    displayName: z.string().trim().max(100),
    shippingAddress: z.string().trim().max(1_000),
    sizes: z.string().trim().max(500),
    notes: z.string().trim().max(2_000),
    notificationPrefs: z.object({ reminders: z.boolean(), nudges: z.boolean(), digests: z.boolean() }),
  }).safeParse({
    displayName: field(formData, "displayName"),
    shippingAddress: field(formData, "shippingAddress"),
    sizes: field(formData, "sizes"),
    notes: field(formData, "notes"),
    notificationPrefs: {
      reminders: formData.get("prefReminders") === "on",
      nudges: formData.get("prefNudges") === "on",
      digests: formData.get("prefDigests") === "on",
    },
  });
  if (!values.success) throw new Error("Check the profile details and try again.");
  await db.update(user).set({ displayName: values.data.displayName || null, shippingAddress: values.data.shippingAddress || null, sizes: values.data.sizes || null, notes: values.data.notes || null, notificationPrefs: values.data.notificationPrefs }).where(eq(user.id, targetId));
  await writeAudit({ actorId: session.user.id, action: "user.settings_updated", targetType: "user", metadata: { userId: targetId } });
  revalidatePath("/admin");
}

export async function requestExchangeReminders(formData: FormData) {
  const session = await requireAdmin();
  const exchangeId = idSchema.parse(field(formData, "exchangeId"));
  const [exchange] = await db.select({ status: exchanges.status, name: exchanges.name, exchangeAt: exchanges.exchangeAt, timeZone: exchanges.timeZone }).from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1);
  if (!exchange || exchange.status === "closed") throw new Error("Reminders are unavailable for this exchange.");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Reminder email is not configured yet.");
  const recipients = await db.select({ id: user.id, name: user.name, email: user.email, notificationPrefs: user.notificationPrefs })
    .from(exchangeParticipants)
    .innerJoin(user, eq(exchangeParticipants.userId, user.id))
    .where(eq(exchangeParticipants.exchangeId, exchangeId));
  const eligible = recipients.filter(({ notificationPrefs }) => notificationPrefs?.reminders !== false);
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: exchange.timeZone }).format(exchange.exchangeAt);
  const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  let sentCount = 0;
  let failedCount = 0;
  await Promise.all(eligible.map(async (recipient) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `exchange-reminder/${exchangeId}/${recipient.id}/${new Date().toISOString().slice(0, 10)}`,
      },
      body: JSON.stringify({
        from,
        to: [recipient.email],
        subject: `A reminder about ${exchange.name}`,
        html: `<p>Hi ${escapeHtml(recipient.name)},</p><p>${escapeHtml(exchange.name)} is coming up on ${escapeHtml(when)}.</p><p>Sign in to Secret Santa to check your list and share any final gift ideas.</p>`,
      }),
    }).catch(() => null);
    if (response?.ok) sentCount += 1;
    else failedCount += 1;
  }));
  await writeAudit({ actorId: session.user.id, action: "exchange.reminders_sent", targetType: "exchange", targetId: exchangeId, metadata: { attempted: eligible.length, sent: sentCount, failed: failedCount } });
  if (failedCount) throw new Error(`Sent ${sentCount} reminder(s); ${failedCount} could not be delivered. Check the email provider before retrying.`);
  revalidatePath(`/admin/exchanges/${exchangeId}`);
}
