import { describe, expect, it } from "vitest";
import { isPastHistoryExchange, mayShowSantaIdentity } from "./history-policy";

describe("history privacy policy", () => {
  it("only includes completed prior-year exchanges", () => {
    expect(isPastHistoryExchange(2025, 2026, "revealed")).toBe(true);
    expect(isPastHistoryExchange(2025, 2026, "closed")).toBe(true);
    expect(isPastHistoryExchange(2025, 2026, "open")).toBe(false);
    expect(isPastHistoryExchange(2026, 2026, "revealed")).toBe(false);
  });

  it("reveals a Santa only after manual reveal, close, or a passed auto-reveal date", () => {
    const now = new Date("2026-12-25T18:00:00Z");
    const exchangeAt = new Date("2026-12-25T17:00:00Z");
    expect(mayShowSantaIdentity("drawn", false, exchangeAt, now)).toBe(false);
    expect(mayShowSantaIdentity("revealed", false, exchangeAt, now)).toBe(true);
    expect(mayShowSantaIdentity("closed", false, exchangeAt, now)).toBe(true);
    expect(mayShowSantaIdentity("drawn", true, exchangeAt, now)).toBe(true);
    expect(mayShowSantaIdentity("drawn", true, new Date("2026-12-25T19:00:00Z"), now)).toBe(false);
  });
});
