"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/ui/avatar";

export function AppAvatar({
  className,
  ...props
}: ComponentProps<typeof Avatar>) {
  return (
    <Avatar
      data-app-avatar=""
      className={cn(
        "ring-2 ring-white/10 transition-all hover:ring-primary",
        className,
      )}
      {...props}
    />
  );
}

export function AppAvatarImage(props: ComponentProps<typeof AvatarImage>) {
  return <AvatarImage data-app-avatar-image="" {...props} />;
}

export function AppAvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarFallback>) {
  return (
    <AvatarFallback
      data-app-avatar-fallback=""
      className={cn(
        "flex items-center justify-center bg-surface-lighter text-[10px] font-bold text-white",
        className,
      )}
      {...props}
    />
  );
}
