"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/ui/dialog";

export function AppDialog(props: ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

export function AppDialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      data-app-dialog-content=""
      className={cn(
        "w-[calc(100%-2rem)] max-w-3xl rounded-2xl border-white/10 bg-surface-dark p-6 text-white shadow-2xl",
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
      className={cn("mt-2 text-xl font-bold text-white", className)}
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
        "text-xs font-mono uppercase tracking-widest text-gray-500",
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
