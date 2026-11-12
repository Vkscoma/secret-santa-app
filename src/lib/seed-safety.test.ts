import { describe, expect, it } from "vitest";
import { assertSyntheticSeedAllowed, upcomingSecretSantaYear } from "../../scripts/seed-safety";

describe("synthetic database seed safety", () => {
  it("requires an explicit opt-in", () => {
    expect(() => assertSyntheticSeedAllowed({ NODE_ENV: "development" })).toThrow(/SEED_SYNTHETIC_DATA=true/);
    expect(() => assertSyntheticSeedAllowed({ NODE_ENV: "development", SEED_SYNTHETIC_DATA: "true" })).not.toThrow();
  });

  it("refuses production and Vercel environments even if opted in", () => {
    expect(() => assertSyntheticSeedAllowed({ NODE_ENV: "production", SEED_SYNTHETIC_DATA: "true" })).toThrow(/disabled/);
    expect(() => assertSyntheticSeedAllowed({ NODE_ENV: "development", VERCEL: "1", SEED_SYNTHETIC_DATA: "true" })).toThrow(/disabled/);
  });

  it("seeds this year's exchange until Christmas passes, then advances the demo year", () => {
    expect(upcomingSecretSantaYear(new Date("2026-12-01T12:00:00Z"))).toBe(2026);
    expect(upcomingSecretSantaYear(new Date("2026-12-26T07:59:59Z"))).toBe(2026);
    expect(upcomingSecretSantaYear(new Date("2026-12-26T08:00:00Z"))).toBe(2027);
  });
});
