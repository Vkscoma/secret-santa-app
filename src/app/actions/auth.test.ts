import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  email: "",
  pendingInvite: null as string | null,
  inviteIsValid: false,
  pendingInviteState: "pending-state",
  signInMagicLink: vi.fn<(input: { body: Record<string, unknown>; headers: Headers }) => Promise<void>>(
    async () => undefined
  ),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { signInMagicLink: state.signInMagicLink } } }));
vi.mock("@/lib/auth-access", () => ({
  getPendingInviteToken: async () => state.pendingInvite,
  getPendingInviteState: async () => state.pendingInviteState,
}));
vi.mock("@/lib/invites", () => ({ canUseInvite: async () => state.inviteIsValid }));
vi.mock("@/lib/invite-tokens", () => ({ normalizeEmail: (email: string) => email.trim().toLowerCase() }));

const { requestMagicLink } = await import("./auth");

function form(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

describe("requestMagicLink", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    state.pendingInvite = null;
    state.inviteIsValid = false;
    state.signInMagicLink.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("passes a non-empty signup name and dashboard callback for normal sign-in", async () => {
    const result = await requestMagicLink(form("  Santa.Helper@example.test "));
    expect(state.signInMagicLink).toHaveBeenCalledWith(expect.objectContaining({
      body: {
        email: "santa.helper@example.test",
        name: "Santa Helper",
        callbackURL: "/dashboard",
      },
    }));
    expect(result.message).toMatch(/If this email is approved/);
  });

  it("uses the invite completion callback when a valid pending invite exists", async () => {
    state.pendingInvite = "pending-token";
    state.inviteIsValid = true;
    const formData = form("elf@example.test");
    formData.set("returnTo", "/wishlists/share?url=https%3A%2F%2Fstore.example%2Fp");
    await requestMagicLink(formData);
    expect(state.signInMagicLink).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        email: "elf@example.test",
        name: "Elf",
      }),
    }));
    const call = state.signInMagicLink.mock.calls.at(-1)?.[0] as unknown as { body: { callbackURL: string } };
    const callbackURL = new URL(call.body.callbackURL, "http://localhost");
    expect(callbackURL.pathname).toBe("/join/complete");
    expect(callbackURL.searchParams.get("invite")).toBe("pending-token");
    expect(callbackURL.searchParams.get("proof")).toBeTruthy();
    expect(callbackURL.searchParams.get("returnTo")).toBe("/wishlists/share?url=https%3A%2F%2Fstore.example%2Fp");
  });

  it("keeps the generic response when the email is invalid or the endpoint fails", async () => {
    const invalid = await requestMagicLink(form("not-an-email"));
    expect(state.signInMagicLink).not.toHaveBeenCalled();
    state.signInMagicLink.mockRejectedValueOnce(new Error("not eligible"));
    const failed = await requestMagicLink(form("someone@example.test"));
    expect(failed.message).toBe(invalid.message);
  });
});
