"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type LoginGateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
  cancelLabel: string;
  actionHref?: string;
};

export function LoginGateDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  cancelLabel,
  actionHref = "/login",
}: LoginGateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-white/10 bg-surface-dark p-6 shadow-2xl">
        <DialogHeader className="gap-2">
          <DialogTitle className="text-xl font-bold text-white">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-400">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2 sm:gap-3">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full border border-white/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
            >
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            asChild
            type="button"
            variant="default"
            className="rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-primary/90"
          >
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
