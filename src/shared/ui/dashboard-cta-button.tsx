import type { ComponentProps } from "react";
import { AppButton } from "@/shared/ui/app-button";
import { cn } from "@/shared/lib/utils";

type DashboardCtaButtonProps = ComponentProps<typeof AppButton>;

const dashboardCtaClassName = "";

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
