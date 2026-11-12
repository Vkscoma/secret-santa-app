"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";

const preferencesSchema = z.object({ reminders: z.boolean(), nudges: z.boolean(), digests: z.boolean() });

export async function saveNotificationPreferences(formData: FormData) {
  const session = await requireAllowlisted();
  const parsed = preferencesSchema.safeParse({
    reminders: formData.get("reminders") === "on",
    nudges: formData.get("nudges") === "on",
    digests: formData.get("digests") === "on",
  });
  if (!parsed.success) throw new Error("Invalid notification preferences.");
  await db.update(user).set({ notificationPrefs: parsed.data }).where(eq(user.id, session.user.id));
  return { ok: true };
}
