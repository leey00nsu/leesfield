import { CalendarRange, Filter, KeyRound, Layers3 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MonitoringFilters, MonitoringStatusFilter, MonitoringType } from "@/features/monitoring-dashboard/model/types";
import { createRangeFromMonth, endOfDay, formatDateInputValue, parseDateInputValue, startOfDay } from "@/features/monitoring-dashboard/lib/format";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";
import { Button } from "@/shared/ui/button";

export type MonitoringFilterModel = {
  key: string;
  label: string;
  type: "image" | "video";
};

export type MonitoringFilterApiKey = {
  id: string;
  maskedKey: string;
  status: string;
};

interface MonitoringFiltersProps {
  filters: MonitoringFilters;
  onTypeChange: (value: MonitoringType) => void;
  onStatusChange: (value: MonitoringStatusFilter) => void;
  onModelChange: (value: string | null) => void;
  onApiKeyChange: (value: string | null) => void;
  onRangeChange: (range: { from: Date; to: Date }) => void;
  onQuickRange: (days: number) => void;
  models: MonitoringFilterModel[];
  apiKeys: MonitoringFilterApiKey[];
}

export function MonitoringFilters({
  filters,
  onTypeChange,
  onStatusChange,
  onModelChange,
  onApiKeyChange,
  onRangeChange,
  onQuickRange,
  models,
  apiKeys,
}: MonitoringFiltersProps) {
  const t = useTranslations("monitoringDashboard");
  const tCommon = useTranslations("common.labels");

  const handleDateChange = (key: "from" | "to", value: string) => {
    const parsed = parseDateInputValue(value);
    if (!parsed) return;
    const normalized = key === "from" ? startOfDay(parsed) : endOfDay(parsed);
    const next = { ...filters, [key]: normalized } as MonitoringFilters;
    onRangeChange({ from: next.from, to: next.to });
  };

  const handleMonthChange = (value: string) => {
    const range = createRangeFromMonth(value);
    if (!range) return;
    onRangeChange(range);
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-surface-dark/80 p-4">
      <DashboardFilterBar className="gap-2">
        <DashboardFilterToggle
          active={filters.type === "all"}
          onClick={() => onTypeChange("all")}
        >
          {tCommon("all")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          active={filters.type === "image"}
          onClick={() => onTypeChange("image")}
        >
          {tCommon("images")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          active={filters.type === "video"}
          onClick={() => onTypeChange("video")}
        >
          {tCommon("videos")}
        </DashboardFilterToggle>
        <DashboardFilterDivider />
        <DashboardFilterToggle
          active={filters.status === "all"}
          onClick={() => onStatusChange("all")}
        >
          {t("filters.statusAll")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          active={filters.status === "active"}
          onClick={() => onStatusChange("active")}
        >
          {t("filters.statusActive")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          active={filters.status === "completed"}
          onClick={() => onStatusChange("completed")}
        >
          {t("statuses.completed")}
        </DashboardFilterToggle>
        <DashboardFilterToggle
          active={filters.status === "failed"}
          onClick={() => onStatusChange("failed")}
        >
          {t("statuses.failed")}
        </DashboardFilterToggle>
      </DashboardFilterBar>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background-dark/50 px-4 py-3">
          <Layers3 className="h-4 w-4 text-primary" />
          <select
            className="w-full bg-transparent text-sm text-white focus:outline-none"
            value={filters.model ?? ""}
            onChange={(event) =>
              onModelChange(event.target.value ? event.target.value : null)
            }
          >
            <option value="">{t("filters.modelAll")}</option>
            {models.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background-dark/50 px-4 py-3">
          <KeyRound className="h-4 w-4 text-primary" />
          <select
            className="w-full bg-transparent text-sm text-white focus:outline-none"
            value={filters.apiKeyId ?? ""}
            onChange={(event) =>
              onApiKeyChange(event.target.value ? event.target.value : null)
            }
          >
            <option value="">{t("filters.apiKeyAll")}</option>
            <option value="ui">{t("filters.apiKeyUi")}</option>
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.maskedKey}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-background-dark/50 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-500">
            <Filter className="h-4 w-4" />
            {t("filters.range")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="surface"
              className="text-xs font-bold uppercase tracking-widest"
              onClick={() => onQuickRange(7)}
            >
              7D
            </Button>
            <Button
              type="button"
              size="sm"
              variant="surface"
              className="text-xs font-bold uppercase tracking-widest"
              onClick={() => onQuickRange(30)}
            >
              30D
            </Button>
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <CalendarRange className="h-4 w-4" />
              {filters.tz}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              value={formatDateInputValue(filters.from)}
              onChange={(event) => handleDateChange("from", event.target.value)}
            />
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              value={formatDateInputValue(filters.to)}
              onChange={(event) => handleDateChange("to", event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
              {t("filters.month")}
            </span>
            <input
              type="month"
              className="h-9 rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              onChange={(event) => handleMonthChange(event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
