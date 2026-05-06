"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

export function AppConfirmDialog(props: ComponentProps<typeof AlertDialog>) {
  return <AlertDialog {...props} />;
}

export function AppConfirmDialogContent({
  className,
  ...props
}: ComponentProps<typeof AlertDialogContent>) {
  return (
    <AlertDialogContent
      data-app-confirm-dialog-content=""
      className={cn(
        "w-[calc(100%-2rem)] max-w-xl rounded-[1.5rem] border-white/10 bg-[#0b0d0e] p-6 text-white shadow-[0_34px_120px_rgba(0,0,0,0.65)]",
        className,
      )}
      {...props}
    />
  );
}

export function AppConfirmDialogHeader({
  className,
  ...props
}: ComponentProps<typeof AlertDialogHeader>) {
  return (
    <AlertDialogHeader
      data-app-confirm-dialog-header=""
      className={cn(className)}
      {...props}
    />
  );
}

export function AppConfirmDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogTitle>) {
  return (
    <AlertDialogTitle
      data-app-confirm-dialog-title=""
      className={cn("text-lg font-semibold text-white", className)}
      {...props}
    />
  );
}

export function AppConfirmDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogDescription>) {
  return (
    <AlertDialogDescription
      data-app-confirm-dialog-description=""
      className={cn("text-sm text-gray-300", className)}
      {...props}
    />
  );
}

export function AppConfirmDialogFooter({
  className,
  ...props
}: ComponentProps<typeof AlertDialogFooter>) {
  return (
    <AlertDialogFooter
      data-app-confirm-dialog-footer=""
      className={cn("mt-4", className)}
      {...props}
    />
  );
}

export function AppConfirmDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertDialogCancel>) {
  return (
    <AlertDialogCancel
      data-app-confirm-dialog-cancel=""
      className={cn(
        "h-11 rounded-full border border-white/10 px-5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/6 hover:text-white",
        className,
      )}
      {...props}
    />
  );
}

export function AppConfirmDialogAction({
  className,
  ...props
}: ComponentProps<typeof AlertDialogAction>) {
  return (
    <AlertDialogAction
      data-app-confirm-dialog-action=""
      className={cn(
        "h-11 rounded-full bg-destructive px-5 text-sm font-semibold text-white hover:bg-destructive/90",
        className,
      )}
      {...props}
    />
  );
}
