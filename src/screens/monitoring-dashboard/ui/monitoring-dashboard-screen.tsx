"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MonitoringKpiCards } from "@/features/monitoring-dashboard/ui/monitoring-kpi-cards";
import { MonitoringStatsChart } from "@/features/monitoring-dashboard/ui/monitoring-stats-chart";
import { MonitoringRequestTable } from "@/features/monitoring-dashboard/ui/monitoring-request-table";
import {
  createRangeFromDays,
  endOfDay,
  formatDateInputValue,
  parseDateInputValue,
  startOfDay,
} from "@/features/monitoring-dashboard/lib/format";
import type {
  MonitoringFilters as MonitoringFiltersState,
  MonitoringStatusFilter,
  MonitoringType,
} from "@/features/monitoring-dashboard/model/types";
import {
  useMonitoringOverview,
  useMonitoringApiKeys,
  useMonitoringRequests,
  useMonitoringStats,
} from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  AppFilterGroup,
  AppFilterToggle,
  AppFilterToolbar,
} from "@/shared/ui/app-filter-toolbar";
import { AppInput } from "@/shared/ui/app-input";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";

const DEFAULT_REQUEST_LIMIT = 50;
const statusFilters: MonitoringStatusFilter[] = [
  "all",
  "active",
  "pending",
  "processing",
  "completed",
  "failed",
];

