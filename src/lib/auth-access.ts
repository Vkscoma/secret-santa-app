import { headers } from "next/headers";
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/invite-tokens";
import { canUseInvite } from "@/lib/invites";
import { allowlist, user } from "@/lib/schema";

export const PENDING_INVITE_COOKIE = "ss_pending_invite";
export const PENDING_INVITE_STATE_COOKIE = "ss_pending_invite_state";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  return Boolean(
    email &&
      superAdminEmail &&
      normalizeEmail(email) === normalizeEmail(superAdminEmail)
  );
}

export async function getPendingInviteToken(): Promise<string | null> {
  return getCookieValue((await headers()).get("cookie"), PENDING_INVITE_COOKIE);
}

export async function getPendingInviteState(): Promise<string | null> {
  return getCookieValue((await headers()).get("cookie"), PENDING_INVITE_STATE_COOKIE);
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const encodedName = `${name}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));

  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(encodedName.length));
  } catch {
    return null;
  }
}

export async function isEmailAllowlisted(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  if (isSuperAdminEmail(normalizedEmail)) return true;

  const [record] = await db
    .select({ id: allowlist.id })
    .from(allowlist)
    .where(eq(allowlist.email, normalizedEmail))
    .limit(1);
  return Boolean(record);
}

export async function isEmailEligibleForSignIn(
  email: string,
  pendingInviteToken?: string | null
): Promise<boolean> {
  if (isSuperAdminEmail(email) || (await isEmailAllowlisted(email))) return true;
  return pendingInviteToken ? canUseInvite(pendingInviteToken) : false;
}

export async function userAccountExists(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const [record] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalizedEmail}`)
    .limit(1);
  return Boolean(record);
}

export async function repairSuperAdmin(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!isSuperAdminEmail(normalizedEmail)) return;
  await db.update(user).set({ role: "admin" }).where(sql`lower(${user.email}) = ${normalizedEmail}`);
  const [globalEntry] = await db
    .select({ id: allowlist.id })
    .from(allowlist)
    .where(and(isNull(allowlist.exchangeId), sql`lower(${allowlist.email}) = ${normalizedEmail}`))
    .limit(1);
  if (!globalEntry) {
    // Keep bootstrap compatible with an older allowlist schema while the
    // generated migration is pending; optional fields use their DB defaults.
    await db.insert(allowlist).values({ email: normalizedEmail }).onConflictDoNothing();
  }
}

export async function ensureAllowedUserRecord(input: {
  id: string;
  email: string;
  name: string;
}) {
  const email = normalizeEmail(input.email);
  if (isSuperAdminEmail(email)) {
    await repairSuperAdmin(email);
  }

  // This query is intentionally by the normalized email. It avoids trusting a
  // client-provided role or email spelling when bootstrapping access.
  const [storedUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, input.id), sql`lower(${user.email}) = ${email}`))
    .limit(1);
  return Boolean(storedUser);
}

export async function clearPendingInviteCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_INVITE_COOKIE);
  cookieStore.delete(PENDING_INVITE_STATE_COOKIE);
}
