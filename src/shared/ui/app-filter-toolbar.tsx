"use client";

import type { ComponentProps, ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { appInputShellClassName } from "@/shared/ui/app-input";
import { Input } from "@/shared/ui/input";
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
        "flex w-full flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
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
      variant="surface"
      size="md"
      className={cn(active && "border-data-accent/40 bg-data-accent/15 text-data-accent-foreground hover:bg-data-accent/25 hover:text-data-accent-foreground dark:border-data-accent/40 dark:bg-data-accent/15 dark:hover:bg-data-accent/25", className)}
      {...props}
    >
      {icon}
      {children}
    </AppButton>
  );
}

type AppSearchFieldProps = Omit<ComponentProps<typeof Input>, "size"> & {
  containerClassName?: string;
  trailing?: ReactNode;
};

export const appSearchFieldSurfaceClassName = cn(
  appInputShellClassName,
  "flex w-full min-w-0 items-center gap-2 px-2 focus-within:border-primary",
);

export function AppSearchField({
  className,
  containerClassName,
  trailing,
  ...props
}: AppSearchFieldProps) {
  return (
    <span
      data-app-search-field=""
      className={cn("relative block min-w-0", containerClassName)}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-app-search-input=""
        type="search"
        className={cn("pl-9", className)}
        {...props}
      />
      {trailing ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {trailing}
        </span>
      ) : null}
    </span>
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
        className={cn("w-[12rem] flex-none", className)}
      >
        <span
          aria-hidden="true"
          className="min-w-0 flex-1 truncate text-left text-white/86"
        >
          {selectedLabel}
        </span>
      </AppSelectTrigger>
      <AppSelectContent className="border-white/10 bg-card text-white">
        {options.map((option) => (
          <AppSelectItem key={option.value} value={option.value}>
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelectRoot>
  );
}
