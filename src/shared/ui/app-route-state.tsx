import type { ReactNode } from "react";
import Link from "next/link";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

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
    <main className="flex min-h-screen items-center justify-center bg-[#07090b] px-6 py-12 text-white">
      <AppCard
        variant="editorial-flat"
        className="w-full max-w-xl rounded-[1.75rem] p-8 text-center sm:p-10"
      >
        <AppBrandLogo
          variant="icon"
          size="lg"
          className="mx-auto"
          markClassName="shadow-[0_0_34px_rgba(205,255,0,0.2)]"
        />
        <AppEyebrow className="mt-8">{eyebrow}</AppEyebrow>
        <AppHeading as="h1" size="compact" className="mt-5">
          {title}
        </AppHeading>
        <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-white/58">
          {description}
        </p>
        {action ? <div className="mt-8">{action}</div> : null}
      </AppCard>
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
