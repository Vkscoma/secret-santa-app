import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { allowlist, inviteLinks, inviteRedemptions, user } from "@/lib/schema";

export async function getUsersEligibleForExchange(exchangeId: string) {
  const allowedEntries = await db
    .selectDistinct({ id: user.id })
    .from(user)
    .leftJoin(allowlist, sql`lower(${allowlist.email}) = lower(${user.email})`)
    .where(and(sql`${allowlist.id} is not null`, or(isNull(allowlist.exchangeId), eq(allowlist.exchangeId, exchangeId))));

  const invitedEntries = await db
    .selectDistinct({ id: inviteRedemptions.userId })
    .from(inviteRedemptions)
    .innerJoin(inviteLinks, eq(inviteLinks.id, inviteRedemptions.inviteLinkId))
    .where(eq(inviteLinks.exchangeId, exchangeId));

  const ids = [...new Set([...allowedEntries.map(({ id }) => id), ...invitedEntries.map(({ id }) => id)])];
  if (!ids.length) return [];
  return db.select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(inArray(user.id, ids))
    .orderBy(user.name);
}

export async function getEligibleUserIdsForExchange(exchangeId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const allowedEntries = await db
    .selectDistinct({ id: user.id })
    .from(user)
    .leftJoin(allowlist, sql`lower(${allowlist.email}) = lower(${user.email})`)
    .where(and(
      inArray(user.id, ids),
      sql`${allowlist.id} is not null`,
      or(isNull(allowlist.exchangeId), eq(allowlist.exchangeId, exchangeId))
    ));
  const invitedEntries = await db
    .selectDistinct({ id: inviteRedemptions.userId })
    .from(inviteRedemptions)
    .innerJoin(inviteLinks, eq(inviteLinks.id, inviteRedemptions.inviteLinkId))
    .where(and(inArray(inviteRedemptions.userId, ids), eq(inviteLinks.exchangeId, exchangeId)));
  const configuredSuperAdmin = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const admins = configuredSuperAdmin
    ? await db.select({ id: user.id }).from(user).where(and(inArray(user.id, ids), sql`lower(${user.email}) = ${configuredSuperAdmin}`))
    : [];
  return new Set([...allowedEntries.map(({ id }) => id), ...invitedEntries.map(({ id }) => id), ...admins.map(({ id }) => id)]);
}
