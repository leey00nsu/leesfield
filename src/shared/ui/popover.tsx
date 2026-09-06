"use client";
import { Children, type ReactElement, type ComponentProps } from "react";
import * as B from "@/shared/ui/brand/popover/popover";
export const Popover = B.Popover,
  PopoverContent = B.PopoverContent;
export function PopoverTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof B.PopoverTrigger> & { asChild?: boolean }) {
  return (
    <B.PopoverTrigger
      {...props}
      render={asChild ? (Children.only(children) as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </B.PopoverTrigger>
  );
}
