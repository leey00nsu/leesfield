import { VideoGenerationScreen } from "@/screens/video-generation/ui/video-generation-screen";
import { getSession } from "@/server/auth/session";

export default async function VideoGenerationPage() {
  const session = await getSession();

  return <VideoGenerationScreen isAuthenticated={session.isLoggedIn} />;
}
