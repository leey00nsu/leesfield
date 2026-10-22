"use client";
import { Children, type ReactElement, type ComponentProps } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as B from "@/shared/ui/brand/popover/popover";
import { cn } from "@/shared/lib/utils";
import { useAppOverlayScope } from "./app-overlay-scope";
export const Popover = B.Popover;
export function PopoverContent({ align = "center", alignOffset = 0, side = "bottom", sideOffset = 6, className, portal, ...props }:
  ComponentProps<typeof B.PopoverContent> & { portal?: Pick<PopoverPrimitive.Portal.Props, "container"> }) {
  const scope = useAppOverlayScope();
  // Portal placement is an app concern; keep the pinned brand source intact.
  return <PopoverPrimitive.Portal {...portal}>
    <PopoverPrimitive.Positioner align={align} alignOffset={alignOffset} side={side} sideOffset={sideOffset} className="isolate z-50">
      <PopoverPrimitive.Popup {...props} data-slot="popover-content" data-app-overlay-scope={scope}
        className={cn("origin-(--transform-origin) rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className)} />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>;
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
