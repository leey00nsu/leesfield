import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { LoginScreen } from "@/screens/auth/login/ui/login-screen";

export default async function LoginPage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/");
  }
  return <LoginScreen />;
}
