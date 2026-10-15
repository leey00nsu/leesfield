import type { RefObject } from "react";
import { KeyRound, Plus, ShieldCheck, Slash } from "lucide-react";
import type { ApiKeyStatusFilter } from "@/features/api-key-management/hook/use-api-key-management";
import {
  AppFilterSection,
  AppFilterToolbar,
  AppFilterGroup,
  AppFilterToggle,
  AppSearchField,
} from "@/shared/ui/app-filter-toolbar";
import { AppButton } from "@/shared/ui/app-button";
import { useTranslations } from "next-intl";

type ApiKeyToolbarProps = {
  filter: ApiKeyStatusFilter;
  onFilterChange: (value: ApiKeyStatusFilter) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPlaceholder: string;
  onGenerate: () => void;
  generateButtonRef?: RefObject<HTMLButtonElement | null>;
};

export function ApiKeyToolbar({
  filter,
  onFilterChange,
  searchInput,
  onSearchInputChange,
  searchPlaceholder,
  onGenerate,
  generateButtonRef,
}: ApiKeyToolbarProps) {
  const tListControls = useTranslations("common.listControls");
  const t = useTranslations("apiKey.toolbar");

  return (
    <AppFilterToolbar
      filters={
        <AppFilterSection label={tListControls("status")}>
          <AppFilterGroup>
            <AppFilterToggle
              onClick={() => onFilterChange("all")}
              aria-pressed={filter === "all"}
              active={filter === "all"}
              icon={<KeyRound className="h-4 w-4" />}
            >
              {t("allKeys")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => onFilterChange("active")}
              aria-pressed={filter === "active"}
              active={filter === "active"}
              icon={<ShieldCheck className="h-4 w-4" />}
            >
              {t("active")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => onFilterChange("revoked")}
              aria-pressed={filter === "revoked"}
              active={filter === "revoked"}
              icon={<Slash className="h-4 w-4" />}
            >
              {t("revoked")}
            </AppFilterToggle>
          </AppFilterGroup>
        </AppFilterSection>
      }
      search={
        <AppSearchField
          autoFocus
          value={searchInput}
          onClear={() => onSearchInputChange("")}
            onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          containerClassName="lg:max-w-md lg:flex-[1_1_20rem]"
        />
      }
      filterCount={Number(filter !== "all")}
      searchActive={Boolean(searchInput.trim())}
      filterChips={filter !== "all" ? [{label: t(filter), onRemove: () => onFilterChange("all")}] : []}
      onResetFilters={() => onFilterChange("all")}
    >
      <AppButton
        variant="brand"
        ref={generateButtonRef}
        type="button"
        onClick={onGenerate}
        size="toolbar"
        className="font-semibold"
      >
        <Plus className="h-5 w-5" />
        {t("generate")}
      </AppButton>
    </AppFilterToolbar>
  );
}
