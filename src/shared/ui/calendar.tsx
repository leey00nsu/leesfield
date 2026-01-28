"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/shared/lib/utils"
import { buttonVariants } from "@/shared/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  navLayout = "around",
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn("p-3", className)}
      classNames={{
        root: "bg-transparent",
        months: "flex flex-col gap-4 sm:flex-row sm:gap-6",
        month: "relative space-y-4",
        month_caption:
          "relative flex items-center justify-center pt-1 pointer-events-none",
        caption_label: "text-sm font-semibold text-white",
        nav: "flex items-center gap-1 text-white",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "absolute left-1 top-1 z-10 h-7 w-7 bg-transparent p-0 text-white opacity-70 hover:opacity-100 hover:text-white"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "absolute right-1 top-1 z-10 h-7 w-7 bg-transparent p-0 text-white opacity-70 hover:opacity-100 hover:text-white"
        ),
        chevron: "text-white stroke-white",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "w-9 rounded-md text-[0.7rem] font-medium uppercase tracking-widest text-gray-500",
        weeks: "flex flex-col",
        week: "mt-2 flex w-full",
        day:
          "relative p-0 text-center text-sm text-gray-200 focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-9 w-9 rounded-md p-0 font-normal text-current"
        ),
        range_end:
          "day-range-end rounded-r-md !bg-primary !text-primary-content",
        range_middle: "bg-primary/15 text-white",
        range_start:
          "day-range-start rounded-l-md !bg-primary !text-primary-content",
        selected: "bg-primary/15 text-white rounded-md",
        today: "bg-white/10 text-white",
        outside: "text-gray-600 data-[selected]:bg-primary/10 data-[selected]:text-gray-400",
        disabled: "text-gray-600 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
