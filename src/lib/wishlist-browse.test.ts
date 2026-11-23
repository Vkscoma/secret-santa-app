import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CLAIMS_VERSION, getClaimStates, getClaimsVersion } from "./wishlist-browse";
import type { SQL } from "drizzle-orm";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select } }));

describe("anonymous wishlist claim states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps claims to mine or taken without selecting a claimant id", async () => {
    const rows = [
      { itemId: "mine-item", isClaimed: true, isMine: true },
      { itemId: "taken-item", isClaimed: true, isMine: false },
      { itemId: "available-item", isClaimed: false, isMine: false },
    ];
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(async () => rows),
    };
    select.mockReturnValue(chain);

    const states = await getClaimStates("viewer", ["mine-item", "taken-item", "available-item"]);

    expect([...states]).toEqual([
      ["mine-item", "mine"],
      ["taken-item", "taken"],
      ["available-item", "available"],
    ]);
    const selected = select.mock.calls[0]?.[0];
    expect(Object.keys(selected)).toEqual(["itemId", "isClaimed", "isMine"]);
  });

  it("does not query for an empty item list", async () => {
    expect(await getClaimStates("viewer", [])).toEqual(new Map());
    expect(select).not.toHaveBeenCalled();
  });
});

describe("claims version fingerprint", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockVersionQuery(rows: { version: string }[]) {
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(async () => rows),
    };
    select.mockReturnValue(chain);
    return chain;
  }

  it("hashes only sorted claimed item ids, never givers or timestamps", async () => {
    const chain = mockVersionQuery([{ version: "f00d" }]);

    expect(await getClaimsVersion("exchange-id", "owner-id")).toBe("f00d");

    const selected = select.mock.calls[0]?.[0] as { version: SQL };
    expect(Object.keys(selected)).toEqual(["version"]);
    const { sql: text } = new PgDialect().sqlToQuery(selected.version);
    // Sorting inside the aggregate makes the hash independent of scan order.
    expect(text).toBe(
      `md5(coalesce(string_agg("item_claim"."item_id"::text, ',' order by "item_claim"."item_id"), ''))`
    );
    expect(text).not.toMatch(/giver|created_at/);
    expect(chain.innerJoin).toHaveBeenCalledTimes(2);

    const { params } = new PgDialect().sqlToQuery(
      (chain.where.mock.calls[0] as unknown as [SQL])[0]
    );
    expect(params).toEqual(["exchange-id", "owner-id"]);
  });

  it("falls back to the empty-list version", async () => {
    mockVersionQuery([]);
    expect(await getClaimsVersion("exchange-id", "owner-id")).toBe(EMPTY_CLAIMS_VERSION);
  });
});
