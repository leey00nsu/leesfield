import { useEffect, useState } from "react";
import { CalendarRange, Filter, KeyRound, Layers3 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";
import type { MonitoringFilters, MonitoringStatusFilter, MonitoringType } from "@/features/monitoring-dashboard/model/types";
import { endOfDay, formatDateInputValue, startOfDay } from "@/features/monitoring-dashboard/lib/format";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";
import { Button } from "@/shared/ui/button";
import { Calendar } from "@/shared/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

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
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>({
    from: filters.from,
    to: filters.to,
  });

  useEffect(() => {
    setSelectedRange({ from: filters.from, to: filters.to });
  }, [filters.from, filters.to]);

  const handleRangeSelect = (range: DateRange | undefined) => {
    setSelectedRange(range);
    if (!range?.from || !range?.to) return;
    onRangeChange({ from: startOfDay(range.from), to: endOfDay(range.to) });
  };

  const rangeLabel = `${formatDateInputValue(filters.from)} ~ ${formatDateInputValue(filters.to)}`;

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
          <Select
            value={filters.model ?? "all"}
            onValueChange={(value) => onModelChange(value === "all" ? null : value)}
          >
            <SelectTrigger className="h-9 border-none bg-transparent px-0 text-sm shadow-none">
              <SelectValue placeholder={t("filters.modelAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.modelAll")}</SelectItem>
              {models.map((model) => (
                <SelectItem key={model.key} value={model.key}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background-dark/50 px-4 py-3">
          <KeyRound className="h-4 w-4 text-primary" />
          <Select
            value={filters.apiKeyId ?? "all"}
            onValueChange={(value) =>
              onApiKeyChange(value === "all" ? null : value)
            }
          >
            <SelectTrigger className="h-9 border-none bg-transparent px-0 text-sm shadow-none">
              <SelectValue placeholder={t("filters.apiKeyAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.apiKeyAll")}</SelectItem>
              <SelectItem value="ui">{t("filters.apiKeyUi")}</SelectItem>
              {apiKeys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {key.maskedKey}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <div className="md:col-span-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="surface"
                    className="h-9 w-full justify-start gap-2 text-xs text-white"
                  >
                    <CalendarRange className="h-4 w-4 text-primary" />
                    {rangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={selectedRange?.from}
                    selected={selectedRange}
                    onSelect={handleRangeSelect}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
