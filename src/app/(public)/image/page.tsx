import { ImageGenerationScreen } from "@/screens/image-generation/ui/image-generation-screen";
import { getSession } from "@/server/auth/session";

export default async function ImageGenerationPage() {
  const session = await getSession();

  return <ImageGenerationScreen isAuthenticated={session.isLoggedIn} />;
}
