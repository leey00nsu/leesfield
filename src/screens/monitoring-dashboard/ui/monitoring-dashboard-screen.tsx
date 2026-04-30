"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  MonitoringFilters,
  type MonitoringFilterApiKey,
  type MonitoringFilterModel,
} from "@/features/monitoring-dashboard/ui/monitoring-filters";
import { MonitoringKpiCards } from "@/features/monitoring-dashboard/ui/monitoring-kpi-cards";
import { MonitoringStatsChart } from "@/features/monitoring-dashboard/ui/monitoring-stats-chart";
import { MonitoringRequestTable } from "@/features/monitoring-dashboard/ui/monitoring-request-table";
import { createRangeFromDays } from "@/features/monitoring-dashboard/lib/format";
import type {
  MonitoringFilters as MonitoringFiltersState,
  MonitoringStatusFilter,
  MonitoringType,
} from "@/features/monitoring-dashboard/model/types";
import {
  useMonitoringApiKeys,
  useMonitoringOverview,
  useMonitoringRequests,
  useMonitoringStats,
} from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";

const DEFAULT_REQUEST_LIMIT = 50;

export function MonitoringDashboardScreen() {
  const t = useTranslations("monitoringDashboard");
  const tCommonLabels = useTranslations("common.labels");

  const [type, setType] = useState<MonitoringType>("all");
  const [status, setStatus] = useState<MonitoringStatusFilter>("all");
  const [model, setModel] = useState<string | null>(null);
  const [apiKeyId, setApiKeyId] = useState<string | null>(null);
  const [range, setRange] = useState(() => createRangeFromDays(7));
  const [searchInput, setSearchInput] = useState("");
  const [requestLimit, setRequestLimit] = useState(DEFAULT_REQUEST_LIMIT);
  const [requestOffset, setRequestOffset] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const rangeFromTime = range.from.getTime();
  const rangeToTime = range.to.getTime();

  const debouncedQuery = useDebouncedValue(searchInput, 350).trim();
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );

  const filters: MonitoringFiltersState = useMemo(
    () => ({
      type,
      status,
      model,
      apiKeyId,
      query: debouncedQuery.length ? debouncedQuery : null,
      from: range.from,
      to: range.to,
      tz,
    }),
    [apiKeyId, debouncedQuery, model, range.from, range.to, status, type, tz],
  );

  const overviewQuery = useMonitoringOverview(filters);
  const statsQuery = useMonitoringStats(filters);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setRequestOffset(0);
  }, [
    type,
    status,
    model,
    apiKeyId,
    rangeFromTime,
    rangeToTime,
    debouncedQuery,
  ]);

  const requestsQuery = useMonitoringRequests(filters, {
    limit: requestLimit,
    offset: requestOffset,
  });
  const apiKeysQuery = useMonitoringApiKeys();
  const modelCatalog = useRuntimeModelCatalog();

  const models = useMemo<MonitoringFilterModel[]>(
    () =>
      modelCatalog.items
        .filter((item) => (type === "all" ? true : item.type === type))
        .map((item) => ({
          key: item.key,
          label: item.label,
          type: item.type,
        })),
    [modelCatalog.items, type],
  );

  const apiKeys = useMemo<MonitoringFilterApiKey[]>(
    () =>
      (apiKeysQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        maskedKey: item.maskedKey,
        status: item.status,
      })),
    [apiKeysQuery.data?.items],
  );

  const updatedAt = requestsQuery.data?.updatedAt ?? null;
  const requestsError = requestsQuery.error ? t("requests.error") : null;
  const stats = statsQuery.data?.items ?? [];

  return (
    <div className="overflow-x-hidden pb-20 pt-6">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 sm:px-6 lg:px-8">
        <MonitoringKpiCards
          data={overviewQuery.data ?? null}
          stats={stats}
          isLoading={overviewQuery.isLoading}
        />

        {isMounted ? (
          <MonitoringFilters
            filters={filters}
            onTypeChange={setType}
            onStatusChange={setStatus}
            onModelChange={setModel}
            onApiKeyChange={setApiKeyId}
            onRangeChange={setRange}
            onQuickRange={(days) => setRange(createRangeFromDays(days))}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder={tCommonLabels("searchPlaceholder")}
            models={models}
            apiKeys={apiKeys}
          />
        ) : (
          <div className="h-16 rounded-[1.1rem] border border-white/10 bg-white/[0.025]" />
        )}
        <div className="flex justify-end text-xs font-semibold text-white/42">
          <span>
            {t("lastUpdated")}:{" "}
            {updatedAt ? new Date(updatedAt).toLocaleString() : t("updating")}
          </span>
        </div>

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
