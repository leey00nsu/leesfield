"use client";
import type { ComponentProps } from "react";
import {
  Badge as BrandBadge,
  badgeVariants,
} from "@/shared/ui/brand/badge/badge";
type Props = Omit<ComponentProps<typeof BrandBadge>, "variant"> & {
  variant?: "default" | "muted" | "primary" | "outline" | "overlay";
  size?: "sm" | "md";
};
const variants = {
  default: "secondary",
  muted: "secondary",
  primary: "default",
  outline: "outline",
  overlay: "secondary",
} as const;
export function Badge({ variant = "default", size, ...props }: Props) {
  void size;
  return <BrandBadge variant={variants[variant]} {...props} />;
}
export { badgeVariants };
