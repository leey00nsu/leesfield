"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/ui/dialog";

type AppDialogSize = "sm" | "md" | "lg" | "xl";
type AppDialogSurface = "default" | "media";
type AppDialogPadding = "default" | "none";
type AppDialogButtonProps = ComponentProps<typeof AppButton>;

const appDialogSizeClassNames: Record<AppDialogSize, string> = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

const appDialogSurfaceClassNames: Record<AppDialogSurface, string> = {
  default:
    "rounded-[1.5rem] border-white/10 bg-[#0b0d0e] text-white shadow-[0_34px_120px_rgba(0,0,0,0.65)]",
  media:
    "overflow-hidden rounded-[1.75rem] border-white/10 bg-[#121619] text-white shadow-[0_28px_120px_rgba(0,0,0,0.62)]",
};

const appDialogPaddingClassNames: Record<AppDialogPadding, string> = {
  default: "p-6",
  none: "p-0",
};

export function AppDialog(props: ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

export function AppDialogContent({
  className,
  size = "md",
  surface = "default",
  padding = "default",
  ...props
}: ComponentProps<typeof DialogContent> & {
  size?: AppDialogSize;
  surface?: AppDialogSurface;
  padding?: AppDialogPadding;
}) {
  return (
    <DialogContent
      data-app-dialog-content=""
      className={cn(
        "w-[calc(100%-2rem)]",
        appDialogSizeClassNames[size],
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
      className={cn("flex items-start justify-between gap-4", className)}
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
      className={cn("mt-2 text-xl font-semibold text-white", className)}
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
      className={cn(
        "text-[11px] font-black uppercase tracking-[0.24em] text-primary",
        className,
      )}
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
      className={cn(
        "mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function AppDialogClose({
  className,
  ...props
}: ComponentProps<typeof DialogClose>) {
  return (
    <DialogClose data-app-dialog-close="" className={cn(className)} {...props} />
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
      className={cn("px-5 font-semibold", className)}
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
