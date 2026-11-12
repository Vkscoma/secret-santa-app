import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  isEmailEligibleForSignIn: vi.fn<(email: string, pendingInviteToken?: string | null) => Promise<boolean>>(),
  getPendingInviteToken: vi.fn<() => Promise<string | null>>(),
}));
const limits = vi.hoisted(() => ({
  consume: vi.fn<(scope: string) => Promise<boolean>>(),
}));

// Keep the auth module from touching a real database, cookies, or rate-limit tables.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/invites", () => ({ redeemInviteForUser: vi.fn() }));
vi.mock("@/lib/auth-rate-limit", () => ({
  consumeAuthRateLimit: limits.consume,
  magicLinkRateScopes: (email: string, ip: string) => [`email:${email}`, `ip:${ip}`],
}));
vi.mock("@/lib/auth-access", () => ({
  ...access,
  ensureAllowedUserRecord: vi.fn(),
  isSuperAdminEmail: vi.fn(),
  repairSuperAdmin: vi.fn(),
}));

const { auth, magicLinkOptions } = await import("./auth");
type ValidateUserInfo = NonNullable<typeof auth.options.user.validateUserInfo>;

async function validateUserInfo(email: string, query: Record<string, string> = {}) {
  const validate = auth.options.user.validateUserInfo;
  if (!validate) throw new Error("Expected Better Auth user validation hook to be configured.");
  await validate(
    { user: { email } } as Parameters<ValidateUserInfo>[0],
    { query } as Parameters<ValidateUserInfo>[1],
  );
}

type SendMagicLink = typeof magicLinkOptions.sendMagicLink;
const send = (email: string) =>
  magicLinkOptions.sendMagicLink(
    { email, url: "https://example.test/verify", token: "t" },
    { headers: new Headers({ "x-forwarded-for": "203.0.113.1" }) } as Parameters<SendMagicLink>[1]
  );

describe("magic-link configuration", () => {
  const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "santa@example.test");
    access.isEmailEligibleForSignIn.mockResolvedValue(true);
    access.getPendingInviteToken.mockResolvedValue(null);
    limits.consume.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("allows signup only through the same eligibility gate, with hashed one-use links", () => {
    expect(magicLinkOptions.disableSignUp).toBe(false);
    expect(magicLinkOptions.expiresIn).toBe(900);
    expect(magicLinkOptions.storeToken).toBe("hashed");
    const plugin = auth.options.plugins.find((p) => p.id === "magic-link") as { options?: { disableSignUp?: boolean } } | undefined;
    expect(plugin?.options?.disableSignUp).toBe(false);
  });

  it("emails an eligible first-time account and checks its pending invite", async () => {
    access.getPendingInviteToken.mockResolvedValue("valid-invite-token");
    access.isEmailEligibleForSignIn.mockResolvedValue(true);
    await send(" Elf@Example.test ");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, request] = fetchSpy.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const message = JSON.parse(String(request.body)) as { html: string; text: string };
    const magicUrl = "https://example.test/verify";
    expect(message.html).toContain(`href="${magicUrl}"`);
    expect(message.html).toContain("Continue securely");
    expect(message.html).toContain("15 minutes");
    expect(message.text).toContain(magicUrl);
    expect(message.text).toContain("expires in 15 minutes");
    expect(message.text).toContain("If you didn’t request this link");
    expect(access.isEmailEligibleForSignIn).toHaveBeenCalledWith("elf@example.test", "valid-invite-token");
    expect(limits.consume).toHaveBeenCalledWith("email:elf@example.test");
    expect(limits.consume).toHaveBeenCalledWith("ip:203.0.113.1");
  });

  it("silently sends nothing to an unknown, ineligible email", async () => {
    access.isEmailEligibleForSignIn.mockResolvedValue(false);
    await expect(send("new@example.test")).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows an eligible address through the account creation guard", async () => {
    access.isEmailEligibleForSignIn.mockResolvedValue(true);

    await expect(validateUserInfo(" Elf@Example.test ")).resolves.toBeUndefined();
    expect(access.isEmailEligibleForSignIn).toHaveBeenCalledWith("elf@example.test", null);
  });

  it("rejects an ineligible address at the account creation guard", async () => {
    access.isEmailEligibleForSignIn.mockResolvedValue(false);

    await expect(validateUserInfo("new@example.test")).rejects.toThrow(
      "This account is not allowed to join this Secret Santa.",
    );
    expect(access.isEmailEligibleForSignIn).toHaveBeenCalledWith("new@example.test", null);
  });

  it.each(["email:elf@example.test", "ip:203.0.113.1"])("silently sends nothing when the %s rate limit is exceeded", async (blockedScope) => {
    limits.consume.mockImplementation(async (scope) => scope !== blockedScope);
    await send("elf@example.test");
    expect(limits.consume).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
