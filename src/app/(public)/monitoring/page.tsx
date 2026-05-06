import { redirect } from "next/navigation";
import { MonitoringDashboardScreen } from "@/screens/monitoring-dashboard/ui/monitoring-dashboard-screen";
import { getSession } from "@/server/auth/session";

export default async function MonitoringDashboardPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return <MonitoringDashboardScreen />;
}
