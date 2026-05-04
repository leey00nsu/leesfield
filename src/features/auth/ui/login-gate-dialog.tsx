"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogIconButton,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";

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
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent surface="media" padding="none">
        <AppDialogClose asChild>
          <AppDialogIconButton
            type="button"
            aria-label={cancelLabel}
            className="absolute right-4 top-4 z-20 rounded-full"
          >
            <X className="h-4 w-4" />
          </AppDialogIconButton>
        </AppDialogClose>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <AppBrandLogo
              variant="icon"
              size="md"
              className="mb-5"
              markClassName="h-10 w-10"
            />
            <AppDialogHeader className="gap-3">
              <AppDialogTitle className="text-2xl font-black tracking-tight text-white">
                {title}
              </AppDialogTitle>
              <AppDialogDescription
                className={
                  description
                    ? "max-w-sm text-sm leading-6 text-gray-400"
                    : "sr-only"
                }
              >
                {description || actionLabel}
              </AppDialogDescription>
            </AppDialogHeader>
            <AppDialogFooter className="mt-8 gap-2 sm:justify-start sm:gap-3">
              <AppDialogClose asChild>
                <AppDialogCancelButton
                  type="button"
                >
                  {cancelLabel}
                </AppDialogCancelButton>
              </AppDialogClose>
              <AppDialogActionButton
                asChild
                type="button"
              >
                <Link href={actionHref}>{actionLabel}</Link>
              </AppDialogActionButton>
            </AppDialogFooter>
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
      </AppDialogContent>
    </AppDialog>
  );
}
