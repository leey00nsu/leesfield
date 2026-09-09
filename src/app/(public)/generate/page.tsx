import { GenerationScreen } from "@/screens/generation/ui/generation-screen";
import { getSession } from "@/server/auth/session";
export default async function GenerationPage() {
  const session = await getSession();
  return (
      <GenerationScreen isAuthenticated={session.isLoggedIn} />
  );
}
