import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const filterToggleBase =
  "h-9 gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider";
const filterToggleActive = "text-black hover:bg-primary-dark";
const filterToggleInactive = "text-gray-400 hover:text-white";

interface DashboardFilterBarProps {
  children: ReactNode;
  className?: string;
}

export function DashboardFilterBar({
  children,
  className,
}: DashboardFilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  );
}

interface DashboardFilterToggleProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
  icon?: ReactNode;
}

export function DashboardFilterToggle({
  active,
  icon,
  className,
  type = "button",
  children,
  ...rest
}: DashboardFilterToggleProps) {
  return (
    <Button
      type={type}
      variant={active ? "default" : "surface"}
      className={cn(
        filterToggleBase,
        active ? filterToggleActive : filterToggleInactive,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </Button>
  );
}

interface DashboardFilterDividerProps {
  className?: string;
}

export function DashboardFilterDivider({
  className,
}: DashboardFilterDividerProps) {
  return <div className={cn("mx-2 h-6 w-px bg-white/10", className)} />;
}
