import { afterEach, describe, expect, it, vi } from "vitest";
import { signInviteCallback, verifyInviteCallback } from "./invite-callback";

describe("invite callback state", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("binds an invite to the normalized email and signs it with the auth secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    const state = signInviteCallback("invite-token", " Elf@Example.test ");
    expect(state).toBeTruthy();
    expect(verifyInviteCallback("invite-token", "elf@example.test", state!)).toBe(true);
    expect(verifyInviteCallback("different-token", "elf@example.test", state!)).toBe(false);
    expect(verifyInviteCallback("invite-token", "other@example.test", state!)).toBe(false);
  });

  it("fails closed when the signing secret is unavailable or state is malformed", () => {
    expect(signInviteCallback("invite-token", "elf@example.test")).toBeNull();
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    expect(verifyInviteCallback("invite-token", "elf@example.test", "not-valid")).toBe(false);
  });
});
