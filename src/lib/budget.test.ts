import { describe, expect, it } from "vitest";
import { formatBudget } from "./budget";

describe("formatBudget", () => {
  it("handles every min/max combination", () => {
    expect(formatBudget(null, null)).toBe("Not set");
    expect(formatBudget(null, 100)).toBe("Up to $100");
    expect(formatBudget(25, null)).toBe("At least $25");
    expect(formatBudget(0, null)).toBe("No limit");
    expect(formatBudget(50, 50)).toBe("$50");
    expect(formatBudget(25, 100)).toBe("$25–$100");
  });
});
