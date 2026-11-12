import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "super-admin-id", email: "owner@example.test" } },
  isSuperAdmin: true,
  targetEmail: "work@example.test",
  blockedReference: null as string | null,
  verificationRows: [] as Array<{ id: string; value: string }>,
  transaction: vi.fn(),
  deletes: [] as Array<{ table: string; condition: unknown }>,
  audits: [] as Array<Record<string, unknown>>,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => { mocks.revalidated.push(path); } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(), count: vi.fn(), eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: (column: unknown, values: unknown[]) => ({ kind: "inArray", column, values }), isNull: vi.fn(),
  like: (column: unknown, value: unknown) => ({ kind: "like", column, value }), sql: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireAdmin: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth-access", () => ({ isSuperAdminEmail: (email: string) => email.toLowerCase() === "owner@example.test" }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/admin-data", () => ({ getEligibleUserIdsForExchange: vi.fn() }));
vi.mock("@/lib/draw", () => ({ drawSecretSanta: vi.fn() }));
vi.mock("@/lib/exchange-time", () => ({ localTimeToUtc: vi.fn() }));
vi.mock("@/lib/invite-tokens", () => ({ normalizeEmail: (email: string) => email.trim().toLowerCase() }));
vi.mock("@/lib/invites", () => ({ createInviteRecord: vi.fn() }));
vi.mock("@/lib/notification-scheduler", () => ({ sendAssignmentNotifications: vi.fn(), sendManualExchangeReminders: vi.fn() }));
vi.mock("@/lib/redraw-policy", () => ({ hasLegacyMessageRows: vi.fn() }));
vi.mock("@/lib/schema", () => {
  const col = (table: string, name: string) => ({ table, name });
  const table = (tableName: string, names: string[]) => Object.fromEntries(names.map((name) => [name, col(tableName, name)]));
  return {
    allowlist: table("allowlist", ["id", "email", "exchangeId"]), assignments: table("assignment", ["id", "exchangeId", "giverId", "receiverId"]),
    auditLog: table("audit_log", ["id"]), emailLog: table("email_log", ["id", "recipientUserId"]),
    exchangeParticipants: table("exchange_participant", ["id", "exchangeId", "userId"]), exchanges: table("exchange", ["id", "name", "year", "status", "createdBy"]),
    exclusions: table("exclusion", ["id", "exchangeId", "giverId", "receiverId"]), inviteLinks: table("invite_links", ["id", "exchangeId", "revokedAt"]),
    itemClaims: table("item_claim", ["id", "itemId", "giverId"]), messages: table("message", ["id", "assignmentId"]),
    wishlistItems: table("wishlist_item", ["id", "wishlistId"]), wishlists: table("wishlist", ["id", "exchangeId", "userId"]),
    user: table("user", ["id", "email", "role"]), verification: table("verification", ["id", "identifier", "value"]),
  };
});

const { deleteUserAccount } = await import("./admin");

function userForm(userId = "work-account-id") {
  const form = new FormData();
  form.set("userId", userId);
  return form;
}

describe("deleteUserAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.user.email = "owner@example.test";
    mocks.targetEmail = "work@example.test";
    mocks.blockedReference = null;
    mocks.verificationRows = [];
    mocks.deletes.length = 0;
    mocks.audits.length = 0;
    mocks.revalidated.length = 0;
    mocks.transaction.mockImplementation(async (callback) => callback({
      select: () => {
        let condition: { column?: { table?: string; name?: string }; value?: unknown } | undefined;
        let tableName: string | undefined;
        const query = {
          from: (table: Record<string, { table?: string }>) => { tableName = Object.values(table)[0]?.table; return query; },
          where: (where: typeof condition) => { condition = where; return query; },
          for: async () => [{ email: mocks.targetEmail }],
          limit: async () => condition?.column?.name === mocks.blockedReference ? [{ id: "reference" }] : [],
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(tableName === "verification" ? mocks.verificationRows : []).then(resolve, reject),
        };
        return query;
      },
      delete: (table: Record<string, { table?: string }>) => ({ where: async (condition: unknown) => { mocks.deletes.push({ table: Object.values(table)[0]?.table ?? "unknown", condition }); } }),
      insert: () => ({ values: async (value: Record<string, unknown>) => { mocks.audits.push(value); } }),
    }));
  });

  it("rejects non-SuperAdmins before opening a transaction", async () => {
    mocks.isSuperAdmin = false;
    mocks.session.user.email = "admin@example.test";
    await expect(deleteUserAccount(userForm())).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("protects the configured Super Admin account", async () => {
    mocks.targetEmail = "owner@example.test";
    await expect(deleteUserAccount(userForm())).rejects.toThrow(/configured Super Admin account cannot be removed/);
    expect(mocks.deletes).toHaveLength(0);
  });

  it("blocks deletion when the account is still referenced by exchange history", async () => {
    mocks.blockedReference = "userId";
    await expect(deleteUserAccount(userForm())).rejects.toThrow(/Delete the test exchanges that reference it first/);
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.audits).toHaveLength(0);
  });

  it("cleans email logs and allowlist rows, audits without PII, then deletes the account", async () => {
    mocks.verificationRows = [
      { id: "matching-link", value: JSON.stringify({ type: "magic-link", email: " WORK@example.test " }) },
      { id: "other-email", value: JSON.stringify({ type: "magic-link", email: "else@example.test" }) },
      { id: "other-type", value: JSON.stringify({ type: "email-verification", email: "work@example.test" }) },
      { id: "malformed", value: "not-json" },
    ];
    await deleteUserAccount(userForm());
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.deletes.map(({ table }) => table)).toEqual(["email_log", "verification", "allowlist", "user"]);
    expect(mocks.deletes[1]?.condition).toMatchObject({ kind: "inArray", values: ["matching-link"] });
    expect(mocks.audits[0]).toMatchObject({ actorId: "super-admin-id", action: "user.deleted", targetType: "user", targetId: null, metadata: {} });
    expect(JSON.stringify(mocks.audits[0])).not.toContain("work@example.test");
    expect(mocks.revalidated).toEqual(["/admin"]);
  });
});
