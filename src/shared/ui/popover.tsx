"use client";
import { Children, type ReactElement, type ComponentProps } from "react";
import * as B from "@/shared/ui/brand/popover/popover";
import { useAppOverlayScope } from "./app-overlay-scope";
export const Popover = B.Popover;
export function PopoverContent(props: ComponentProps<typeof B.PopoverContent>) {
  const scope = useAppOverlayScope();
  return <B.PopoverContent {...props} data-app-overlay-scope={scope} />;
}
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
