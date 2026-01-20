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
      className="min-h-screen bg-background-dark text-white"
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
      <main className="bg-background-dark px-6 py-6">{children}</main>
    </div>
  );
}
