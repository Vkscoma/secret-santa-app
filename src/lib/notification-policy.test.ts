import { describe, expect, it } from "vitest";
import { dueReminderMilestones, reminderIdempotencyKey, selectWishlistDigestCandidates, wishlistDigestIdempotencyKey } from "./notification-policy";

describe("daily notification schedule", () => {
  it("keeps each milestone eligible in its own six-day window", () => {
    expect(dueReminderMilestones(20)).toEqual([]);
    expect(dueReminderMilestones(14)).toEqual([14]);
    expect(dueReminderMilestones(8)).toEqual([14]);
    expect(dueReminderMilestones(7)).toEqual([7]);
    expect(dueReminderMilestones(2)).toEqual([7]);
    expect(dueReminderMilestones(1)).toEqual([7, 1]);
    expect(dueReminderMilestones(0)).toEqual([1]);
    expect(dueReminderMilestones(-5)).toEqual([1]);
    expect(dueReminderMilestones(-6)).toEqual([]);
  });

  it("uses the same idempotency key on daily retries for a milestone", () => {
    const first = reminderIdempotencyKey("exchange-1", "user-1", 14);
    const retry = reminderIdempotencyKey("exchange-1", "user-1", 14);
    expect(first).toBe(retry);
    expect(first).not.toBe(reminderIdempotencyKey("exchange-1", "user-1", 7));
  });

  it("keys wishlist digests once per giver, exchange, and exchange-local date", () => {
    expect(wishlistDigestIdempotencyKey("exchange", "giver", "2026-11-12")).toBe("wishlist-digest:exchange:giver:2026-11-12");
  });

  it("deduplicates retry keys and selects one oldest retry per giver ahead of fresh rows", () => {
    const fresh = [
      { giverId: "giver", email: "current@example.com", key: "wishlist-digest:exchange:giver:2026-11-12" },
    ];
    const retries = [
      { giverId: "giver", email: "old@example.com", key: "wishlist-digest:exchange:giver:2026-11-12" },
      { giverId: "giver", email: "current@example.com", key: "wishlist-digest:exchange:giver:2026-11-11" },
    ];
    expect(selectWishlistDigestCandidates(fresh, retries)).toEqual([retries[1]]);
    expect(selectWishlistDigestCandidates(fresh, [retries[0]!])).toEqual([fresh[0]]);
  });
});
