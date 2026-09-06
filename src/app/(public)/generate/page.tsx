import { Suspense } from "react";
import { GenerationScreen } from "@/screens/generation/ui/generation-screen";
import { getSession } from "@/server/auth/session";
export default async function GenerationPage() {
  const session = await getSession();
  return (
    <Suspense>
      <GenerationScreen isAuthenticated={session.isLoggedIn} />
    </Suspense>
  );
}
