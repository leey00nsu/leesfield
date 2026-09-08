"use client";
import { AppCloseButton } from "@/shared/ui/app-close-button";
import { CloseLabel } from "@/shared/ui/close-label";
import { Children, type ReactElement, type ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import * as B from "@/shared/ui/brand/dialog/dialog";
export const Dialog = B.Dialog,
  DialogTitle = B.DialogTitle,
  DialogDescription = B.DialogDescription,
  DialogHeader = B.DialogHeader,
  DialogFooter = B.DialogFooter,
  DialogPortal = B.DialogPortal,
  DialogOverlay = B.DialogOverlay;
export function DialogTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof B.DialogTrigger> & { asChild?: boolean }) {
  return (
    <B.DialogTrigger
      {...props}
      render={asChild ? (Children.only(children) as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </B.DialogTrigger>
  );
}
export function DialogClose({
  asChild,
  children,
  ...props
}: ComponentProps<typeof B.DialogClose> & { asChild?: boolean }) {
  return (
    <B.DialogClose
      {...props}
      render={asChild ? (Children.only(children) as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </B.DialogClose>
  );
}
export function DialogContent({
  overlayClassName,
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof B.DialogContent> & { overlayClassName?: string }) {
  if (!overlayClassName) return <B.DialogContent className={className} showCloseButton={false} {...props}>{children}{showCloseButton && <B.DialogClose render={<AppCloseButton className="absolute top-4 right-4" />} />}</B.DialogContent>;
  return <B.DialogPortal>
    <B.DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Popup data-slot="dialog-content" className={cn("fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground break-words ring-1 ring-foreground/10 duration-100 outline-none *:min-w-0 sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className)} {...props}>
      {children}
      {showCloseButton && <B.DialogClose render={<AppCloseButton className="absolute top-4 right-4" />}><XIcon /><span className="sr-only"><CloseLabel /></span></B.DialogClose>}
    </DialogPrimitive.Popup>
  </B.DialogPortal>;
}
