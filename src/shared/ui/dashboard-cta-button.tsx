import type { ComponentProps } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

type DashboardCtaButtonProps = ComponentProps<typeof Button>;

const dashboardCtaClassName =
  "flex items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold uppercase tracking-wider text-black transition-colors shadow-[0_0_20px_rgba(212,240,50,0.2)] whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary";

export function DashboardCtaButton({
  className,
  size = "lg",
  variant = "default",
  ...props
}: DashboardCtaButtonProps) {
  return (
    <Button
      {...props}
      size={size}
      variant={variant}
      className={cn(dashboardCtaClassName, className)}
    />
  );
}
