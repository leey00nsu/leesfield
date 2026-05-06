import { redirect } from "next/navigation";
import { GenerationHistoryScreen } from "@/screens/generation-history/ui/generation-history-screen";
import { getSession } from "@/server/auth/session";

export default async function GenerationHistoryPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return <GenerationHistoryScreen />;
}
