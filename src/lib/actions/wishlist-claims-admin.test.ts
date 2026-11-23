import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  eligible: vi.fn(),
  draw: vi.fn(),
  notifications: vi.fn(async () => ({ failed: false })),
  deletions: [] as Array<{ table: string; condition: unknown }>,
  insertions: [] as Array<{ table: string; values: unknown }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ kind: "and", args }),
  count: () => ({ kind: "count" }),
  eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
  inArray: (column: unknown, values: unknown) => ({ kind: "inArray", column, values }),
  notInArray: (column: unknown, values: unknown) => ({ kind: "notInArray", column, values }),
  isNull: vi.fn(), like: vi.fn(), sql: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin" } })) }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/admin-data", () => ({ getEligibleUserIdsForExchange: mocks.eligible }));
vi.mock("@/lib/draw", () => ({ drawSecretSanta: mocks.draw }));
vi.mock("@/lib/exchange-time", () => ({ localTimeToUtc: vi.fn() }));
vi.mock("@/lib/auth-access", () => ({ isSuperAdminEmail: vi.fn(() => true) }));
vi.mock("@/lib/invite-tokens", () => ({ normalizeEmail: (email: string) => email.toLowerCase() }));
vi.mock("@/lib/invites", () => ({ createInviteRecord: vi.fn() }));
vi.mock("@/lib/notification-scheduler", () => ({ sendAssignmentNotifications: mocks.notifications, sendManualExchangeReminders: vi.fn() }));
vi.mock("@/lib/redraw-policy", () => ({ hasLegacyMessageRows: vi.fn(() => false) }));
vi.mock("@/lib/schema", () => {
  const col = (table: string, name: string) => ({ table, name });
  const table = (name: string, columns: string[]) => Object.fromEntries(columns.map((column) => [column, col(name, column)]));
  return {
    allowlist: table("allowlist", ["id", "email", "exchangeId"]),
    assignments: table("assignment", ["id", "exchangeId", "giverId", "receiverId"]),
    auditLog: table("audit_log", ["id"]),
    exchangeParticipants: table("exchange_participant", ["id", "exchangeId", "userId"]),
    exchanges: table("exchange", ["id", "name", "year", "status"]),
    exclusions: table("exclusion", ["id", "exchangeId", "giverId", "receiverId"]),
    emailLog: table("email_log", ["id"]), inviteLinks: table("invite_links", ["id"]),
    itemClaims: table("item_claim", ["id", "itemId", "giverId"]), messages: table("message", ["id", "assignmentId"]),
    wishlistItems: table("wishlist_item", ["id", "wishlistId"]), wishlists: table("wishlist", ["id", "exchangeId", "userId"]),
    user: table("user", ["id", "email", "role"]), verification: table("verification", ["id"]),
  };
});

const { drawExchange, redrawExchange, setExchangeParticipants } = await import("./admin");
const exchangeId = "11111111-1111-4111-8111-111111111111";

function participantForm(ids: string[]) {
  const form = new FormData();
  form.set("exchangeId", exchangeId);
  for (const id of ids) form.append("participantId", id);
  return form;
}

function drawForm(name?: string) {
  const form = new FormData();
  form.set("exchangeId", exchangeId);
  if (name !== undefined) form.set("confirmExchangeName", name);
  return form;
}

function setup({ status = "open" }: { status?: string } = {}) {
  const exchange = { id: exchangeId, name: "Holiday", year: new Date().getFullYear(), status };
  mocks.transaction.mockImplementation(async (callback) => {
    let selectIndex = 0;
    const tx = {
      select: (selection: Record<string, unknown>) => {
        const selectCall = selectIndex++;
        const rows = selection?.count
          ? [{ count: 0 }]
          : selectCall === 0
            ? [exchange]
            : selectCall === 1
              ? [{ userId: "a" }, { userId: "b" }]
              : [];
        const query = {
          from: () => query,
          innerJoin: () => query,
          where: () => query,
          for: async () => rows,
          limit: async () => rows,
          then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
        };
        return query;
      },
      delete: (source: Record<string, unknown>) => ({ where: async (condition: unknown) => { mocks.deletions.push({ table: String(Object.values(source)[0] && (Object.values(source)[0] as { table?: string }).table || ""), condition }); } }),
      insert: (source: Record<string, unknown>) => ({ values: async (values: unknown) => { mocks.insertions.push({ table: String(Object.values(source)[0] && (Object.values(source)[0] as { table?: string }).table || ""), values }); } }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    return callback(tx);
  });
}

describe("claim cleanup during exchange changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletions.length = 0;
    mocks.insertions.length = 0;
    mocks.eligible.mockResolvedValue(new Set(["keep"]));
    mocks.draw.mockReturnValue([{ giverId: "a", receiverId: "b" }, { giverId: "b", receiverId: "a" }]);
    setup();
  });

  it("deletes claims from removed participants while retaining current participants", async () => {
    await setExchangeParticipants(participantForm(["keep"]));
    const claimDelete = mocks.deletions.find(({ table }) => table === "item_claim");
    expect(claimDelete?.condition).toMatchObject({ kind: "and", args: expect.arrayContaining([
      expect.objectContaining({ kind: "notInArray", values: ["keep"] }),
    ]) });
  });

  it("clears all claims when the participant list becomes empty", async () => {
    mocks.eligible.mockResolvedValue(new Set());
    await setExchangeParticipants(participantForm([]));
    expect(mocks.deletions.find(({ table }) => table === "item_claim")?.condition).toMatchObject({ kind: "inArray" });
  });

  it.each(["first draw", "redraw"])("clears claims on %s", async (mode) => {
    if (mode === "redraw") setup({ status: "drawn" });
    await (mode === "redraw" ? redrawExchange(drawForm("Holiday")) : drawExchange(drawForm()));
    expect(mocks.deletions.filter(({ table }) => table === "item_claim")).toHaveLength(1);
  });
});
