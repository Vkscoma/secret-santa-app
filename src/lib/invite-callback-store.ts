import { createHash } from "node:crypto";
import { consumeOneTimeAuthRateLimit } from "@/lib/auth-rate-limit";
import { verifyInviteCallback } from "@/lib/invite-callback";
import { normalizeEmail } from "@/lib/invite-tokens";

/** Atomically consumes a signed callback so copied completion URLs cannot replay. */
export async function consumeInviteCallback(token: string, email: string, signature: string): Promise<boolean> {
  if (!verifyInviteCallback(token, email, signature)) return false;
  const keyHash = createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET}:invite-callback:${normalizeEmail(email)}:${token}:${signature}`)
    .digest("hex");
  return consumeOneTimeAuthRateLimit(keyHash);
}
