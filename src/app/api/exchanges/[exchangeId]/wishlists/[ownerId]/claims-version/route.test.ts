import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isEmailAllowlisted: vi.fn(),
  memberRows: [] as { userId: string }[],
  select: vi.fn(),
  getClaimsVersion: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/auth-access", () => ({ isEmailAllowlisted: mocks.isEmailAllowlisted }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/wishlist-browse", () => ({ getClaimsVersion: mocks.getClaimsVersion }));

const { GET } = await import("./route");

const exchangeId = "0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4";
const viewerId = "viewer-user";
const ownerId = "owner-user";

function call(params: { exchangeId?: string; ownerId?: string } = {}) {
  const ids = { exchangeId, ownerId, ...params };
  const request = new Request(
    `https://santa.example.test/api/exchanges/${ids.exchangeId}/wishlists/${ids.ownerId}/claims-version`
  );
  return GET(request, { params: Promise.resolve(ids) });
}

async function expectStatus(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
}

describe("claims version route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: viewerId, email: "viewer@example.test" } });
    mocks.isEmailAllowlisted.mockResolvedValue(true);
    mocks.memberRows = [{ userId: viewerId }, { userId: ownerId }];
    mocks.select.mockImplementation(() => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(async () => mocks.memberRows),
      };
      return chain;
    });
    mocks.getClaimsVersion.mockResolvedValue("abc123");
  });

  it("returns only the version for a member viewing another participant", async () => {
    const response = await call();

    await expectStatus(response, 200);
    const body: unknown = await response.json();
    expect(Object.keys(body as object)).toEqual(["version"]);
    expect(body).toEqual({ version: "abc123" });
    expect(mocks.getClaimsVersion).toHaveBeenCalledWith(exchangeId, ownerId);
  });

  it("returns 401 without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expectStatus(await call(), 401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns 403 when the account is not allowlisted", async () => {
    mocks.isEmailAllowlisted.mockResolvedValue(false);
    await expectStatus(await call(), 403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns 403 when the viewer is not a member of the exchange", async () => {
    mocks.memberRows = [{ userId: ownerId }];
    await expectStatus(await call(), 403);
    expect(mocks.getClaimsVersion).not.toHaveBeenCalled();
  });

  it("returns 404 for the viewer's own list without reading claims", async () => {
    await expectStatus(await call({ ownerId: viewerId }), 404);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getClaimsVersion).not.toHaveBeenCalled();
  });

  it("returns 404 when the owner is not a participant", async () => {
    mocks.memberRows = [{ userId: viewerId }];
    await expectStatus(await call(), 404);
    expect(mocks.getClaimsVersion).not.toHaveBeenCalled();
  });

  it.each([{ exchangeId: "not-a-uuid" }, { ownerId: "" }, { ownerId: "x".repeat(161) }])(
    "returns 404 for malformed ids %o before checking the session",
    async (params) => {
      await expectStatus(await call(params), 404);
      expect(mocks.getSession).not.toHaveBeenCalled();
    }
  );

  it("returns a no-store 500 when the lookup fails", async () => {
    mocks.getClaimsVersion.mockRejectedValue(new Error("db down"));
    await expectStatus(await call(), 500);
  });
});
