import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { ProductPageIntro } from "@/shared/ui/brand/product-page-intro/product-page-intro";
import { AppButton } from "@/shared/ui/app-button";
import { AppSearchField } from "@/shared/ui/app-filter-toolbar";

interface PageHeaderProps {
  title: string;
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
  void stickyOffset;
  return (
    <div
      data-app-page-header=""
      className={cn(
        "mx-auto w-full max-w-[72rem] py-6",
        sticky && "relative",
        className,
      )}
    >
      <ProductPageIntro
        eyebrow={null}
        className="[&>div>p:first-child]:hidden [&_h1]:mt-0"
        title={title}
        description={subtitle}
        aside={
          rightSlot ? (
            <div className={rightSlotClassName}>{rightSlot}</div>
          ) : undefined
        }
      />
      {children ? <div className="mt-6">{children}</div> : null}
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
    <AppSearchField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={resolvedPlaceholder}
      containerClassName={cn("w-full", className)}
      className={inputClassName}
      trailing={
        showFilterButton ? (
          <AppButton
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onFilterClick}
            className="text-gray-500 hover:bg-white/5 hover:text-primary"
            aria-label={resolvedFilterButtonLabel}
          >
            <SlidersHorizontal className="h-5 w-5" />
          </AppButton>
        ) : null
      }
    />
  );
}
