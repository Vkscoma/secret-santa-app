import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, requireMember, consumeLimit } = vi.hoisted(() => ({ select: vi.fn(), requireMember: vi.fn(), consumeLimit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select } }));
vi.mock("@/lib/authz", () => ({ requireNonAdminExchangeMember: requireMember }));
vi.mock("@/lib/auth-rate-limit", () => ({ consumeAuthRateLimit: consumeLimit }));

import { nudgeRecipient } from "./nudges";

function setup(record: unknown) {
  const chain = { from: vi.fn(() => chain), innerJoin: vi.fn(() => chain), where: vi.fn(() => chain), limit: vi.fn(async () => Array.isArray(record) ? record : [record]) };
  select.mockReturnValue(chain);
}

describe("wishlist email nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMember.mockResolvedValue({ user: { id: "giver" } });
    consumeLimit.mockResolvedValue(true);
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "Secret Santa <santa@example.test>";
    process.env.BETTER_AUTH_URL = "https://santa.example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  });

  it("sends an anonymous email to the assigned recipient with a wishlist link", async () => {
    setup({ recipientEmail: "recipient@example.test", exchangeName: "Holiday 2026", status: "drawn" });
    const result = await nudgeRecipient("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ ok: true, message: "Your recipient has been nudged by email." });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.to).toEqual(["recipient@example.test"]);
    expect(body.html).toContain("Open your wish list");
    expect(body.html).toContain("https://santa.example.test/wishlists/11111111-1111-4111-8111-111111111111");
    expect(body.html).not.toContain("giver");
    expect(body.html).not.toContain("Continue securely");
  });

  it("requires the assigned giver and respects rate limiting", async () => {
    requireMember.mockRejectedValue(new Error("Forbidden"));
    expect((await nudgeRecipient("11111111-1111-4111-8111-111111111111")).ok).toBe(false);
    requireMember.mockResolvedValue({ user: { id: "giver" } });
    setup({ recipientEmail: "recipient@example.test", exchangeName: "Holiday 2026", status: "drawn" });
    consumeLimit.mockResolvedValue(false);
    expect((await nudgeRecipient("11111111-1111-4111-8111-111111111111")).message).toContain("wait");
    expect(fetch).not.toHaveBeenCalled();
  });
});
