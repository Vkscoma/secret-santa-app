import { requireAllowlisted } from "@/lib/authz";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  await requireAllowlisted();
  return <DashboardClient />;
}
