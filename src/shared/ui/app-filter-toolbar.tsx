"use client";

import type { ComponentProps, ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput, appInputSurfaceClassName } from "@/shared/ui/app-input";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
} from "@/shared/ui/app-select";

type AppFilterToolbarProps = ComponentProps<"div">;

export function AppFilterToolbar({
  className,
  children,
  ...props
}: AppFilterToolbarProps) {
  return (
    <div
      data-app-filter-toolbar=""
      className={cn(
        "flex w-full flex-col gap-3 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.018))] p-3 shadow-[0_22px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppFilterGroup({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-app-filter-group=""
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type AppFilterToggleProps = Omit<
  ComponentProps<typeof AppButton>,
  "variant" | "size"
> & {
  active?: boolean;
  icon?: ReactNode;
};

export function AppFilterToggle({
  active = false,
  icon,
  className,
  children,
  ...props
}: AppFilterToggleProps) {
  return (
    <AppButton
      data-app-filter-toggle=""
      variant={active ? "primary" : "surface"}
      size="md"
      className={cn(
        "h-11 rounded-full px-5 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        active
          ? "ring-2 ring-primary/55"
          : "border-white/10 bg-black/20 text-white/78",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </AppButton>
  );
}

type AppSearchFieldProps = Omit<ComponentProps<typeof AppInput>, "size"> & {
  containerClassName?: string;
  trailing?: ReactNode;
};

export function AppSearchField({
  className,
  containerClassName,
  trailing,
  ...props
}: AppSearchFieldProps) {
  return (
    <label
      data-app-search-field=""
      className={cn(
        appInputSurfaceClassName,
        "flex min-w-0 flex-1 items-center gap-3 shadow-xs transition-colors focus-within:border-primary",
        containerClassName,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-white/38" />
      <AppInput
        className={cn(
          "h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-sm text-white shadow-none outline-none placeholder:text-white/38 focus-visible:border-transparent focus-visible:ring-0",
          className,
        )}
        {...props}
      />
      {trailing}
    </label>
  );
}

type AppSortSelectOption = {
  value: string;
  label: string;
};

type AppSortSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSortSelectOption[];
  ariaLabel: string;
  className?: string;
};

export function AppSortSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: AppSortSelectProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <AppSelectRoot value={value} onValueChange={onValueChange}>
      <AppSelectTrigger
        data-app-sort-select=""
        aria-label={ariaLabel}
        className={cn(
          "h-12 w-[12rem] flex-none rounded-xl border-white/10 bg-black/22 px-4 text-sm font-semibold text-white/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] hover:bg-black/22",
          className,
        )}
      >
        <span aria-hidden="true" className="min-w-0 flex-1 truncate text-left text-white/86">
          {selectedLabel}
        </span>
      </AppSelectTrigger>
      <AppSelectContent className="border-white/10 bg-[#0b0d0e] text-white">
        {options.map((option) => (
          <AppSelectItem key={option.value} value={option.value}>
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelectRoot>
  );
}
