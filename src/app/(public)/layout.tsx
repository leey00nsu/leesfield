import type { CSSProperties } from "react";
import { Header } from "@/widgets/header/ui/header";
import { getSession } from "@/server/auth/session";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div
      className="flex min-h-dvh flex-col bg-background-dark text-white"
      style={
        {
          "--dashboard-header-height": "60px",
        } as CSSProperties
      }
    >
      <Header
        variant="public"
        isAuthenticated={session.isLoggedIn}
        userEmail={session.adminEmail}
      />
      <main className="flex flex-1 flex-col bg-background-dark px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
