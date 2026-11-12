import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireNonAdminExchangeMember, select, insert } = vi.hoisted(() => ({
  requireNonAdminExchangeMember: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireNonAdminExchangeMember }));
vi.mock("@/lib/db", () => ({ db: { select, insert, update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })) } }));

import { GET, POST } from "./route";

function context() { return { params: Promise.resolve({ exchangeId: "11111111-1111-4111-8111-111111111111" }) }; }
function selectReturning(...values: unknown[]) {
  let index = 0;
  select.mockImplementation(() => {
    const result = values[index++];
    const chain = { from: vi.fn(() => chain), innerJoin: vi.fn(() => chain), where: vi.fn(() => chain), limit: vi.fn(async () => result), orderBy: vi.fn(async () => result), then: (resolve: (value: unknown) => void) => resolve(result) };
    return chain;
  });
}

describe("message route authorization and validation", () => {
  beforeEach(() => { vi.clearAllMocks(); requireNonAdminExchangeMember.mockResolvedValue({ user: { id: "member" } }); });

  it("rejects admins at the route boundary", async () => {
    requireNonAdminExchangeMember.mockRejectedValue(new Error("Forbidden"));
    const response = await POST(new Request("http://local", { method: "POST", body: JSON.stringify({ body: "Hello" }) }), context());
    expect(response.status).toBe(403);
  });

  it("rejects admins on GET too", async () => {
    requireNonAdminExchangeMember.mockRejectedValue(new Error("Forbidden"));
    const response = await GET(new Request("http://local"), context());
    expect(response.status).toBe(403);
  });

  it("rejects nonparticipants on GET", async () => {
    selectReturning([]);
    const response = await GET(new Request("http://local"), context());
    expect(response.status).toBe(404);
  });

  it("returns a recipient response with no giver identity fields", async () => {
    selectReturning(
      [{ id: "assignment", giverId: "secret-giver-id", receiverId: "member", status: "drawn" }],
      [{ id: "m1", senderRole: "giver", body: "Hello", sentAt: new Date(0), readAt: null }],
    );
    const response = await GET(new Request("http://local"), context());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.title).toBe("your Secret Santa");
    expect(JSON.stringify(payload)).not.toMatch(/secret-giver-id|giverId|displayName|email|avatar/);
  });

  it("rejects a nonparticipant with no assignment", async () => {
    selectReturning([]);
    const response = await POST(new Request("http://local", { method: "POST", body: JSON.stringify({ body: "Hello" }) }), context());
    expect(response.status).toBe(404);
  });

  it("enforces the 1000 character limit", async () => {
    const response = await POST(new Request("http://local", { method: "POST", body: JSON.stringify({ body: "x".repeat(1001) }) }), context());
    expect(response.status).toBe(400);
  });

  it("applies the per-sender rate limit", async () => {
    selectReturning([{ id: "assignment", giverId: "member" }], [{ count: 10 }]);
    const response = await POST(new Request("http://local", { method: "POST", body: JSON.stringify({ body: "Hello" }) }), context());
    expect(response.status).toBe(429);
    expect(insert).not.toHaveBeenCalled();
  });
});
