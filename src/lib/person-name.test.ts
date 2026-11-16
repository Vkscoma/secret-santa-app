import { describe, expect, it } from "vitest";
import { formatFirstName, possessive } from "./person-name";

describe("formatFirstName", () => {
  it("uses the first word of the display name", () => {
    expect(formatFirstName("Michelle Scoma", "Michellescoma", "ms@example.com")).toBe("Michelle");
  });

  it("uses the first word of a multi-word profile name", () => {
    expect(formatFirstName(null, "Michelle Scoma", "ms@example.com")).toBe("Michelle");
  });

  it("keeps a single-word profile name even if it looks like a username", () => {
    expect(formatFirstName(null, "Michellescoma", "ms@example.com")).toBe("Michellescoma");
  });

  it("ignores a blank display name", () => {
    expect(formatFirstName("   ", "Michellescoma")).toBe("Michellescoma");
  });

  it("falls back to the part of the email before the @", () => {
    expect(formatFirstName(null, "", "michelle@example.com")).toBe("michelle");
  });

  it("returns null when there is no name or email", () => {
    expect(formatFirstName(null, null, null)).toBeNull();
    expect(formatFirstName("", " ")).toBeNull();
  });
});

describe("possessive", () => {
  it("adds ’s, including after a final s", () => {
    expect(possessive("Michelle")).toBe("Michelle’s");
    expect(possessive("James")).toBe("James’s");
  });
});
