"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";
import { cn } from "@/shared/lib/utils";

type GenerationSettingsPopoverProps = {
  disabled?: boolean;
  onBlockedOpen?: () => void;
  label: string;
  summary: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
};

export function GenerationSettingsPopover({
  disabled = false,
  onBlockedOpen,
  label,
  summary,
  icon,
  children,
  className,
  align = "start",
  side = "top",
}: GenerationSettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <AppPopover
      open={!disabled && !onBlockedOpen && open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && onBlockedOpen) {
          setOpen(false);
          onBlockedOpen();
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <AppPopoverTrigger asChild>
        <AppButton
          disabled={disabled}
          type="button"
          variant="surface"
          className={cn("min-w-max", className)}
        >
          {icon}
          <span className="flex flex-col items-start leading-tight">
            {label !== summary && <span className="sr-only">{label}</span>}
            <span>{summary}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-white/46" />
        </AppButton>
      </AppPopoverTrigger>
      {!onBlockedOpen && <AppPopoverContent
        align={align}
        side={side}
        sideOffset={12}
        className="w-[min(22rem,calc(100vw-2rem))]"
      >
        {children}
      </AppPopoverContent>}
    </AppPopover>
  );
}
