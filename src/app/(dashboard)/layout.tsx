import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { Header } from "@/widgets/header/ui/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return (
    <div
      className="min-h-screen bg-background-dark text-white"
      style={
        {
          "--dashboard-header-height": "64px",
        } as CSSProperties
      }
    >
      <Header
        isAuthenticated={session.isLoggedIn}
        userEmail={session.adminEmail}
      />
      <main className="bg-background-dark px-6 py-6">{children}</main>
    </div>
  );
}
