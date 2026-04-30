import { redirect } from "next/navigation";
import { ModelManagementScreen } from "@/screens/model-management/ui/model-management-screen";
import { getSession } from "@/server/auth/session";

export default async function ModelManagementPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return <ModelManagementScreen />;
}
