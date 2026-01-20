import { getSession } from "@/server/auth/session";
import { LandingScreen } from "@/screens/landing/ui/landing-screen";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <LandingScreen
      isAuthenticated={session.isLoggedIn}
      userEmail={session.adminEmail ?? null}
    />
  );
}
