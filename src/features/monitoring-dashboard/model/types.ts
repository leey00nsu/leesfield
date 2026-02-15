export type MonitoringType = "all" | "image" | "video";

export type MonitoringStatusFilter =
  | "all"
  | "active"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type MonitoringMetric = "requests" | "errors" | "latency";

export type MonitoringOverview = {
  activeCount: number;
  totalCount: number;
  failedCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

export type MonitoringStatsRow = {
  day: string;
  total: number;
  failed: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

export type MonitoringStatsResponse = {
  items: MonitoringStatsRow[];
};

export type MonitoringRequestItem = {
  id: string;
  type: "image" | "video";
  status: string;
  model: string | null;
  createdAt: string;
  durationMs: number | null;
  apiKeyLabel: string;
};

export type MonitoringRequestAsset = {
  url: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type MonitoringRequestDetail = {
  id: string;
  type: "image" | "video";
  status: string;
  model: string | null;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  progress: number | null;
  errorMessage: string | null;
  inputImages: string[];
  assets: MonitoringRequestAsset[];
};

export type MonitoringRequestResponse = {
  updatedAt: string;
  items: MonitoringRequestItem[];
  total: number;
  limit: number;
  offset: number;
};

export type MonitoringTopItem = {
  key: string;
  label: string;
  total: number;
  failed: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

export type MonitoringTopResponse = {
  metric: MonitoringMetric;
  limit: number;
  models: MonitoringTopItem[];
  apiKeys: MonitoringTopItem[];
};

export type MonitoringFilters = {
  type: MonitoringType;
  status: MonitoringStatusFilter;
  model: string | null;
  apiKeyId: string | null;
  query: string | null;
  from: Date;
  to: Date;
  tz: string;
};
