import { describe, expect, it } from "vitest";
import { localTimeToUtc, utcToLocalInput } from "./exchange-time";

describe("exchange local time handling", () => {
  it("stores the selected wall time with its IANA zone correctly", () => {
    const instant = localTimeToUtc("2026-12-24T18:00", "America/Los_Angeles");
    expect(instant.toISOString()).toBe("2026-12-25T02:00:00.000Z");
    expect(utcToLocalInput(instant, "America/Los_Angeles")).toBe("2026-12-24T18:00");
  });

  it("rejects local times skipped by the daylight-saving transition", () => {
    expect(() => localTimeToUtc("2026-03-08T02:30", "America/Los_Angeles")).toThrow(/does not exist/);
  });
});
