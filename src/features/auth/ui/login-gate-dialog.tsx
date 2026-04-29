"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
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
  description?: string;
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-[1.75rem] border-white/10 bg-[#121619] p-0 text-white shadow-[0_28px_120px_rgba(0,0,0,0.62)]">
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={cancelLabel}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/35 text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogClose>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <BrandLogo
              variant="icon"
              size="md"
              className="mb-5"
              markClassName="h-10 w-10"
            />
            <DialogHeader className="gap-3">
              <DialogTitle className="text-2xl font-black tracking-tight text-white">
                {title}
              </DialogTitle>
              <DialogDescription
                className={
                  description
                    ? "max-w-sm text-sm leading-6 text-gray-400"
                    : "sr-only"
                }
              >
                {description || actionLabel}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-8 gap-2 sm:justify-start sm:gap-3">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="surface"
                  className="h-11 rounded-xl border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-gray-300"
                >
                  {cancelLabel}
                </Button>
              </DialogClose>
              <Button
                asChild
                type="button"
                variant="hero"
                className="h-11 rounded-xl px-6 text-sm shadow-none"
              >
                <Link href={actionHref}>{actionLabel}</Link>
              </Button>
            </DialogFooter>
          </div>
          <div className="relative hidden min-h-80 overflow-hidden border-l border-white/10 sm:block">
            <Image
              src="/assets/creative-studio/mirror-portrait.jpg"
              alt=""
              fill
              sizes="18rem"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.72),transparent_58%)]" />
            <div className="absolute bottom-4 left-4 right-4">
              <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-black text-black">
                LEESFIELD
              </span>
              <p className="mt-3 text-lg font-black uppercase leading-tight text-white">
                Creative workspace
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
