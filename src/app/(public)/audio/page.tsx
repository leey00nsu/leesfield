import { AudioGenerationScreen } from "@/screens/audio-generation/ui/audio-generation-screen";
import { getSession } from "@/server/auth/session";

export default async function AudioGenerationPage() {
  const session = await getSession();

  return <AudioGenerationScreen isAuthenticated={session.isLoggedIn} />;
}
