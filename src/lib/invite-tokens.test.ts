import { describe, expect, it } from "vitest";
import {
  decideInviteRedemption,
  generateInviteToken,
  hashInviteToken,
  INVITE_TOKEN_PATTERN,
  isExchangeJoinable,
  isInviteUsable,
  maySendMagicLink,
  normalizeEmail,
  trustedRoleForEmail,
  type InvitePolicyRecord,
} from "./invite-tokens";

const NOW = new Date("2026-12-01T00:00:00Z");
const openInvite: InvitePolicyRecord = { expiresAt: null, maxUses: null, revokedAt: null };

describe("invite tokens", () => {
  it("generates an unpersisted-format token and one-way hash", () => {
    const token = generateInviteToken();
    expect(token).toMatch(INVITE_TOKEN_PATTERN);
    expect(hashInviteToken(token)).not.toBe(token);
    expect(hashInviteToken(token)).toHaveLength(64);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it("generates distinct tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateInviteToken));
    expect(tokens.size).toBe(100);
  });

  it("rejects malformed tokens by pattern", () => {
    expect(INVITE_TOKEN_PATTERN.test("short")).toBe(false);
    expect(INVITE_TOKEN_PATTERN.test(`${"a".repeat(42)}!`)).toBe(false);
    expect(INVITE_TOKEN_PATTERN.test("a".repeat(44))).toBe(false);
  });

  it("normalizes email addresses consistently", () => {
    expect(normalizeEmail("  Santa@Example.COM ")).toBe("santa@example.com");
  });
});

describe("isInviteUsable", () => {
  it("accepts an unrestricted invite to an open exchange", () => {
    expect(isInviteUsable(openInvite, "open", 0, NOW)).toBe(true);
    expect(isInviteUsable(openInvite, "open", 10_000, NOW)).toBe(true);
  });

  it.each(["drawn", "revealed", "closed"] as const)(
    "keeps %s invites redeemable for general allowlist access",
    (status) => {
      expect(isExchangeJoinable(status)).toBe(false);
      expect(isInviteUsable(openInvite, status, 0, NOW)).toBe(true);
    }
  );

  it("rejects revoked invites", () => {
    expect(isInviteUsable({ ...openInvite, revokedAt: NOW }, "open", 0, NOW)).toBe(false);
  });

  it("treats expiry as exclusive at the exact boundary", () => {
    const at = (ms: number) => ({ ...openInvite, expiresAt: new Date(NOW.getTime() + ms) });
    expect(isInviteUsable(at(1), "open", 0, NOW)).toBe(true);
    expect(isInviteUsable(at(0), "open", 0, NOW)).toBe(false);
    expect(isInviteUsable(at(-1), "open", 0, NOW)).toBe(false);
  });

  it("enforces max uses, including a limit of zero", () => {
    expect(isInviteUsable({ ...openInvite, maxUses: 0 }, "open", 0, NOW)).toBe(false);
    expect(isInviteUsable({ ...openInvite, maxUses: 2 }, "open", 1, NOW)).toBe(true);
    expect(isInviteUsable({ ...openInvite, maxUses: 2 }, "open", 2, NOW)).toBe(false);
    expect(isInviteUsable({ ...openInvite, maxUses: 2 }, "open", 3, NOW)).toBe(false);
  });
});

describe("decideInviteRedemption", () => {
  const decide = (overrides: Partial<Parameters<typeof decideInviteRedemption>[0]>) =>
    decideInviteRedemption({
      invite: openInvite,
      exchangeStatus: "open",
      usageCount: 0,
      alreadyRedeemed: false,
      now: NOW,
      ...overrides,
    });

  it("redeems a fresh invite for a new user", () => {
    expect(decide({})).toBe("redeem");
  });

  it("is idempotent for a repeat redemption and does not consume a use", () => {
    // The user's own earlier redemption filled the last slot.
    expect(
      decide({ invite: { ...openInvite, maxUses: 1 }, usageCount: 1, alreadyRedeemed: true })
    ).toBe("already-redeemed");
  });

  it("rejects new users once the use count is exhausted", () => {
    expect(decide({ invite: { ...openInvite, maxUses: 1 }, usageCount: 1 })).toBe("reject");
  });

  it("rejects repeat redemptions of revoked or expired invites but permits drawn invites", () => {
    expect(
      decide({ alreadyRedeemed: true, usageCount: 1, invite: { ...openInvite, revokedAt: NOW } })
    ).toBe("reject");
    expect(
      decide({ alreadyRedeemed: true, usageCount: 1, invite: { ...openInvite, expiresAt: NOW } })
    ).toBe("reject");
    expect(decide({ alreadyRedeemed: true, usageCount: 1, exchangeStatus: "drawn" })).toBe(
      "already-redeemed"
    );
  });

  it.each(["drawn", "revealed", "closed"] as const)(
    "redeems late invites for global allowlist access after %s",
    (status) => {
      expect(decide({ exchangeStatus: status })).toBe("redeem");
    }
  );
});

describe("magic-link and role policy", () => {
  it("sends magic links to any eligible address within both rate limits", () => {
    const base = {
      isEligible: true,
      emailWithinRateLimit: true,
      ipWithinRateLimit: true,
    };
    expect(maySendMagicLink(base)).toBe(true);
    expect(maySendMagicLink({ ...base, isEligible: false })).toBe(false);
    expect(maySendMagicLink({ ...base, emailWithinRateLimit: false })).toBe(false);
    expect(maySendMagicLink({ ...base, ipWithinRateLimit: false })).toBe(false);
  });

  it("sets admin role only for the trusted super-admin address", () => {
    expect(trustedRoleForEmail("  ADMIN@EXAMPLE.COM ", "admin@example.com")).toBe("admin");
    expect(trustedRoleForEmail("user@example.com", "admin@example.com")).toBe("user");
    expect(trustedRoleForEmail("admin@example.com", undefined)).toBe("user");
  });
});
