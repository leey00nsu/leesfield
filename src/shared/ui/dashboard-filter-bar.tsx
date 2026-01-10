import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const filterToggleBase =
  "flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider transition-all";
const filterToggleActive = "bg-primary text-black hover:bg-primary-dark";
const filterToggleInactive =
  "border border-white/5 bg-surface-dark text-gray-400 hover:bg-surface-lighter hover:text-white";

type DashboardFilterBarProps = {
  children: ReactNode;
  className?: string;
};

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

type DashboardFilterToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  icon?: ReactNode;
};

export function DashboardFilterToggle({
  active,
  icon,
  className,
  type = "button",
  children,
  ...rest
}: DashboardFilterToggleProps) {
  return (
    <button
      type={type}
      className={cn(
        filterToggleBase,
        active ? filterToggleActive : filterToggleInactive,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

type DashboardFilterDividerProps = {
  className?: string;
};

export function DashboardFilterDivider({
  className,
}: DashboardFilterDividerProps) {
  return <div className={cn("mx-2 h-6 w-px bg-white/10", className)} />;
}
