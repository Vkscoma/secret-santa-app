import { requireAllowlisted } from "@/lib/authz";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  await requireAllowlisted();
  return <ProfileClient />;
}