export function MonitoringDashboardScreen() {
  const t = useTranslations("monitoringDashboard");
  const tCommonLabels = useTranslations("common.labels");

  const initialRange = useMemo(() => createRangeFromDays(7), []);
  const [type, setType] = useState<MonitoringType>("all");
  const [status, setStatus] = useState<MonitoringStatusFilter>("all");
  const [model, setModel] = useState<string | null>(null);
  const [apiKeyId, setApiKeyId] = useState<string | null>(null);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [requestLimit, setRequestLimit] = useState(DEFAULT_REQUEST_LIMIT);
  const [requestOffset, setRequestOffset] = useState(0);
  const runtimeCatalog = useRuntimeModelCatalog();
  const apiKeysQuery = useMonitoringApiKeys();

  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );
  const modelOptions = useMemo(
    () =>
      runtimeCatalog.items
        .filter((item) => item.isActive)
        .map((item) => ({
          key: item.key,
          label: item.label,
          type: item.type,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [runtimeCatalog.items],
  );
  const apiKeyOptions = apiKeysQuery.data?.items ?? [];

  const filters: MonitoringFiltersState = useMemo(
    () => ({
      type,
      status,
      model,
      apiKeyId,
      query: null,
      from,
      to,
      tz,
    }),
    [apiKeyId, from, model, status, to, type, tz],
  );

  const overviewQuery = useMonitoringOverview(filters);
  const statsQuery = useMonitoringStats(filters);

  const requestsQuery = useMonitoringRequests(filters, {
    limit: requestLimit,
    offset: requestOffset,
  });

  const updatedAt = requestsQuery.data?.updatedAt ?? null;
  const requestsError = requestsQuery.error ? t("requests.error") : null;
  const stats = statsQuery.data?.items ?? [];
  const resetToFirstPage = () => setRequestOffset(0);
  const handleTypeChange = (nextType: MonitoringType) => {
    setType(nextType);
    resetToFirstPage();
  };
  const handleStatusChange = (nextStatus: MonitoringStatusFilter) => {
    setStatus(nextStatus);
    resetToFirstPage();
  };
  const handleModelChange = (value: string) => {
    setModel(value === "all" ? null : value);
    resetToFirstPage();
  };
  const handleApiKeyChange = (value: string) => {
    setApiKeyId(value === "all" ? null : value);
    resetToFirstPage();
  };
  const handleFromChange = (value: string) => {
    const parsed = parseDateInputValue(value);
    if (!parsed) return;
    setFrom(startOfDay(parsed));
    resetToFirstPage();
  };
  const handleToChange = (value: string) => {
    const parsed = parseDateInputValue(value);
    if (!parsed) return;
    setTo(endOfDay(parsed));
    resetToFirstPage();
  };

  return (
    <div className="overflow-x-hidden pb-20 pt-4 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-4 px-4 sm:px-6 lg:px-8">
        <AppFilterToolbar>
          <AppFilterGroup>
            {(["all", "image", "video", "audio"] as MonitoringType[]).map(
              (item) => (
                <AppFilterToggle
                  key={item}
                  active={type === item}
                  aria-pressed={type === item}
                  onClick={() => handleTypeChange(item)}
                >
                  {item === "all"
                    ? tCommonLabels("all")
                    : t(`filters.type.${item}`)}
                </AppFilterToggle>
              ),
            )}
          </AppFilterGroup>

          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]">
            <AppInput
              type="date"
              surface="toolbar"
              inputSize="lg"
              aria-label={t("filters.from")}
              value={formatDateInputValue(from)}
              onChange={(event) => handleFromChange(event.target.value)}
            />
            <AppInput
              type="date"
              surface="toolbar"
              inputSize="lg"
              aria-label={t("filters.to")}
              value={formatDateInputValue(to)}
              onChange={(event) => handleToChange(event.target.value)}
            />
            <AppSelectRoot
              value={status}
              onValueChange={(value) =>
                handleStatusChange(value as MonitoringStatusFilter)
              }
            >
              <AppSelectTrigger
                surface="toolbar"
                triggerSize="md"
                aria-label={t("filters.status")}
                className="h-14 rounded-[1.5rem]"
              >
                <AppSelectValue placeholder={t("filters.status")} />
              </AppSelectTrigger>
              <AppSelectContent className="border-white/10 bg-[#0b0d0e] text-white">
                {statusFilters.map((item) => (
                  <AppSelectItem key={item} value={item}>
                    {t(`filters.statuses.${item}`)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelectRoot>
            <AppSelectRoot
              value={model ?? "all"}
              onValueChange={handleModelChange}
            >
              <AppSelectTrigger
                surface="toolbar"
                triggerSize="md"
                aria-label={t("filters.model")}
                className="h-14 rounded-[1.5rem]"
              >
                <AppSelectValue placeholder={t("filters.model")} />
              </AppSelectTrigger>
              <AppSelectContent className="border-white/10 bg-[#0b0d0e] text-white">
                <AppSelectItem value="all">
                  {t("filters.allModels")}
                </AppSelectItem>
                {modelOptions.map((item) => (
                  <AppSelectItem key={item.key} value={item.key}>
                    {item.label} · {t(`filters.type.${item.type}`)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelectRoot>
            <AppSelectRoot
              value={apiKeyId ?? "all"}
              onValueChange={handleApiKeyChange}
            >
              <AppSelectTrigger
                surface="toolbar"
                triggerSize="md"
                aria-label={t("filters.apiKey")}
                className="h-14 rounded-[1.5rem]"
              >
                <AppSelectValue placeholder={t("filters.apiKey")} />
              </AppSelectTrigger>
              <AppSelectContent className="border-white/10 bg-[#0b0d0e] text-white">
                <AppSelectItem value="all">
                  {t("filters.allApiKeys")}
                </AppSelectItem>
                <AppSelectItem value="ui">
                  {t("filters.uiRequests")}
                </AppSelectItem>
                {apiKeyOptions.map((item) => (
                  <AppSelectItem key={item.id} value={item.id}>
                    {item.maskedKey}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelectRoot>
          </div>
        </AppFilterToolbar>

        <MonitoringKpiCards
          data={overviewQuery.data ?? null}
          stats={stats}
          isLoading={overviewQuery.isLoading}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.75fr)]">
          <MonitoringRequestTable
            items={requestsQuery.data?.items ?? []}
            total={requestsQuery.data?.total ?? 0}
            limit={requestsQuery.data?.limit ?? requestLimit}
            offset={requestsQuery.data?.offset ?? requestOffset}
            onLimitChange={(nextLimit) => {
              setRequestLimit(nextLimit);
              setRequestOffset(0);
            }}
            onOffsetChange={setRequestOffset}
            isLoading={requestsQuery.isLoading}
            error={requestsError}
            updatedAt={updatedAt}
            timeZone={filters.tz}
          />
          <MonitoringStatsChart data={stats} isLoading={statsQuery.isLoading} />
        </div>
      </div>
    </div>
  );
}
