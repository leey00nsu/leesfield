"use client";

import { useState, useRef, type ComponentProps, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ListFilter, Search, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { appInputShellClassName } from "@/shared/ui/app-input";
import { Input } from "@/shared/ui/input";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
} from "@/shared/ui/app-select";

type AppFilterToolbarProps = ComponentProps<"div"> & {
  filters?: ReactNode;
  search?: ReactNode;
  leading?: ReactNode;
  filterCount?: number;
  searchActive?: boolean;
  filterChips?: Array<{ label: string; onRemove: () => void }>;
  onResetFilters?: () => void;
};

export const appFilterSearchLayoutClassName =
  "w-full min-w-0";

export function AppFilterActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-app-filter-actions=""
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:max-w-none lg:flex-[1_1_34rem]",
        className,
      )}
      {...props}
    />
  );
}

export function AppFilterToolbar({
  className,
  children,
  filters,
  search,
  leading,
  filterCount = 0,
  searchActive = false,
  filterChips = [],
  onResetFilters,
  ...props
}: AppFilterToolbarProps) {
  const t = useTranslations("common.listControls");
  const [panel, setPanel] = useState<"search" | "filters" | null>(null);
  const changePanel = (kind: "search" | "filters", open: boolean) =>
    setPanel((previous) => (open ? kind : previous === kind ? null : previous));
  const popupClassName =
    "flex w-80 max-w-[calc(100vw-2rem)] max-h-[min(36rem,var(--available-height))] flex-col gap-4 overflow-y-auto p-4 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:h-10! [&_[data-slot=input]]:h-10";
  return (
    <div
      data-app-filter-toolbar=""
      className={cn(
        "flex w-full min-w-0 flex-wrap items-center justify-end gap-2 [&>[data-slot=button]]:h-10",
        className,
      )}
      {...props}
    >
      {leading ? <div className="mr-auto min-w-0">{leading}</div> : null}
      {search ? (
        <AppPopover
          open={panel === "search"}
          onOpenChange={(open) => changePanel("search", open)}
        >
          <AppPopoverTrigger asChild>
            <AppButton
              type="button"
              variant="surface"
              size="md"
              aria-label={t("search")}
              className={cn(
                "h-10",
                searchActive && "border-data-accent/40 bg-data-accent/15",
              )}
            >
              <Search className="size-4" aria-hidden="true" />
              {t("search")}
              {searchActive && (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-data-accent"
                />
              )}
            </AppButton>
          </AppPopoverTrigger>
          <AppPopoverContent
            align="end"
            aria-label={t("search")}
            className={popupClassName}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("search")}</span>
            </div>
            {search}
          </AppPopoverContent>
        </AppPopover>
      ) : null}
      {filters ? (
        <AppPopover
          open={panel === "filters"}
          onOpenChange={(open) => changePanel("filters", open)}
        >
          <AppPopoverTrigger asChild>
            <AppButton
              type="button"
              variant="surface"
              size="md"
              aria-label={t("filters")}
              className={cn(
                "h-10",
                filterCount > 0 && "border-data-accent/40 bg-data-accent/15",
              )}
            >
              <ListFilter className="size-4" aria-hidden="true" />
              {t("filters")}
              {filterCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-data-accent/20 text-xs">
                  {filterCount}
                </span>
              )}
            </AppButton>
          </AppPopoverTrigger>
          <AppPopoverContent
            align="end"
            aria-label={t("filters")}
            className={popupClassName}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("filters")}</span>
              {onResetFilters && (
                <AppButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!filterCount}
                  onClick={onResetFilters}
                >
                  {t("resetFilters")}
                </AppButton>
              )}
            </div>
            {filters}
          </AppPopoverContent>
        </AppPopover>
      ) : null}
      {children}
      {(filterChips.length > 0) && <div className="flex w-full min-w-0 flex-wrap justify-end gap-2" aria-label={t("activeConditions")}>
        {filterChips.map((chip, index) => <AppButton key={index} type="button" size="sm" variant="surface" onClick={chip.onRemove} aria-label={t("removeCondition", { label: chip.label })} title={chip.label} className="max-w-full"><span className="max-w-48 truncate">{chip.label}</span><X className="size-3 shrink-0" /></AppButton>)}
      </div>}
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

export function AppFilterSection({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
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
      className={cn(
        active &&
          "border-data-accent/40 bg-data-accent/15 text-data-accent-foreground hover:bg-data-accent/25 hover:text-data-accent-foreground dark:border-data-accent/40 dark:bg-data-accent/15 dark:hover:bg-data-accent/25",
        className,
      )}
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
  onClear?: () => void;
};

export const appSearchFieldSurfaceClassName = cn(
  appInputShellClassName,
  "flex w-full min-w-0 items-center gap-2 px-2 focus-within:border-primary",
);

export function AppSearchField({
  className,
  containerClassName,
  trailing, onClear, value, defaultValue, onChange,
  ...props
}: AppSearchFieldProps) {
  const t = useTranslations("common.listControls");
  const input = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = value ?? internalValue;
  const canClear = Boolean(String(currentValue)) && !props.disabled && !props.readOnly && (value === undefined || !!onClear);
  return (
    <span
      data-app-search-field=""
      className={cn("relative block h-10 w-full min-w-0 shrink-0", containerClassName)}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-app-search-input=""
        type="search"
        ref={input}
        value={currentValue}
        onChange={event => { setInternalValue(event.target.value); onChange?.(event); }}
        className={cn("pl-9 [&::-webkit-search-cancel-button]:appearance-none", (canClear || trailing) && "pr-11", canClear && trailing && "pr-20", className)}
        {...props}
      />
      {(canClear || trailing) && <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {canClear && <AppButton type="button" size="icon-sm" variant="ghost" aria-label={t("clearInput")} className="text-muted-foreground hover:text-foreground" onClick={() => { setInternalValue(""); onClear?.(); input.current?.focus({ preventScroll: true }); }}><X className="size-4" /></AppButton>}
        {trailing}
      </span>}
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
        className={cn(
          "data-[size=default]:h-10 w-[12rem] flex-none",
          className,
        )}
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
