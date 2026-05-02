"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";
import { cn } from "@/shared/lib/utils";

type GenerationSettingsPopoverProps = {
  label: string;
  summary: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
};

export function GenerationSettingsPopover({
  label,
  summary,
  icon,
  children,
  className,
  align = "start",
  side = "top",
}: GenerationSettingsPopoverProps) {
  return (
    <AppPopover>
      <AppPopoverTrigger asChild>
        <AppButton
          type="button"
          variant="surface"
          className={cn(
            "h-12 min-w-max rounded-xl border-white/12 bg-black/16 px-3 text-sm font-medium text-white/82 hover:!bg-black/16 hover:!text-white/82",
            className,
          )}
        >
          {icon}
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] font-semibold uppercase text-white/42">
              {label}
            </span>
            <span>{summary}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-white/46" />
        </AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent
        align={align}
        side={side}
        sideOffset={12}
        collisionPadding={16}
        className="z-[90] w-[min(22rem,calc(100vw-2rem))] rounded-xl border-white/12 bg-[#111517]/95 p-4 text-white shadow-2xl backdrop-blur-xl"
      >
        {children}
      </AppPopoverContent>
    </AppPopover>
  );
}
