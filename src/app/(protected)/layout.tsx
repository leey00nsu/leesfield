import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { ProtectedShell } from "./protected-shell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return (
    <ProtectedShell
      isAuthenticated={session.isLoggedIn}
      userEmail={session.adminEmail ?? null}
    >
      {children}
    </ProtectedShell>
  );
}
