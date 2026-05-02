import { KeyRound, Plus, ShieldCheck, Slash } from "lucide-react";
import type { ApiKeyStatusFilter } from "@/features/api-key-management/hook/use-api-key-management";
import {
  DashboardFilterBar,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";
import { DashboardCtaButton } from "@/shared/ui/dashboard-cta-button";
import { AppInput } from "@/shared/ui/app-input";
import { useTranslations } from "next-intl";

type ApiKeyToolbarProps = {
  filter: ApiKeyStatusFilter;
  onFilterChange: (value: ApiKeyStatusFilter) => void;
  newKeyLabel: string;
  onNewKeyLabelChange: (value: string) => void;
  onGenerate: () => void;
  isIssuing: boolean;
};

export function ApiKeyToolbar({
  filter,
  onFilterChange,
  newKeyLabel,
  onNewKeyLabelChange,
  onGenerate,
  isIssuing,
}: ApiKeyToolbarProps) {
  const t = useTranslations("apiKey.toolbar");

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <DashboardFilterBar className="gap-2">
        <DashboardFilterToggle
          onClick={() => onFilterChange("all")}
          aria-pressed={filter === "all"}
          active={filter === "all"}
          icon={<KeyRound className="h-4 w-4" />}
        >
          {t("allKeys")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          onClick={() => onFilterChange("active")}
          aria-pressed={filter === "active"}
          active={filter === "active"}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          {t("active")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          onClick={() => onFilterChange("revoked")}
          aria-pressed={filter === "revoked"}
          active={filter === "revoked"}
          icon={<Slash className="h-4 w-4" />}
        >
          {t("revoked")}
        </DashboardFilterToggle>
      </DashboardFilterBar>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <AppInput
          type="text"
          value={newKeyLabel}
          onChange={(event) => onNewKeyLabelChange(event.target.value)}
          placeholder={t("newKeyPlaceholder")}
          className="h-10 min-w-[220px] rounded-full border-white/10 bg-surface-dark px-4 text-xs font-mono uppercase tracking-wider text-white placeholder:text-gray-600 focus-visible:border-primary focus-visible:ring-0"
        />
        <DashboardCtaButton
          type="button"
          onClick={onGenerate}
          disabled={isIssuing}
        >
          <Plus className="h-5 w-5" />
          {isIssuing ? t("generating") : t("generate")}
        </DashboardCtaButton>
      </div>
    </div>
  );
}
