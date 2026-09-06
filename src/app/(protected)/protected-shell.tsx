"use client";

import { type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Header } from "@/widgets/header/ui/header";

type ProtectedShellProps = {
  children: ReactNode;
  isAuthenticated: boolean;
  userEmail: string | null;
};

export function ProtectedShell({
  children,
  isAuthenticated,
  userEmail,
}: ProtectedShellProps) {
  const pathname = usePathname();
  const nodeStudio = /^\/spaces\/[^/]+\/?$/.test(pathname);

  if (nodeStudio) {
    return (
      <div
        className="spaces-canvas h-dvh overflow-hidden bg-background text-foreground"
      >
        <main className="h-full min-h-0">{children}</main>
      </div>
    );
  }

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
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
      />
      <main
        className="bg-background-dark px-4 sm:px-6 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
