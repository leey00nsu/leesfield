import { getSession } from "@/server/auth/session";
import { UserProfileScreen } from "@/screens/user-profile/ui/user-profile-screen";

export default async function UserProfilePage() {
  const session = await getSession();

  return <UserProfileScreen adminEmail={session.adminEmail ?? ""} />;
}
