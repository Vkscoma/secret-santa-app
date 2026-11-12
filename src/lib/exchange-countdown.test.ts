import { describe, expect, it } from "vitest";
import { calendarDaysUntil } from "./exchange-countdown";

describe("timezone-aware countdown days", () => {
  it("counts exchange calendar days across the spring DST change", () => {
    expect(calendarDaysUntil(new Date("2026-03-09T07:00:00Z"), new Date("2026-03-08T08:00:00Z"), "America/Los_Angeles")).toBe(1);
  });
  it("treats a target later on the same local date as today", () => {
    expect(calendarDaysUntil(new Date("2026-12-25T20:00:00Z"), new Date("2026-12-25T08:00:00Z"), "America/Los_Angeles")).toBe(0);
  });
});
