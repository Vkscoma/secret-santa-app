import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isSuperAdminEmail, isEmailAllowlisted } from "@/lib/auth-access";
import { db } from "@/lib/db";
import { exchangeParticipants, user } from "@/lib/schema";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

export async function requireAllowlisted() {
  const session = await requireSession();
  if (!(await isEmailAllowlisted(session.user.email))) redirect("/not-allowed");
  return session;
}

export async function requireAdmin() {
  const session = await requireAllowlisted();
  if (!(await hasCurrentAdminRole(session.user.id, session.user.email))) {
    throw new Error("Forbidden");
  }
  return session;
}

/** Check the persisted role, not the potentially stale Better Auth session snapshot. */
export async function hasCurrentAdminRole(userId: string, email: string) {
  if (isSuperAdminEmail(email)) return true;
  const [record] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return record?.role === "admin";
}

export async function requireExchangeMember(exchangeId: string) {
  const session = await requireAllowlisted();
  const [membership] = await db.select({ id: exchangeParticipants.id }).from(exchangeParticipants).where(and(
    eq(exchangeParticipants.exchangeId, exchangeId),
    eq(exchangeParticipants.userId, session.user.id)
  )).limit(1);
  if (!membership) throw new Error("Forbidden");
  return session;
}

export async function requireNonAdminExchangeMember(exchangeId: string) {
  const session = await requireExchangeMember(exchangeId);
  if (await hasCurrentAdminRole(session.user.id, session.user.email)) throw new Error("Forbidden");
  return session;
}
