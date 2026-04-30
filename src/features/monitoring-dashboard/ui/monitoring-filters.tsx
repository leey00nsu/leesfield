import { useMemo, useState } from "react";
import {
  AudioLines,
  CalendarRange,
  Filter,
  Grid2X2,
  ImageIcon,
  KeyRound,
  Layers3,
  Video,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale as DateFnsLocale } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { ko } from "date-fns/locale/ko";
import type { DateRange } from "react-day-picker";
import type {
  MonitoringFilters as MonitoringFiltersType,
  MonitoringStatusFilter,
  MonitoringType,
} from "@/features/monitoring-dashboard/model/types";
import { createRangeFromDays, endOfDay, formatDateInputValue, startOfDay } from "@/features/monitoring-dashboard/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppFilterGroup,
  AppFilterToggle,
  AppFilterToolbar,
  AppSearchField,
} from "@/shared/ui/app-filter-toolbar";
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
  type: "image" | "video" | "audio";
};

export type MonitoringFilterApiKey = {
  id: string;
  maskedKey: string;
  status: string;
};

interface MonitoringFiltersProps {
  filters: MonitoringFiltersType;
  onTypeChange: (value: MonitoringType) => void;
  onStatusChange: (value: MonitoringStatusFilter) => void;
  onModelChange: (value: string | null) => void;
  onApiKeyChange: (value: string | null) => void;
  onRangeChange: (range: { from: Date; to: Date }) => void;
  onQuickRange: (days: number) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
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
  searchValue,
  onSearchChange,
  searchPlaceholder,
  models,
  apiKeys,
}: MonitoringFiltersProps) {
  const t = useTranslations("monitoringDashboard");
  const tCommon = useTranslations("common.labels");
  const locale = useLocale();
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>({
    from: filters.from,
    to: filters.to,
  });
  const [isRangeDirty, setIsRangeDirty] = useState(false);

  const calendarLocale = useMemo<DateFnsLocale>(() => {
    if (locale.startsWith("ko")) return ko;
    return enUS;
  }, [locale]);

  const timeZoneLabel = useMemo(() => {
    try {
      const formatter = new Intl.DateTimeFormat(locale, {
        timeZone: filters.tz,
        timeZoneName: "short",
      });
      const parts = formatter.formatToParts(new Date());
      return (
        parts.find((part) => part.type === "timeZoneName")?.value ?? filters.tz
      );
    } catch {
      return filters.tz;
    }
  }, [filters.tz, locale]);

  const syncedRange = useMemo<DateRange>(
    () => ({ from: filters.from, to: filters.to }),
    [filters.from, filters.to],
  );
  const displayRange = isRangeDirty && selectedRange ? selectedRange : syncedRange;

  const handleRangeSelect = (range: DateRange | undefined) => {
    setSelectedRange(range);
    if (!range?.from) {
      setIsRangeDirty(false);
      return;
    }
    if (!range.to) {
      setIsRangeDirty(true);
      return;
    }
    setIsRangeDirty(false);
    onRangeChange({ from: startOfDay(range.from), to: endOfDay(range.to) });
  };

  const handleQuickRange = (days: number) => {
    const range = createRangeFromDays(days);
    setSelectedRange(range);
    setIsRangeDirty(false);
    onQuickRange(days);
  };

  const rangeLabel = `${formatDateInputValue(filters.from)} ~ ${formatDateInputValue(filters.to)}`;

  return (
    <AppFilterToolbar className="items-stretch rounded-[1.1rem]">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <AppFilterGroup>
          <AppFilterToggle
            active={filters.type === "all"}
            icon={<Grid2X2 className="h-4 w-4" />}
            onClick={() => onTypeChange("all")}
          >
            {tCommon("all")}
          </AppFilterToggle>
          <AppFilterToggle
            active={filters.type === "image"}
            icon={<ImageIcon className="h-4 w-4" />}
            onClick={() => onTypeChange("image")}
          >
            {tCommon("images")}
          </AppFilterToggle>
          <AppFilterToggle
            active={filters.type === "video"}
            icon={<Video className="h-4 w-4" />}
            onClick={() => onTypeChange("video")}
          >
            {tCommon("videos")}
          </AppFilterToggle>
          <AppFilterToggle
            active={filters.type === "audio"}
            icon={<AudioLines className="h-4 w-4" />}
            onClick={() => onTypeChange("audio")}
          >
            {tCommon("audios")}
          </AppFilterToggle>
          <span className="mx-1 h-8 w-px bg-white/10" aria-hidden="true" />
          <AppFilterToggle
            active={filters.status === "all"}
            onClick={() => onStatusChange("all")}
          >
            {t("filters.statusAll")}
          </AppFilterToggle>
          <AppFilterToggle
            active={filters.status === "active"}
            onClick={() => onStatusChange("active")}
          >
            {t("filters.statusActive")}
          </AppFilterToggle>
          <AppFilterToggle
            active={filters.status === "completed"}
            onClick={() => onStatusChange("completed")}
          >
            {t("statuses.completed")}
          </AppFilterToggle>
          <AppFilterToggle
            active={filters.status === "failed"}
            onClick={() => onStatusChange("failed")}
          >
            {t("statuses.failed")}
          </AppFilterToggle>
        </AppFilterGroup>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.15fr)]">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background-dark/50 px-4 py-3">
            <Layers3 className="h-4 w-4 text-primary" />
            <Select
              value={filters.model ?? "all"}
              onValueChange={(value) =>
                onModelChange(value === "all" ? null : value)
              }
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
              <AppButton
                type="button"
                size="sm"
                variant="surface"
                className="text-xs font-bold uppercase tracking-widest"
                onClick={() => handleQuickRange(7)}
              >
                7D
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                variant="surface"
                className="text-xs font-bold uppercase tracking-widest"
                onClick={() => handleQuickRange(30)}
              >
                30D
              </AppButton>
              <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                <CalendarRange className="h-4 w-4" />
                <span title={filters.tz}>{timeZoneLabel}</span>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="md:col-span-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <AppButton
                      type="button"
                      variant="surface"
                      className="h-9 w-full justify-start gap-2 text-xs text-white"
                    >
                      <CalendarRange className="h-4 w-4 text-primary" />
                      {rangeLabel}
                    </AppButton>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={displayRange?.from}
                      selected={displayRange}
                      onSelect={handleRangeSelect}
                      numberOfMonths={2}
                      locale={calendarLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AppSearchField
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        containerClassName="lg:max-w-[28rem]"
      />
    </AppFilterToolbar>
  );
}
