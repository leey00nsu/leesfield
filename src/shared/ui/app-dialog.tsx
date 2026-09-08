"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { AppCloseButton } from "./app-close-button";
import { AppButton } from "@/shared/ui/app-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/ui/dialog";

type AppDialogSize = "sm" | "md" | "lg" | "xl" | "full";
type AppDialogSurface = "default" | "media" | "editor" | "canvas";
type AppDialogPadding = "default" | "none";
type AppDialogButtonProps = ComponentProps<typeof AppButton>;

const appDialogSizeClassNames: Record<AppDialogSize, string> = {
  sm: "sm:max-w-xl",
  md: "sm:max-w-3xl",
  lg: "sm:max-w-4xl",
  xl: "sm:max-w-6xl",
  full: "inset-0 h-screen w-screen max-w-none sm:max-w-none translate-x-0 translate-y-0",
};

const appDialogSurfaceClassNames: Record<AppDialogSurface, string> = {
  default: "",
  media: "",
  editor: "",
  canvas: "",
};

const appDialogPaddingClassNames: Record<AppDialogPadding, string> = {
  default: "",
  none: "p-0",
};

export function AppDialog(props: ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

export function AppDialogContent({
  className,
  overlayClassName,
  size = "md",
  stableHeight = false,
  surface = "default",
  padding = "default",
  ...props
}: ComponentProps<typeof DialogContent> & {
  size?: AppDialogSize;
  stableHeight?: boolean;
  surface?: AppDialogSurface;
  padding?: AppDialogPadding;
}) {
  return (
    <DialogContent
      data-app-dialog-content=""
      overlayClassName={cn(
        (surface === "editor" || surface === "canvas") && "z-[10000]",
        overlayClassName,
      )}
      className={cn(
        "w-[calc(100%-2rem)]",
        (surface === "editor" || surface === "canvas") && "z-[10001]",
        appDialogSizeClassNames[size],
        "[scrollbar-gutter:stable]",
        stableHeight && "h-[min(760px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
        size === "full" && surface === "media" && "max-h-none rounded-none border-0 bg-black/88 text-white ring-0",
        appDialogSurfaceClassNames[surface],
        appDialogPaddingClassNames[padding],
        className,
      )}
      {...props}
    />
  );
}

export function AppDialogHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-app-dialog-header=""
      className={cn("flex shrink-0 items-start justify-between gap-4", className)}
      {...props}
    />
  );
}

export function AppDialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      data-app-dialog-title=""
      className={cn("", className)}
      {...props}
    />
  );
}

export function AppDialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogDescription>) {
  return (
    <DialogDescription
      data-app-dialog-description=""
      className={cn("", className)}
      {...props}
    />
  );
}

export function AppDialogFooter({
  className,
  ...props
}: ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      data-app-dialog-footer=""
      className={cn("", className)}
      {...props}
    />
  );
}

export function AppDialogClose({
  className,
  ...props
}: ComponentProps<typeof DialogClose>) {
  return (
    <DialogClose
      data-app-dialog-close=""
      className={cn(className)}
      {...props}
    />
  );
}

export function AppDialogIconButton({
  className,
  variant = "surface",
  size = "icon-sm",
  ...props
}: AppDialogButtonProps) {
  return (
    <AppButton
      data-app-dialog-icon-button=""
      variant={variant}
      size={size}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

export function AppDialogCancelButton({
  className,
  variant = "surface",
  size = "md",
  ...props
}: AppDialogButtonProps) {
  return (
    <AppButton
      data-app-dialog-cancel-button=""
      variant={variant}
      size={size}
      className={cn("min-w-24 px-5 font-semibold", className)}
      {...props}
    />
  );
}

export function AppDialogActionButton({
  className,
  size = "md",
  ...props
}: AppDialogButtonProps) {
  return (
    <AppButton
      data-app-dialog-action-button=""
      size={size}
      className={cn("px-5 font-semibold", className)}
      {...props}
    />
  );
}

export function AppDialogDangerButton({
  className,
  variant = "danger",
  size = "md",
  ...props
}: AppDialogButtonProps) {
  return (
    <AppButton
      data-app-dialog-danger-button=""
      variant={variant}
      size={size}
      className={cn("px-5 font-semibold", className)}
      {...props}
    />
  );
}

export function AppDialogHeading({children, className}: ComponentProps<"div">) {
 return <AppDialogHeader className={cn("gap-4", className)}><div className="min-w-0 flex-1 space-y-2">{children}</div><AppDialogClose asChild><AppCloseButton /></AppDialogClose></AppDialogHeader>;
}

export function AppDialogBody({className, ...props}: ComponentProps<"div">) {
 return <div className={cn("min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]", className)} {...props} />;
}
