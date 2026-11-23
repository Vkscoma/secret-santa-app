import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateWishlistClaim } from "./wishlists";

const { transaction, requireMember, revalidate } = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireMember: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { transaction } }));
vi.mock("@/lib/authz", () => ({ requireExchangeMember: requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));

const exchangeId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

function setUp({ inserted = [{ id: "claim-id" }], existing = [] as unknown[] } = {}) {
  const selectResults: unknown[][] = [
    [{ status: "open", year: new Date().getFullYear() }],
    [{ id: "participant" }],
    [{ ownerId: "owner" }],
    [{ id: "owner-participant" }],
    existing,
  ];
  let selectIndex = 0;
  const tx = {
    select: vi.fn(() => {
      const rows = selectResults[selectIndex++] ?? [];
      const chain = {
        from: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        where: vi.fn(() => chain),
        for: vi.fn(() => chain),
        limit: vi.fn(async () => rows),
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => inserted) })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  };
  transaction.mockImplementation((callback) => callback(tx));
  return tx;
}

function form(intent: "claim" | "release") {
  const data = new FormData();
  data.set("exchangeId", exchangeId);
  data.set("itemId", itemId);
  data.set("intent", intent);
  return data;
}

describe("updateWishlistClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMember.mockResolvedValue({ user: { id: "viewer" } });
  });

  it("claims an available item without returning user identifiers or checking assignments", async () => {
    const tx = setUp();
    const result = await updateWishlistClaim(form("claim"));
    expect(result).toEqual({ ok: true });
    expect(tx.insert).toHaveBeenCalled();
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toContain("viewer");
  });

  it("returns taken without exposing the claimant when another participant won", async () => {
    const tx = setUp({ inserted: [], existing: [{ isMine: false }] });
    expect(await updateWishlistClaim(form("claim"))).toEqual({ ok: false, code: "taken" });
    expect(tx.select).toHaveBeenCalledTimes(5);
  });

  it("releases only the viewer's claim and treats release as idempotent", async () => {
    const tx = setUp();
    expect(await updateWishlistClaim(form("release"))).toEqual({ ok: true });
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
