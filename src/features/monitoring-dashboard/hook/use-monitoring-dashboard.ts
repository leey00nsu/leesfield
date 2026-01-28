import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  MonitoringFilters,
  MonitoringMetric,
} from "@/features/monitoring-dashboard/model/types";
import {
  fetchMonitoringApiKeys,
  fetchMonitoringOverview,
  fetchMonitoringRequests,
  fetchMonitoringRequestDetail,
  fetchMonitoringStats,
  fetchMonitoringTop,
} from "@/features/monitoring-dashboard/api/monitoring-dashboard-api";

const POLL_INTERVAL_MS = 4000;

function buildFilterKey(filters: MonitoringFilters) {
  return [
    filters.type,
    filters.status,
    filters.model ?? "",
    filters.apiKeyId ?? "",
    filters.query ?? "",
    filters.from.toISOString(),
    filters.to.toISOString(),
    filters.tz,
  ];
}

export function useMonitoringOverview(filters: MonitoringFilters) {
  const key = useMemo(() => buildFilterKey(filters), [filters]);
  return useQuery({
    queryKey: ["monitoring", "overview", ...key],
    queryFn: () => fetchMonitoringOverview(filters),
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMonitoringStats(filters: MonitoringFilters) {
  const key = useMemo(() => buildFilterKey(filters), [filters]);
  return useQuery({
    queryKey: ["monitoring", "stats", ...key],
    queryFn: () => fetchMonitoringStats(filters),
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

export function useMonitoringRequests(filters: MonitoringFilters, limit: number) {
  const key = useMemo(() => buildFilterKey(filters), [filters]);
  return useQuery({
    queryKey: ["monitoring", "requests", limit, ...key],
    queryFn: () => fetchMonitoringRequests(filters, limit),
    staleTime: 3_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMonitoringRequestDetail(
  type: "image" | "video" | null,
  requestId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["monitoring", "request-detail", type, requestId],
    queryFn: () => fetchMonitoringRequestDetail(type!, requestId!),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled,
  });
}

export function useMonitoringTop(
  filters: MonitoringFilters,
  metric: MonitoringMetric,
  limit: number,
) {
  const key = useMemo(() => buildFilterKey(filters), [filters]);
  return useQuery({
    queryKey: ["monitoring", "top", metric, limit, ...key],
    queryFn: () => fetchMonitoringTop(filters, metric, limit),
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

export function useMonitoringApiKeys() {
  return useQuery({
    queryKey: ["monitoring", "api-keys"],
    queryFn: () => fetchMonitoringApiKeys(),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}
