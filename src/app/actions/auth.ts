"use server";

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getPendingInviteState, getPendingInviteToken, PENDING_INVITE_STATE_COOKIE } from "@/lib/auth-access";
import { signInviteCallback } from "@/lib/invite-callback";
import { normalizeEmail } from "@/lib/invite-tokens";
import { canUseInvite } from "@/lib/invites";

const emailSchema = z.string().trim().email().max(320);
const genericResponse = "If this email is approved, a secure link will be sent shortly.";

function suggestedName(email: string) {
  const localPart = email.split("@", 1)[0] ?? "Secret Santa";
  const name = localPart.replace(/[._+-]+/g, " ").replace(/\s+/g, " ").trim();
  return (name ? name.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Secret Santa").slice(0, 80);
}

export async function requestMagicLink(formData: FormData): Promise<{ message: string }> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { message: genericResponse };
  const email = normalizeEmail(parsed.data);
  const requestHeaders = await headers();
  try {
    const pendingInviteToken = await getPendingInviteToken();
    const hasValidPendingInvite = pendingInviteToken ? await canUseInvite(pendingInviteToken) : false;
    const inviteCallbackState = hasValidPendingInvite && pendingInviteToken
      ? signInviteCallback(pendingInviteToken, email)
      : null;
    const pendingInviteState = hasValidPendingInvite ? await getPendingInviteState() : null;
    const callbackURL = hasValidPendingInvite && pendingInviteToken
      ? inviteCallbackState
        ? `/join/complete?invite=${encodeURIComponent(pendingInviteToken)}&proof=${encodeURIComponent(inviteCallbackState)}`
        : pendingInviteState
          ? `/join/complete?state=${encodeURIComponent(pendingInviteState)}`
          : "/join/complete"
      : "/dashboard";
    // Eligibility (allowlist/super-admin/valid invite, rate limits) is enforced
    // in the magic-link plugin's sendMagicLink callback, which silently skips sending.
    await auth.api.signInMagicLink({
      body: {
        email,
        name: suggestedName(email),
        callbackURL,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    // Keep this response identical for unknown, disallowed, and failed requests.
    if (process.env.NODE_ENV === "development") {
      console.error(
        `[auth] Magic-link request failed: ${error instanceof Error ? error.message : "Unknown error."}`
      );
    }
  }
  return { message: genericResponse };
}

export async function setPendingInvite(token: string): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const { canUseInvite } = await import("@/lib/invites");
  if (!(await canUseInvite(token))) return null;
  const cookieStore = await cookies();
  const state = randomBytes(32).toString("base64url");
  cookieStore.set("ss_pending_invite", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  cookieStore.set(PENDING_INVITE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  return state;
}
