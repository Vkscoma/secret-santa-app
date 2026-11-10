import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, type MagicLinkOptions } from "better-auth/plugins/magic-link";
import { ensureAllowedUserRecord, getPendingInviteToken, isEmailEligibleForSignIn, isSuperAdminEmail, repairSuperAdmin } from "./auth-access";
import { consumeAuthRateLimit, magicLinkRateScopes } from "./auth-rate-limit";
import { db } from "./db";
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info(`Development sign-in link for ${email}: ${url}`);
      return;
    }
    throw new Error("Magic-link email is not configured.");
  }
  const safeUrl = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Your Secret Santa sign-in link</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f7f4; color:#23372f; font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">A secure, one-time link to your Secret Santa account.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; background-color:#f3f7f4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:560px; background-color:#ffffff; border:1px solid #e1e9e3; border-radius:16px; overflow:hidden;">
            <tr>
              <td align="center" style="padding:22px 28px; background-color:#174d3b; border-bottom:3px solid #d7ad55;">
                <p style="margin:0; color:#f4dfad; font-size:11px; line-height:16px; font-weight:bold; letter-spacing:2px;">A LITTLE HOLIDAY MAGIC</p>
                <p style="margin:7px 0 0; color:#ffffff; font-size:21px; line-height:28px; font-weight:bold;">Secret Santa</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 30px;">
                <p style="margin:0 0 10px; color:#63766b; font-size:13px; line-height:20px;">You’re invited to unwrap a little holiday magic.</p>
                <h1 style="margin:0 0 14px; color:#20382d; font-size:28px; line-height:36px; font-weight:700;">Sign in to Secret Santa</h1>
                <p style="margin:0 0 26px; color:#53645a; font-size:16px; line-height:25px;">Use the secure link below to sign in or finish creating your account. Then you can get back to the fun part: making someone’s holiday special.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 24px;">
                  <tr>
                    <td align="center" bgcolor="#a9363b" style="border-radius:9px; background-color:#a9363b;">
                      <a href="${safeUrl}" style="display:inline-block; padding:15px 28px; border:1px solid #a9363b; border-radius:9px; color:#ffffff; font-size:16px; line-height:20px; font-weight:bold; text-decoration:none;">Continue securely</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0; color:#59695f; font-size:14px; line-height:22px; text-align:center;">For your security, this one-time link expires in <strong style="color:#20382d;">15 minutes</strong>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px 24px; border-top:1px solid #e7eee8; background-color:#f8faf8;">
                <p style="margin:0; color:#6b786f; font-size:12px; line-height:19px; text-align:center;">If you didn’t request this link, you can safely ignore this email. Your account will remain secure.</p>
                <p style="margin:12px 0 0; color:#87938b; font-size:11px; line-height:17px; text-align:center;">Made for the people you love, and the little surprises in between.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0; color:#8b978f; font-size:11px; line-height:17px; text-align:center;">Secret Santa · A thoughtful surprise is on its way.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    "Secret Santa",
    "",
    "Sign in or finish creating your Secret Santa account with this secure, one-time link:",
    url,
    "",
    "This link expires in 15 minutes.",
    "If you didn’t request this link, you can safely ignore this email. Your account will remain secure.",
  ].join("\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: "Your Secret Santa sign-in link", html, text }),
  });
  if (!response.ok) throw new Error(`Resend rejected the email request (HTTP ${response.status}).`);
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
