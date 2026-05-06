import type { ComponentProps } from "react";
import { AppButton } from "@/shared/ui/app-button";
import { cn } from "@/shared/lib/utils";

type DashboardCtaButtonProps = ComponentProps<typeof AppButton>;

const dashboardCtaClassName =
  "flex items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold uppercase tracking-wider text-black transition-colors shadow-[0_0_20px_rgba(212,240,50,0.2)] whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary";

export function DashboardCtaButton({
  className,
  size = "lg",
  variant = "primary",
  ...props
}: DashboardCtaButtonProps) {
  return (
    <AppButton
      {...props}
      size={size}
      variant={variant}
      className={cn(dashboardCtaClassName, className)}
    />
  );
}
