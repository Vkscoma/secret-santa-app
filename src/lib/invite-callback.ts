import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "@/lib/invite-tokens";

function inviteCallbackSignature(token: string, email: string): Buffer | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`${normalizeEmail(email)}\0${token}`)
    .digest();
}

export function signInviteCallback(token: string, email: string): string | null {
  return inviteCallbackSignature(token, email)?.toString("base64url") ?? null;
}

export function verifyInviteCallback(token: string, email: string, signature: string): boolean {
  const expected = inviteCallbackSignature(token, email);
  if (!expected) return false;
  try {
    const received = Buffer.from(signature, "base64url");
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

