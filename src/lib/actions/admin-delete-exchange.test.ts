import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "admin-user", email: "admin@example.test" } },
  superAdmin: true,
  transaction: vi.fn(),
  auditValues: [] as unknown[],
  deletes: [] as unknown[],
  revalidated: [] as string[],
  exchange: { name: "Holiday Gathering", year: 2026 } as { name: string; year: number } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => { mocks.revalidated.push(path); } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(), count: vi.fn(), eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: vi.fn(), isNull: vi.fn(), sql: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireAdmin: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth-access", () => ({ isSuperAdminEmail: () => mocks.superAdmin }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/admin-data", () => ({ getEligibleUserIdsForExchange: vi.fn() }));
vi.mock("@/lib/draw", () => ({ drawSecretSanta: vi.fn() }));
vi.mock("@/lib/exchange-time", () => ({ localTimeToUtc: vi.fn() }));
vi.mock("@/lib/invite-tokens", () => ({ normalizeEmail: (email: string) => email.toLowerCase() }));
vi.mock("@/lib/invites", () => ({ createInviteRecord: vi.fn() }));
vi.mock("@/lib/notification-scheduler", () => ({ sendAssignmentNotifications: vi.fn(), sendManualExchangeReminders: vi.fn() }));
vi.mock("@/lib/redraw-policy", () => ({ hasLegacyMessageRows: vi.fn() }));
vi.mock("@/lib/schema", () => {
  const col = (name: string) => ({ name });
  const table = (names: string[]) => Object.fromEntries(names.map((name) => [name, col(name)]));
  return {
    allowlist: table(["id", "email", "exchangeId"]), assignments: table(["id", "exchangeId", "giverId", "receiverId"]),
    auditLog: table(["id"]), exchangeParticipants: table(["id", "exchangeId", "userId"]), exchanges: table(["id", "name", "year", "status"]),
    exclusions: table(["id", "exchangeId", "giverId", "receiverId"]), inviteLinks: table(["id", "exchangeId", "revokedAt"]),
    itemClaims: table(["id", "itemId"]), messages: table(["id", "assignmentId"]), wishlistItems: table(["id", "wishlistId"]),
    wishlists: table(["id", "exchangeId", "userId"]), user: table(["id", "email", "role"]),
  };
});

const { deleteExchange } = await import("./admin");

function exchangeForm() {
  const form = new FormData();
  form.set("exchangeId", "0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4");
  return form;
}

describe("deleteExchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.superAdmin = true;
    mocks.exchange = { name: "Holiday Gathering", year: 2026 };
    mocks.revalidated.length = 0;
    mocks.auditValues.length = 0;
    mocks.deletes.length = 0;
    mocks.transaction.mockImplementation(async (callback) => callback({
      select: () => ({ from: () => ({ where: () => ({ for: async () => mocks.exchange ? [mocks.exchange] : [] }) }) }),
      insert: () => ({ values: async (value: unknown) => { mocks.auditValues.push(value); } }),
      delete: () => ({ where: async (condition: unknown) => { mocks.deletes.push(condition); } }),
    }));
  });

  it("rejects an ordinary admin server-side before opening a transaction", async () => {
    mocks.superAdmin = false;
    await expect(deleteExchange(exchangeForm())).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("writes a name/year audit record and removes the exchange in one transaction", async () => {
    await deleteExchange(exchangeForm());
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.auditValues[0]).toMatchObject({
      actorId: "admin-user",
      action: "exchange.deleted",
      targetType: "exchange",
      targetId: "0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4",
      metadata: { name: "Holiday Gathering", year: 2026 },
    });
    expect(mocks.deletes).toHaveLength(1);
    expect(mocks.revalidated).toEqual(expect.arrayContaining([
      "/admin", "/admin/exchanges/0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4",
      "/wishlists", "/wishlists/0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4",
      "/wishlists/0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4/recipient",
      "/history", "/history/0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4",
    ]));
  });

  it("does not delete when the exchange is missing", async () => {
    mocks.exchange = null;
    await expect(deleteExchange(exchangeForm())).rejects.toThrow("Exchange not found.");
    expect(mocks.auditValues).toHaveLength(0);
    expect(mocks.deletes).toHaveLength(0);
  });
});
