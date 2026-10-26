"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ko, enUS } from "date-fns/locale";
import { CalendarIcon, Clock2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";
import { AppInput } from "@/shared/ui/app-input";
import { Calendar } from "@/shared/ui/calendar";

type AppCalendarProps = ComponentProps<typeof Calendar>;

type AppDatePickerProps = {
  value?: Date;
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

export function AppCalendar({
  className,
  classNames,
  ...props
}: AppCalendarProps) {
  const locale = useLocale();
  return (
    <Calendar
      locale={locale === "ko" ? ko : enUS}
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
  const popup = useRef<HTMLDivElement>(null);
  const label = useMemo(() => value ? formatDateLabel(value) : ariaLabel, [value, ariaLabel]);

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
            "justify-between bg-black/45 px-5 font-sans text-sm text-white hover:!bg-black/45 hover:!text-white",
            className,
          )}
        >
          <span>{label}</span>
          <CalendarIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        </AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent
        ref={popup}
        initialFocus={() => { popup.current?.focus({ preventScroll: true }); return false; }}
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] max-h-[var(--available-height)] overflow-y-auto rounded-[1.35rem] border-white/10 bg-card p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,0.46)]"
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

/** Calendar and labelled time input share a single controlled filter value. */
export function AppDateTimePicker({value,onChange,"aria-label":ariaLabel,disabled,className,defaultTime="00:00:00"}:AppDatePickerProps&{defaultTime?:string}) {
  const [open,setOpen]=useState(false),[day,setDay]=useState<Date|undefined>(),[time,setTime]=useState(defaultTime);
  const popup=useRef<HTMLDivElement>(null),timeId=useId(),t=useTranslations("common.actions"),labels=useTranslations("common.listControls");
  const timeOf=(date:Date)=>[date.getHours(),date.getMinutes(),date.getSeconds()].map(n=>String(n).padStart(2,"0")).join(":");
  const valid=/^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(time);
  const changeOpen=(next:boolean)=>{if(next){setDay(value?new Date(value):undefined);setTime(value?timeOf(value):defaultTime);}setOpen(next);};
  return <AppPopover open={open} onOpenChange={changeOpen}>
    <AppPopoverTrigger asChild><AppButton type="button" size="toolbar" variant="surface" disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" className={cn("w-full min-w-0 justify-between text-left font-normal",className)}><span className="truncate">{value?formatDateLabel(value)+" "+timeOf(value):ariaLabel}</span><CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/></AppButton></AppPopoverTrigger>
    <AppPopoverContent ref={popup} initialFocus={()=>{popup.current?.focus({preventScroll:true});return false;}} align="start" className="w-auto max-w-[calc(100vw-2rem)] max-h-[var(--available-height)] overflow-y-auto p-2">
      <AppCalendar mode="single" selected={day} defaultMonth={day??value} onSelect={next=>{if(next)setDay(next);}}/>
      <div className="space-y-3 border-t border-border p-3"><label htmlFor={timeId} className="grid gap-2 text-xs"><span>{labels("time")}</span><span className="relative block"><AppInput id={timeId} type="time" step="1" value={time} aria-label={ariaLabel+" · "+labels("time")} onChange={event=>setTime(event.target.value)} className="w-full pr-9 appearance-none [&::-webkit-calendar-picker-indicator]:hidden"/><Clock2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/></span></label>
        <div className="flex justify-end gap-2"><AppButton type="button" size="sm" variant="ghost" onClick={()=>setOpen(false)}>{t("cancel")}</AppButton><AppButton type="button" size="sm" variant="surface" disabled={!day||!valid} onClick={()=>{if(!day||!valid)return;const [h,m,s=0]=time.split(":").map(Number);const selected=new Date(day);selected.setHours(h,m,s,0);onChange(selected);setOpen(false);}}>{t("apply")}</AppButton></div>
      </div>
    </AppPopoverContent>
  </AppPopover>;
}
