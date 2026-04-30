import type { ComponentProps } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

type AppButtonVariant =
  | "primary"
  | "surface"
  | "ghost"
  | "white"
  | "danger";

type AppButtonSize = "sm" | "md" | "lg" | "xl" | "icon-sm" | "icon";

type AppButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
};

const variantClasses: Record<AppButtonVariant, string> = {
  primary:
    "bg-primary text-primary-content shadow-[0_0_30px_rgba(212,240,50,0.18)] hover:!bg-primary hover:!text-primary-content hover:shadow-[0_0_30px_rgba(212,240,50,0.18)]",
  surface:
    "border border-white/12 bg-black/16 text-white/82 hover:!bg-black/16 hover:!text-white/82",
  ghost: "text-white/70 hover:!bg-transparent hover:!text-white/70",
  white: "bg-white text-black hover:!bg-white hover:!text-black",
  danger:
    "border border-red-300/20 bg-red-500/12 text-red-100 hover:!bg-red-500/12 hover:!text-red-100",
};

const sizeClasses: Record<AppButtonSize, string> = {
  sm: "h-9 rounded-lg px-3 text-xs",
  md: "h-11 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-7 text-sm",
  xl: "h-16 rounded-2xl px-10 text-base",
  "icon-sm": "h-9 w-9 rounded-lg p-0",
  icon: "h-11 w-11 rounded-xl p-0",
};

export function AppButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: AppButtonProps) {
  return (
    <Button
      data-app-button=""
      variant="ghost"
      className={cn(
        "normal-case tracking-normal transition-all active:scale-[0.98]",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
