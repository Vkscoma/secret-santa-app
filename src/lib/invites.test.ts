import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateInviteToken } from "./invite-tokens";
import { allowlist, auditLog, exchangeParticipants, inviteRedemptions } from "./schema";

/**
 * Minimal stand-in for the Drizzle query builder. Each `select()` consumes the
 * next queued result; every builder method is chainable and the chain is
 * awaitable. Inserts and row-lock modes are recorded for assertions.
 */
const fake = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    inserts: [] as { table: unknown; values: unknown }[],
    locks: [] as string[],
  };

  function selectChain(result: unknown[]) {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "limit"]) {
      chain[method] = () => chain;
    }
    chain.for = (mode: string) => {
      state.locks.push(mode);
      return chain;
    };
    chain.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  }

  const client = {
    select: () => selectChain(state.selectResults.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  };

  const db = {
    ...client,
    transaction: async <T,>(fn: (tx: typeof client) => Promise<T>) => fn(client),
  };

  return { state, db };
});

vi.mock("@/lib/db", () => ({ db: fake.db }));

const { findActiveInvite, InviteError, redeemInviteForUser } = await import("./invites");

type InviteRow = {
  id: string;
  tokenHash: string;
  exchangeId: string;
  exchangeNameSnapshot: string;
  createdBy: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  revokedAt: Date | null;
  createdAt: Date;
};

const inviteRow: InviteRow = {
  id: "11111111-1111-4111-8111-111111111111",
  tokenHash: "hash",
  exchangeId: "22222222-2222-4222-8222-222222222222",
  exchangeNameSnapshot: "Christmas 2026",
  createdBy: null,
  expiresAt: null,
  maxUses: 2,
  revokedAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
};

/** Queues results in the order redeemInviteForUser issues its selects. */
function queueRedemption(opts: {
  status?: "open" | "drawn" | "revealed" | "closed";
  alreadyRedeemed?: boolean;
  usageCount: number;
  invite?: Partial<InviteRow>;
}) {
  fake.state.selectResults.push(
    [{ ...inviteRow, ...opts.invite }],
    [{ status: opts.status ?? "open" }],
    opts.alreadyRedeemed ? [{ id: "redemption" }] : [],
    [{ value: opts.usageCount }]
  );
}

const redeem = () =>
  redeemInviteForUser({ token: generateInviteToken(), userId: "user-1", email: " Elf@Example.com " });

const insertsInto = (table: unknown) => fake.state.inserts.filter((insert) => insert.table === table);

beforeEach(() => {
  fake.state.selectResults = [];
  fake.state.inserts = [];
  fake.state.locks = [];
});

describe("redeemInviteForUser", () => {
  it("records a redemption and allowlists the normalized email", async () => {
    queueRedemption({ usageCount: 0 });
    await expect(redeem()).resolves.toMatchObject({ invite: { id: inviteRow.id }, outcome: "joined", joinedExchange: true });
    expect(insertsInto(inviteRedemptions)).toEqual([
      { table: inviteRedemptions, values: { inviteLinkId: inviteRow.id, userId: "user-1" } },
    ]);
    expect(insertsInto(allowlist)[0]?.values).toMatchObject({ email: "elf@example.com", exchangeId: inviteRow.exchangeId });
    expect(insertsInto(exchangeParticipants)[0]?.values).toEqual({ exchangeId: inviteRow.exchangeId, userId: "user-1" });
  });

  it("locks the invite for update and the exchange for share", async () => {
    queueRedemption({ usageCount: 0 });
    await redeem();
    expect(fake.state.locks).toEqual(["update", "share"]);
  });

  it("is idempotent for the same user and does not consume another use", async () => {
    // maxUses 2 is already reached, but one of those uses is this user's.
    queueRedemption({ usageCount: 2, alreadyRedeemed: true });
    await expect(redeem()).resolves.toMatchObject({ invite: { id: inviteRow.id }, outcome: "joined" });
    expect(insertsInto(inviteRedemptions)).toHaveLength(0);
    expect(insertsInto(allowlist)).toHaveLength(1);
    expect(insertsInto(exchangeParticipants)).toHaveLength(1);
  });

  it("rejects a new user once the use count is exhausted", async () => {
    queueRedemption({ usageCount: 2 });
    await expect(redeem()).rejects.toBeInstanceOf(InviteError);
    expect(fake.state.inserts).toHaveLength(0);
  });

  it.each(["drawn", "revealed", "closed"] as const)("adds late invitees to global allowlist, not a %s draw", async (status) => {
    queueRedemption({ usageCount: 0, status });
    await expect(redeem()).resolves.toMatchObject({ outcome: "added-after-draw", joinedExchange: false, exchangeStatus: status });
    expect(insertsInto(inviteRedemptions)).toHaveLength(1);
    expect(insertsInto(allowlist)[0]?.values).toMatchObject({ email: "elf@example.com", exchangeId: null });
    expect(insertsInto(exchangeParticipants)).toHaveLength(0);
    expect(insertsInto(auditLog)[0]?.values).toMatchObject({ action: "invite.late_redeemed", targetId: inviteRow.exchangeId });
  });

  it("rejects revoked invites even for a returning user", async () => {
    queueRedemption({ usageCount: 1, alreadyRedeemed: true, invite: { revokedAt: new Date() } });
    await expect(redeem()).rejects.toBeInstanceOf(InviteError);
    expect(fake.state.inserts).toHaveLength(0);
  });

  it("rejects unknown and malformed tokens", async () => {
    await expect(redeem()).rejects.toBeInstanceOf(InviteError);
    await expect(redeemInviteForUser({ token: "not-a-token", userId: "user-1", email: "a@b.co" })).rejects.toBeInstanceOf(InviteError);
    expect(fake.state.inserts).toHaveLength(0);
  });
});

describe("findActiveInvite", () => {
  it("returns the invite for an open exchange", async () => {
    fake.state.selectResults.push([{ invite: inviteRow, exchangeStatus: "open" }], [{ value: 0 }]);
    await expect(findActiveInvite(generateInviteToken())).resolves.toEqual({ ...inviteRow, exchangeStatus: "open" });
  });

  it("keeps valid invitations usable after the draw for general account access", async () => {
    fake.state.selectResults.push([{ invite: inviteRow, exchangeStatus: "drawn" }], [{ value: 0 }]);
    await expect(findActiveInvite(generateInviteToken())).resolves.toEqual({ ...inviteRow, exchangeStatus: "drawn" });
  });

  it("returns null without querying for malformed tokens", async () => {
    fake.state.selectResults.push([{ invite: inviteRow, exchangeStatus: "open" }]);
    await expect(findActiveInvite("bad")).resolves.toBeNull();
    expect(fake.state.selectResults).toHaveLength(1);
  });
});
