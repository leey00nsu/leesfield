import type { ComponentProps } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
type Variant =
  | "generate"
  | "brand"
  | "primary"
  | "surface"
  | "surface-muted"
  | "auth"
  | "ghost"
  | "white"
  | "danger"
  | "tab";
type Size =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "pill-sm"
  | "pill-md"
  | "toolbar"
  | "icon-sm"
  | "icon";
type Props = Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
  variant?: Variant;
  size?: Size;
};
const variants = {
  generate: "default",
  brand: "default",
  primary: "default",
  surface: "outline",
  "surface-muted": "secondary",
  auth: "outline",
  ghost: "ghost",
  white: "secondary",
  danger: "destructive",
  tab: "outline",
} as const;
const sizes = {
  sm: "sm",
  md: "default",
  lg: "lg",
  xl: "lg",
  "pill-sm": "sm",
  "pill-md": "default",
  toolbar: "lg",
  "icon-sm": "icon-sm",
  icon: "icon",
} as const;
export function AppButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: Props) {
  return (
    <Button
      data-app-button=""
      data-generation-action={variant === "generate" ? "" : undefined}
      className={cn((variant === "generate" || variant === "brand") && "bg-data-accent text-white hover:bg-data-accent/90", className)}
      variant={variants[variant]}
      size={sizes[size]}
      {...props}
    />
  );
}
