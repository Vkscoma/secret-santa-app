import { beforeEach, describe, expect, it, vi } from "vitest";
import { nudgeRecipient } from "./nudges";

const { select, requireMember, consumeLimit } = vi.hoisted(() => ({ select: vi.fn(), requireMember: vi.fn(), consumeLimit: vi.fn() }));
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ id: "email-id" })) }));
vi.mock("@/lib/db", () => ({ db: { select } }));
vi.mock("@/lib/email", () => ({ appUrl: (path: string) => `https://santa.example.test${path}`, sendNotificationEmail: sendEmail }));
vi.mock("@/lib/authz", () => ({ requireNonAdminExchangeMember: requireMember }));
vi.mock("@/lib/auth-rate-limit", () => ({ consumeAuthRateLimit: consumeLimit }));

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
    sendEmail.mockClear();
  });

  it("sends an anonymous email to the assigned recipient with a wishlist link", async () => {
    setup({ recipientEmail: "recipient@example.test", exchangeName: "Holiday 2026", status: "drawn", hasWishlistItems: false });
    const result = await nudgeRecipient("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ ok: true, message: "Your recipient has been nudged by email." });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "recipient@example.test",
      kind: "manual-nudge",
      exchangeName: "Holiday 2026",
      url: "https://santa.example.test/wishlists/11111111-1111-4111-8111-111111111111",
    });
  });

  it("requires the assigned giver and respects rate limiting", async () => {
    requireMember.mockRejectedValue(new Error("Forbidden"));
    expect((await nudgeRecipient("11111111-1111-4111-8111-111111111111")).ok).toBe(false);
    requireMember.mockResolvedValue({ user: { id: "giver" } });
    setup({ recipientEmail: "recipient@example.test", exchangeName: "Holiday 2026", status: "drawn", hasWishlistItems: false });
    consumeLimit.mockResolvedValue(false);
    expect((await nudgeRecipient("11111111-1111-4111-8111-111111111111")).message).toContain("wait");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not nudge a recipient who already has gift ideas", async () => {
    setup({ recipientEmail: "recipient@example.test", exchangeName: "Holiday 2026", status: "drawn", hasWishlistItems: true });
    const result = await nudgeRecipient("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ ok: false, message: "Your recipient has added gift ideas already." });
    expect(consumeLimit).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
