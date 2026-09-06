"use client";
import { Children, type ReactElement, type ComponentProps } from "react";
import * as B from "@/shared/ui/brand/tooltip/tooltip";
export const Tooltip = B.Tooltip,
  TooltipContent = B.TooltipContent;
export function TooltipProvider({
  delayDuration,
  ...props
}: ComponentProps<typeof B.TooltipProvider> & { delayDuration?: number }) {
  return <B.TooltipProvider delay={delayDuration} {...props} />;
}
export function TooltipTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof B.TooltipTrigger> & { asChild?: boolean }) {
  return (
    <B.TooltipTrigger
      {...props}
      render={asChild ? (Children.only(children) as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </B.TooltipTrigger>
  );
}
