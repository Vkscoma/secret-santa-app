import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowlist } from "./schema";

const fake = vi.hoisted(() => {
  const state = { globalExists: false, inserts: [] as { table: unknown; values: unknown }[] };
  const query = (result: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  const db = {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    select: () => query(state.globalExists ? [{ id: "existing" }] : []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  };
  return { state, db };
});

vi.mock("@/lib/db", () => ({ db: fake.db }));

const { repairSuperAdmin } = await import("./auth-access");

describe("super-admin allowlist repair", () => {
  beforeEach(() => {
    fake.state.globalExists = false;
    fake.state.inserts = [];
    vi.stubEnv("SUPER_ADMIN_EMAIL", "ADMIN@example.test");
  });

  it("does not write when the normalized global allowlist entry already exists", async () => {
    fake.state.globalExists = true;
    await repairSuperAdmin(" admin@EXAMPLE.test ");
    expect(fake.state.inserts).toHaveLength(0);
  });

  it("inserts only a normalized email when the global entry is missing", async () => {
    await repairSuperAdmin(" ADMIN@Example.test ");
    expect(fake.state.inserts).toEqual([{ table: allowlist, values: { email: "admin@example.test" } }]);
  });

  it("does not repair an unrelated account", async () => {
    await repairSuperAdmin("other@example.test");
    expect(fake.state.inserts).toHaveLength(0);
  });
});
