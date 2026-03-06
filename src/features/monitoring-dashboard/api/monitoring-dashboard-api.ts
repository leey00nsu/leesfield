import type {
  MonitoringFilters,
  MonitoringMetric,
  MonitoringOverview,
  MonitoringRequestResponse,
  MonitoringRequestDetail,
  MonitoringStatsResponse,
  MonitoringTopResponse,
} from "@/features/monitoring-dashboard/model/types";

export type MonitoringApiKeyItem = {
  id: string;
  maskedKey: string;
  status: string;
};

export type MonitoringApiKeyResponse = {
  items: MonitoringApiKeyItem[];
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "API_REQUEST_FAILED");
  }
  return response.json() as Promise<T>;
}

function buildParams(filters: MonitoringFilters) {
  const params = new URLSearchParams();

  if (filters.type !== "all") {
    params.set("type", filters.type);
  }

  if (filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.model) {
    params.set("model", filters.model);
  }

  if (filters.apiKeyId) {
    params.set("apiKeyId", filters.apiKeyId);
  }

  if (filters.query) {
    params.set("query", filters.query);
  }

  params.set("from", filters.from.toISOString());
  params.set("to", filters.to.toISOString());
  params.set("tz", filters.tz);

  return params;
}

export async function fetchMonitoringOverview(
  filters: MonitoringFilters,
): Promise<MonitoringOverview> {
  const params = buildParams(filters);
  const response = await fetch(
    `/api/monitoring/overview?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  return handleResponse<MonitoringOverview>(response);
}

export async function fetchMonitoringStats(
  filters: MonitoringFilters,
): Promise<MonitoringStatsResponse> {
  const params = buildParams(filters);
  const response = await fetch(`/api/monitoring/stats?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return handleResponse<MonitoringStatsResponse>(response);
}

export async function fetchMonitoringRequests(
  filters: MonitoringFilters,
  limit: number,
  offset: number,
): Promise<MonitoringRequestResponse> {
  const params = buildParams(filters);
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());
  const response = await fetch(
    `/api/monitoring/requests?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  return handleResponse<MonitoringRequestResponse>(response);
}

export async function fetchMonitoringRequestDetail(
  type: "image" | "video" | "audio",
  requestId: string,
): Promise<MonitoringRequestDetail> {
  const params = new URLSearchParams({
    type,
    requestId,
  });
  const response = await fetch(
    `/api/monitoring/requests/detail?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  return handleResponse<MonitoringRequestDetail>(response);
}

export async function fetchMonitoringTop(
  filters: MonitoringFilters,
  metric: MonitoringMetric,
  limit: number,
): Promise<MonitoringTopResponse> {
  const params = buildParams(filters);
  params.set("metric", metric);
  params.set("limit", limit.toString());
  const response = await fetch(`/api/monitoring/top?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return handleResponse<MonitoringTopResponse>(response);
}

export async function fetchMonitoringApiKeys(): Promise<MonitoringApiKeyResponse> {
  const response = await fetch("/api/api-keys", {
    method: "GET",
    cache: "no-store",
  });
  return handleResponse<MonitoringApiKeyResponse>(response);
}
