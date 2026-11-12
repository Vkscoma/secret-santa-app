import { describe, expect, it } from "vitest";
import { shouldShowRecipientNudge } from "./nudge-visibility";

describe("recipient wishlist nudge visibility", () => {
  it("shows the nudge when no list or no items exist", () => {
    expect(shouldShowRecipientNudge(0)).toBe(true);
  });

  it("hides the nudge as soon as the recipient adds an item", () => {
    expect(shouldShowRecipientNudge(1)).toBe(false);
    expect(shouldShowRecipientNudge(3)).toBe(false);
  });

  it("respects the recipient's email preference", () => {
    expect(shouldShowRecipientNudge(0, false)).toBe(false);
  });

  it("only shows the nudge after a draw and before the exchange is closed", () => {
    expect(shouldShowRecipientNudge(0, true, "open")).toBe(false);
    expect(shouldShowRecipientNudge(0, true, "drawn")).toBe(true);
    expect(shouldShowRecipientNudge(0, true, "revealed")).toBe(true);
    expect(shouldShowRecipientNudge(0, true, "closed")).toBe(false);
  });
});
