import { redirect } from "next/navigation";
import { sanitizeLoginReturnTo } from "@/features/auth/lib/login-redirect";
import { getSession } from "@/server/auth/session";
import { LoginScreen } from "@/screens/auth/login/ui/login-screen";

type LoginPageProps = {
  searchParams?: Promise<{
    returnTo?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  const resolvedSearchParams = await searchParams;
  const returnToParam = Array.isArray(resolvedSearchParams?.returnTo)
    ? resolvedSearchParams?.returnTo[0]
    : resolvedSearchParams?.returnTo;
  const returnTo = sanitizeLoginReturnTo(returnToParam);

  if (session.isLoggedIn) {
    redirect(returnTo);
  }
  return <LoginScreen returnTo={returnTo} />;
}
