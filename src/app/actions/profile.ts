"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";

const displayNameSchema = z.string().trim().max(100);

export async function saveDisplayName(formData: FormData) {
  const session = await requireAllowlisted();
  const value = formData.get("displayName");
  const parsed = displayNameSchema.safeParse(typeof value === "string" ? value : "");
  if (!parsed.success) throw new Error("Check the display name and try again.");
  const displayName = parsed.data || null;
  await db.update(user).set({ displayName }).where(eq(user.id, session.user.id));
  return { ok: true, displayName };
}
