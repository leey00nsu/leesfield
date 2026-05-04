import { KeyRound, Plus, ShieldCheck, Slash } from "lucide-react";
import type { ApiKeyStatusFilter } from "@/features/api-key-management/hook/use-api-key-management";
import {
  AppFilterGroup,
  AppFilterToggle,
  AppSearchField,
} from "@/shared/ui/app-filter-toolbar";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { useTranslations } from "next-intl";

type ApiKeyToolbarProps = {
  filter: ApiKeyStatusFilter;
  onFilterChange: (value: ApiKeyStatusFilter) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPlaceholder: string;
  newKeyLabel: string;
  onNewKeyLabelChange: (value: string) => void;
  onGenerate: () => void;
  isIssuing: boolean;
};

export function ApiKeyToolbar({
  filter,
  onFilterChange,
  searchInput,
  onSearchInputChange,
  searchPlaceholder,
  newKeyLabel,
  onNewKeyLabelChange,
  onGenerate,
  isIssuing,
}: ApiKeyToolbarProps) {
  const t = useTranslations("apiKey.toolbar");

  return (
    <>
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
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <AppSearchField
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          containerClassName="lg:max-w-md lg:flex-[1_1_20rem]"
        />
        <AppInput
          type="text"
          value={newKeyLabel}
          onChange={(event) => onNewKeyLabelChange(event.target.value)}
          placeholder={t("newKeyPlaceholder")}
          className="h-14 min-w-0 rounded-[1.5rem] border-white/10 bg-black/45 px-5 font-mono text-sm text-white placeholder:text-white/38 focus-visible:ring-0 lg:w-64"
        />
        <AppButton
          type="button"
          onClick={onGenerate}
          disabled={isIssuing}
          size="lg"
          className="h-14 rounded-[1.5rem] px-6 font-semibold text-black hover:bg-primary hover:text-black"
        >
          <Plus className="h-5 w-5" />
          {isIssuing ? t("generating") : t("generate")}
        </AppButton>
      </div>
    </>
  );
}
