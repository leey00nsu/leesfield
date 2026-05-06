import Image from "next/image";
import type React from "react";
import { cn } from "@/shared/lib/utils";

type AppBrandLogoProps = Omit<React.ComponentProps<"span">, "children"> & {
  variant?: "icon" | "full";
  size?: "sm" | "md" | "lg";
  label?: string;
  priority?: boolean;
  markClassName?: string;
  textClassName?: string;
};

const markSizeClasses = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

const imageSize = {
  sm: 36,
  md: 40,
  lg: 48,
} as const;

const textSizeClasses = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
} as const;

export function AppBrandLogo({
  variant = "full",
  size = "md",
  label = "leesfield",
  priority,
  className,
  markClassName,
  textClassName,
  ...props
}: AppBrandLogoProps) {
  const iconOnly = variant === "icon";

  return (
    <span
      data-app-brand-logo=""
      className={cn(
        "inline-flex min-w-0 items-center gap-3 text-white",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary shadow-[0_0_34px_rgba(205,255,0,0.2)]",
          markSizeClasses[size],
          markClassName,
        )}
      >
        <Image
          src="/logo.webp"
          alt={iconOnly ? label : ""}
          width={imageSize[size]}
          height={imageSize[size]}
          className="h-full w-full object-cover"
          priority={priority}
        />
      </span>
      {iconOnly ? null : (
        <span
          className={cn(
            "font-display truncate font-medium tracking-[-0.035em] text-white",
            textSizeClasses[size],
            textClassName,
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
