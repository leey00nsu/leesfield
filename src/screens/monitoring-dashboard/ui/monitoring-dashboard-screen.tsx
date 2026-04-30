"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
  useMonitoringOverview,
  useMonitoringRequests,
  useMonitoringStats,
} from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";

const DEFAULT_REQUEST_LIMIT = 50;

export function MonitoringDashboardScreen() {
  const t = useTranslations("monitoringDashboard");

  const range = useMemo(() => createRangeFromDays(7), []);
  const [requestLimit, setRequestLimit] = useState(DEFAULT_REQUEST_LIMIT);
  const [requestOffset, setRequestOffset] = useState(0);

  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );

  const filters: MonitoringFiltersState = useMemo(
    () => ({
      type: "all" as MonitoringType,
      status: "all" as MonitoringStatusFilter,
      model: null,
      apiKeyId: null,
      query: null,
      from: range.from,
      to: range.to,
      tz,
    }),
    [range.from, range.to, tz],
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

  return (
    <div className="overflow-x-hidden pb-20 pt-4 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-4 px-4 sm:px-6 lg:px-8">
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
