import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./safe-return-to";

describe("safeReturnTo", () => {
  it("preserves local paths and query parameters", () => {
    expect(safeReturnTo("/wishlists/share?url=https%3A%2F%2Fshop.example%2Fp"))
      .toBe("/wishlists/share?url=https%3A%2F%2Fshop.example%2Fp");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "dashboard", "\n//evil.example"])(
    "rejects unsafe callback %s",
    (value) => expect(safeReturnTo(value)).toBe("/dashboard"),
  );
});
