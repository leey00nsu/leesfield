import type { ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: string;
  rightSlot?: ReactNode;
  rightSlotClassName?: string;
  className?: string;
  sticky?: boolean;
  stickyOffset?: string;
  children?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  rightSlot,
  rightSlotClassName,
  className,
  sticky = true,
  stickyOffset = "var(--dashboard-header-height, 0px)",
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "-mx-6 -mt-6 border-b border-white/5 bg-background-dark/95 px-6 py-6 backdrop-blur-xl sm:px-10",
        sticky ? "sticky top-0 z-20" : "relative z-10",
        className,
      )}
      style={
        sticky
          ? { paddingTop: `calc(${stickyOffset} + 0.75rem)` }
          : undefined
      }
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {subtitle}
              </p>
            ) : null}
          </div>
          {rightSlot ? (
            <div className={cn("w-full md:w-96", rightSlotClassName)}>
              {rightSlot}
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

interface PageHeaderSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFilterClick?: () => void;
  filterButtonLabel?: string;
  showFilterButton?: boolean;
  className?: string;
  inputClassName?: string;
}

export function PageHeaderSearchInput({
  value,
  onChange,
  placeholder,
  onFilterClick,
  filterButtonLabel,
  showFilterButton = true,
  className,
  inputClassName,
}: PageHeaderSearchInputProps) {
  const tLabels = useTranslations("common.labels");
  const resolvedPlaceholder = placeholder ?? tLabels("searchPlaceholder");
  const resolvedFilterButtonLabel =
    filterButtonLabel ?? tLabels("filterOptions");

  return (
    <div
      className={cn(
        "group relative flex h-12 w-full items-center overflow-hidden rounded-xl border border-white/10 bg-surface-dark shadow-inner transition-all focus-within:border-primary",
        className,
      )}
    >
      <div className="flex items-center justify-center pl-4 text-gray-500">
        <Search className="h-5 w-5" />
      </div>
      <input
        type="text"
        placeholder={resolvedPlaceholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full border-none bg-transparent px-3 text-sm font-mono text-white placeholder:text-gray-600 focus:outline-none focus:ring-0",
          inputClassName,
        )}
      />
      {showFilterButton ? (
        <div className="pr-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onFilterClick}
            className="text-gray-500 hover:bg-white/5 hover:text-primary"
            aria-label={resolvedFilterButtonLabel}
          >
            <SlidersHorizontal className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
