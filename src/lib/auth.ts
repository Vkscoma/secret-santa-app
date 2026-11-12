import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, type MagicLinkOptions } from "better-auth/plugins/magic-link";
import { ensureAllowedUserRecord, getPendingInviteToken, isEmailEligibleForSignIn, isSuperAdminEmail, repairSuperAdmin } from "./auth-access";
import { consumeAuthRateLimit, magicLinkRateScopes } from "./auth-rate-limit";
import { db } from "./db";
import { sendNotificationEmail } from "./email";
import { verifyInviteCallback } from "./invite-callback";
import { maySendMagicLink, normalizeEmail, trustedRoleForEmail } from "./invite-tokens";
import { redeemInviteForUser } from "./invites";

function inviteTokenFromCallback(callbackURL: unknown, email: string): string | null {
  if (typeof callbackURL !== "string") return null;
  try {
    const params = new URL(callbackURL, process.env.BETTER_AUTH_URL ?? "http://localhost:3000").searchParams;
    const token = params.get("invite");
    const proof = params.get("proof");
    return token && proof && verifyInviteCallback(token, email, proof) ? token : null;
  } catch {
    return null;
  }
}

async function sendMagicLink(email: string, url: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info(`Development sign-in link for ${email}: ${url}`);
      return;
    }
    throw new Error("Magic-link email is not configured.");
  }
  await sendNotificationEmail({ to: email, kind: "magic-link", url, detail: "Use this secure one-time link to sign in or finish creating your account. It expires in 15 minutes." });
}

/**
 * Exported so tests can assert that only allowlisted/invited addresses receive
 * email links, while Better Auth may create an eligible first-time account.
 */
export const magicLinkOptions = {
  expiresIn: 900,
  disableSignUp: false,
  storeToken: "hashed",
  rateLimit: { window: 60, max: 5 },
  sendMagicLink: async ({ email, url }, ctx) => {
    const normalizedEmail = normalizeEmail(email);
    const ip = ctx?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const [emailScope, ipScope] = magicLinkRateScopes(normalizedEmail, ip);
    const [emailWithinRateLimit, ipWithinRateLimit] = await Promise.all([
      consumeAuthRateLimit(emailScope),
      consumeAuthRateLimit(ipScope),
    ]);
    const pendingInviteToken = await getPendingInviteToken();
    const isEligible = await isEmailEligibleForSignIn(normalizedEmail, pendingInviteToken);
    if (!emailWithinRateLimit || !ipWithinRateLimit) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[auth] Magic-link request skipped: rate limit exceeded.");
      }
      return;
    }
    if (!isEligible) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[auth] Magic-link request skipped: email is not eligible.");
      }
      return;
    }
    if (!maySendMagicLink({ isEligible, emailWithinRateLimit, ipWithinRateLimit })) return;
    await sendMagicLink(normalizedEmail, url);
  },
} satisfies MagicLinkOptions;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [magicLink(magicLinkOptions)],
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
      displayName: { type: "string", required: false },
      shippingAddress: { type: "string", required: false },
      sizes: { type: "string", required: false },
      notificationPrefs: { type: "json", required: false, defaultValue: {} },
    },
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },
    validateUserInfo: async ({ user }, context) => {
      if (!user.email) throw new Error("An email address is required.");
      const email = normalizeEmail(user.email);
      if (isSuperAdminEmail(email)) await repairSuperAdmin(email);
      const callbackToken = inviteTokenFromCallback(context.query?.callbackURL, email)
        ?? inviteTokenFromCallback(context.query?.newUserCallbackURL, email);
      const pendingToken = callbackToken ?? await getPendingInviteToken();
      if (!(await isEmailEligibleForSignIn(email, pendingToken))) {
        throw new Error("This account is not allowed to join this Secret Santa.");
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => ({
          data: {
            ...newUser,
            role: newUser.email ? trustedRoleForEmail(newUser.email, process.env.SUPER_ADMIN_EMAIL) : "user",
          },
        }),
        after: async (createdUser) => {
          const email = normalizeEmail(createdUser.email);
          await ensureAllowedUserRecord({ id: createdUser.id, email, name: createdUser.name });
          const token = await getPendingInviteToken();
          if (token && !await isEmailEligibleForSignIn(email)) {
            await redeemInviteForUser({ token, userId: createdUser.id, email });
          }
        },
      },
    },
  },
});
