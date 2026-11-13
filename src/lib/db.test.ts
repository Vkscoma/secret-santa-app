import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {};
  const database = {
    query: { user: {} },
    select() {
      return this.query;
    },
    transaction(callback: (value: unknown) => unknown) {
      return callback(this);
    },
  };
  return {
    client,
    database,
    postgres: vi.fn(() => client),
    drizzle: vi.fn(() => database),
  };
});

vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lazy database initialization", () => {
  it.each([undefined, "[SENSITIVE]"])("imports without parsing the build-time URL %s", async (url) => {
    vi.stubEnv("POSTGRES_URL", url);
    const { db } = await import("./db");
    expect(db).toBeDefined();
    expect(mocks.postgres).not.toHaveBeenCalled();
    expect(mocks.drizzle).not.toHaveBeenCalled();
  });

  it("reads the URL on first use and reuses one initialized database", async () => {
    vi.stubEnv("POSTGRES_URL", "[SENSITIVE]");
    const { db } = await import("./db");
    vi.stubEnv("POSTGRES_URL", "postgresql://test:test@localhost:5432/test");

    expect(db.query).toBe(mocks.database.query);
    expect(db.query).toBe(mocks.database.query);
    expect(mocks.postgres).toHaveBeenCalledExactlyOnceWith("postgresql://test:test@localhost:5432/test");
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
    expect(mocks.drizzle).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ schema: expect.any(Object) }));
  });

  it("retains the Drizzle receiver for extracted query and transaction methods", async () => {
    vi.stubEnv("POSTGRES_URL", "postgresql://test:test@localhost:5432/test");
    const { db } = await import("./db");
    const select = db.select;
    const transaction = db.transaction;

    expect(select()).toBe(mocks.database.query);
    await expect(transaction(async (tx) => tx)).resolves.toBe(mocks.database);
  });

  it("reports missing configuration on use and allows initialization after configuration becomes available", async () => {
    vi.stubEnv("POSTGRES_URL", undefined);
    const { db } = await import("./db");

    expect(() => db.select()).toThrow("POSTGRES_URL environment variable is not set");
    expect(mocks.postgres).not.toHaveBeenCalled();

    vi.stubEnv("POSTGRES_URL", "postgresql://test:test@localhost:5432/test");
    expect(db.query).toBe(mocks.database.query);
    expect(mocks.postgres).toHaveBeenCalledTimes(1);
  });

  it("can be passed to the Better Auth adapter without initializing a client", async () => {
    vi.stubEnv("POSTGRES_URL", undefined);
    const { db } = await import("./db");
    const { drizzleAdapter } = await import("better-auth/adapters/drizzle");

    expect(drizzleAdapter(db, { provider: "pg" })).toBeTypeOf("function");
    expect(mocks.postgres).not.toHaveBeenCalled();
  });
});
