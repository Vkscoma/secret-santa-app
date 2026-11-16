import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/auth-access", () => ({ isSuperAdminEmail: (email: string) => email === "super@example.test" }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/schema", () => {
  const table = (names: string[]) => Object.fromEntries(names.map((name) => [name, { name }]));
  return {
    assignments: table(["exchangeId", "giverId", "receiverId"]),
    auditLog: table(["id"]),
    exchanges: table(["id", "name", "status"]),
    user: table(["id", "name", "displayName"]),
  };
});

const { POST } = await import("./route");

describe("private pairing route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "regular-admin", email: "admin@example.test" } });
  });

  it("returns 403 to a regular admin before querying pairings", async () => {
    const request = new Request("https://santa.example.test/api/admin/exchanges/0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4/private-pairings", {
      method: "POST",
      headers: {
        origin: "https://santa.example.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ exchangeId: "0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4", mode: "show", confirmPrivateView: "on" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "0c9a56a0-6090-4c4c-b9b2-5f6cf4f231f4" }) });

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
