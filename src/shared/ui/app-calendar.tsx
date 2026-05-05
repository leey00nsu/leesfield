"use client";

import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";
import { Calendar } from "@/shared/ui/calendar";

type AppCalendarProps = ComponentProps<typeof Calendar>;

type AppDatePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  "aria-label": string;
  disabled?: boolean;
  className?: string;
};

function formatDateLabel(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AppCalendar({ className, classNames, ...props }: AppCalendarProps) {
  return (
    <Calendar
      data-app-calendar=""
      className={cn("rounded-xl bg-transparent p-2 text-white", className)}
      classNames={{
        caption_label: "text-sm font-semibold text-white",
        weekday:
          "w-9 rounded-md text-[0.68rem] font-semibold uppercase tracking-widest text-white/38",
        day: "relative p-0 text-center text-sm text-white/82 focus-within:relative focus-within:z-20",
        selected: "rounded-md !bg-primary !text-black [&_button]:!text-black",
        today: "rounded-md bg-white/10 text-white",
        outside:
          "text-white/24 data-[selected]:bg-primary/10 data-[selected]:text-primary-content/70",
        disabled: "text-white/20 opacity-50",
        ...classNames,
      }}
      {...props}
    />
  );
}

export function AppDatePicker({
  value,
  onChange,
  "aria-label": ariaLabel,
  disabled,
  className,
}: AppDatePickerProps) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => formatDateLabel(value), [value]);

  return (
    <AppPopover open={open} onOpenChange={setOpen}>
      <AppPopoverTrigger asChild>
        <AppButton
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          disabled={disabled}
          size="toolbar"
          variant="surface"
          className={cn(
            "justify-between bg-black/45 px-5 font-mono text-sm text-white hover:!bg-black/45 hover:!text-white",
            className,
          )}
        >
          <span>{label}</span>
          <CalendarIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        </AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent
        align="start"
        className="w-auto rounded-[1.35rem] border-white/10 bg-[#0b0d0e] p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,0.46)]"
      >
        <AppCalendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            if (!date) return;
            onChange(date);
            setOpen(false);
          }}
        />
      </AppPopoverContent>
    </AppPopover>
  );
}
