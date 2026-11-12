import { eq } from "drizzle-orm";
import { requireAllowlisted } from "@/lib/authz";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const session = await requireAllowlisted();
  const [profile] = await db.select({ notificationPrefs: user.notificationPrefs }).from(user).where(eq(user.id, session.user.id)).limit(1);
  return <ProfileClient initialNotificationPrefs={profile?.notificationPrefs ?? {}} />;
}
