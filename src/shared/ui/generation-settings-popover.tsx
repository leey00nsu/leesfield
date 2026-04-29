"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";

type GenerationSettingsPopoverProps = {
  label: string;
  summary: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
};

export function GenerationSettingsPopover({
  label,
  summary,
  icon,
  children,
  className,
  align = "start",
}: GenerationSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="surface"
          className={cn(
            "h-12 min-w-max rounded-xl border-white/12 bg-black/16 px-3 text-sm font-medium text-white/82 hover:border-primary/45 hover:bg-black/24 hover:text-white",
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
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border-white/12 bg-[#111517]/95 p-4 text-white shadow-2xl backdrop-blur-xl"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
