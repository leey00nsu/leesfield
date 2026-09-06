import type { ReactNode } from "react";
import Link from "next/link";
import { StatePanel } from "@/shared/ui/brand/state-panel/state-panel";
import { AppButton } from "@/shared/ui/app-button";

type AppRouteStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function AppRouteState({
  eyebrow,
  title,
  description,
  action,
}: AppRouteStateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div>
        <p className="text-center text-xs text-data-accent-foreground">
          {eyebrow}
        </p>
        <StatePanel
          headingLevel="h1"
          title={title}
          description={description}
          action={action}
        />
      </div>
    </main>
  );
}

export function AppRouteHomeAction({ label }: { label: string }) {
  return (
    <AppButton asChild className="rounded-full px-7">
      <Link href="/">{label}</Link>
    </AppButton>
  );
}
