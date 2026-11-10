import { createHash, randomBytes } from "node:crypto";

export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type InvitePolicyRecord = {
  expiresAt: Date | null;
  maxUses: number | null;
  revokedAt: Date | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function maySendMagicLink(input: {
  isEligible: boolean;
  emailWithinRateLimit: boolean;
  ipWithinRateLimit: boolean;
}): boolean {
  return (
    input.isEligible &&
    input.emailWithinRateLimit &&
    input.ipWithinRateLimit
  );
}

export function trustedRoleForEmail(email: string, superAdminEmail: string | undefined) {
  return superAdminEmail && normalizeEmail(email) === normalizeEmail(superAdminEmail)
    ? "admin"
    : "user";
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mirrors the `exchange_status` enum in `schema.ts`; kept local so this module stays pure. */
export type ExchangeStatus = "open" | "drawn" | "revealed" | "closed";

/**
 * Only `open` exchanges accept new members. The spec locks an exchange once
 * names are drawn (open -> drawn -> revealed -> closed), so letting someone
 * join afterwards would leave them without an assignment.
 */
export function isExchangeJoinable(status: ExchangeStatus): boolean {
  return status === "open";
}

export function isInviteUsable(
  invite: InvitePolicyRecord,
  _exchangeStatus: ExchangeStatus,
  usageCount: number,
  now = new Date()
): boolean {
  // Invitation redemption may grant global access after a draw. Callers must
  // use isExchangeJoinable separately before creating exchange membership.
  if (invite.revokedAt) return false;
  // Expiry is exclusive: an invite is unusable from the exact expiry instant.
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  // `maxUses` of null means unlimited; 0 (or less) means no uses at all.
  if (invite.maxUses !== null && usageCount >= invite.maxUses) return false;
  return true;
}

export type InviteRedemptionDecision = "redeem" | "already-redeemed" | "reject";

/**
 * Decides what redeeming an invite should do. A user who already redeemed the
 * invite does not consume another use, but the invite must still be valid
 * (not revoked, expired, or exhausted) so a revoked link cannot re-add someone
 * an admin removed. Exchange enrollment is gated separately by status. Their own earlier use is excluded from the count
 * so reaching the limit with their redemption does not lock them out.
 */
export function decideInviteRedemption(input: {
  invite: InvitePolicyRecord;
  exchangeStatus: ExchangeStatus;
  usageCount: number;
  alreadyRedeemed: boolean;
  now?: Date;
}): InviteRedemptionDecision {
  const { invite, exchangeStatus, usageCount, alreadyRedeemed, now = new Date() } = input;
  if (alreadyRedeemed) {
    return isInviteUsable(invite, exchangeStatus, Math.max(usageCount - 1, 0), now)
      ? "already-redeemed"
      : "reject";
  }
  return isInviteUsable(invite, exchangeStatus, usageCount, now) ? "redeem" : "reject";
}
