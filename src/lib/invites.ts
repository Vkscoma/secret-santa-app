import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  decideInviteRedemption,
  generateInviteToken,
  hashInviteToken,
  isInviteUsable,
  INVITE_TOKEN_PATTERN,
  normalizeEmail,
} from "@/lib/invite-tokens";
import { allowlist, auditLog, exchangeParticipants, exchanges, inviteLinks, inviteRedemptions } from "@/lib/schema";

export class InviteError extends Error {
  constructor(message = "This invitation is invalid or no longer available.") {
    super(message);
    this.name = "InviteError";
  }
}

export async function findActiveInvite(token: string) {
  if (!INVITE_TOKEN_PATTERN.test(token)) return null;

  const tokenHash = hashInviteToken(token);
  const [row] = await db
    .select({ invite: inviteLinks, exchangeStatus: exchanges.status })
    .from(inviteLinks)
    .innerJoin(exchanges, eq(inviteLinks.exchangeId, exchanges.id))
    .where(eq(inviteLinks.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  const [usage] = await db
    .select({ value: count() })
    .from(inviteRedemptions)
    .where(eq(inviteRedemptions.inviteLinkId, row.invite.id));

  return isInviteUsable(row.invite, row.exchangeStatus, Number(usage?.value ?? 0))
    ? { ...row.invite, exchangeStatus: row.exchangeStatus }
    : null;
}

export async function canUseInvite(token: string): Promise<boolean> {
  return Boolean(await findActiveInvite(token));
}

export async function createInviteRecord(input: {
  exchangeId: string;
  exchangeName: string;
  createdBy: string;
  expiresAt?: Date | null;
  maxUses?: number | null;
}) {
  const token = generateInviteToken();
  const [invite] = await db
    .insert(inviteLinks)
    .values({
      tokenHash: hashInviteToken(token),
      exchangeId: input.exchangeId,
      exchangeNameSnapshot: input.exchangeName,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? null,
    })
    .returning({ id: inviteLinks.id });

  if (!invite) throw new InviteError("Could not create invitation.");
  return { id: invite.id, token };
}

export async function redeemInviteForUser(input: {
  token: string;
  userId: string;
  email: string;
}) {
  if (!INVITE_TOKEN_PATTERN.test(input.token)) throw new InviteError();

  const tokenHash = hashInviteToken(input.token);
  const email = normalizeEmail(input.email);

  return db.transaction(async (tx) => {
    // Lock the invite row so concurrent redemptions serialize on the use count.
    const [invite] = await tx
      .select()
      .from(inviteLinks)
      .where(eq(inviteLinks.tokenHash, tokenHash))
      .limit(1)
      .for("update");

    if (!invite) throw new InviteError();

    // A share lock blocks a concurrent draw from flipping the status until we commit.
    const [exchange] = await tx
      .select({ status: exchanges.status })
      .from(exchanges)
      .where(eq(exchanges.id, invite.exchangeId))
      .limit(1)
      .for("share");

    if (!exchange) throw new InviteError();

    const [existingRedemption] = await tx
      .select({ id: inviteRedemptions.id })
      .from(inviteRedemptions)
      .where(
        and(
          eq(inviteRedemptions.inviteLinkId, invite.id),
          eq(inviteRedemptions.userId, input.userId)
        )
      )
      .limit(1);

    const [usage] = await tx
      .select({ value: count() })
      .from(inviteRedemptions)
      .where(eq(inviteRedemptions.inviteLinkId, invite.id));

    const decision = decideInviteRedemption({
      invite,
      exchangeStatus: exchange.status,
      usageCount: Number(usage?.value ?? 0),
      alreadyRedeemed: Boolean(existingRedemption),
    });

    if (decision === "reject") throw new InviteError();

    if (decision === "redeem") {
      await tx
        .insert(inviteRedemptions)
        .values({ inviteLinkId: invite.id, userId: input.userId })
        .onConflictDoNothing();
    }

    const joinedExchange = exchange.status === "open";
    await tx.insert(allowlist).values({
      email,
      exchangeId: joinedExchange ? invite.exchangeId : null,
    }).onConflictDoNothing();

    if (joinedExchange) {
      await tx.insert(exchangeParticipants).values({ exchangeId: invite.exchangeId, userId: input.userId }).onConflictDoNothing();
    }

    await tx.insert(auditLog).values({
      actorId: input.userId,
      action: joinedExchange ? "invite.redeemed" : "invite.late_redeemed",
      targetType: "exchange",
      targetId: invite.exchangeId,
      metadata: { inviteId: invite.id, userId: input.userId },
    });

    return {
      invite,
      exchangeStatus: exchange.status,
      joinedExchange,
      outcome: joinedExchange ? "joined" as const : "added-after-draw" as const,
    };
  });
}
