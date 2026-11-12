import { describe, expect, it } from "vitest";
import { hasLegacyMessageRows } from "./redraw-policy";

describe("redraw preservation guard", () => {
  it("blocks only when assignment-linked legacy records exist", () => {
    expect(hasLegacyMessageRows(0)).toBe(false);
    expect(hasLegacyMessageRows(1)).toBe(true);
  });
});
