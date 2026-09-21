export type MetricProvider =
  | "hf_space"
  | "modal"
  | "codex"
  | "storage"
  | "remote"
  | "unknown";

export type MetricStatus = "2xx" | "3xx" | "4xx" | "5xx" | "other";

type DurationMetric = {
  count: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

type HttpMetric = DurationMetric & {
  statuses: Record<MetricStatus, number>;
};

export type QueueMetricSnapshot = {
  pending: number;
  processing: number;
  oldestPendingAgeSeconds: number | null;
  failedCleanup: number;
};

export type DatabasePoolSnapshot = {
  total: number;
  idle: number;
  active: number;
  waiting: number;
};

const MAX_HTTP_METRICS = 64;
const MAX_DATABASE_METRICS = 16;
const MAX_PROVIDER_METRICS = 8;
const MAX_WORKER_FAILURE_METRICS = 8;
const OTHER_LABEL = "other";

const providerNames: readonly MetricProvider[] = [
  "hf_space",
  "modal",
  "codex",
  "storage",
  "remote",
  "unknown",
];

const statusNames: readonly MetricStatus[] = [
  "2xx",
  "3xx",
  "4xx",
  "5xx",
  "other",
];

function emptyDurationMetric(): DurationMetric {
  return { count: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0 };
}

function emptyHttpMetric(): HttpMetric {
  return {
    ...emptyDurationMetric(),
    statuses: Object.fromEntries(statusNames.map((status) => [status, 0])) as Record<MetricStatus, number>,
  };
}

function boundedDuration(value: number) {
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 86_400_000) : 0;
}

function statusBucket(status: number | "error"): MetricStatus {
  if (status === "error") return "5xx";
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

function boundedLabel(value: string, maxLength = 96) {
  return /^[A-Za-z0-9_./:[\]-]{1,96}$/.test(value)
    ? value.slice(0, maxLength)
    : OTHER_LABEL;
}

function getOrCreateBounded<T>(
  map: Map<string, T>,
  requestedKey: string,
  fallbackKey: string,
  maxEntries: number,
  create: () => T,
) {
  const existing = map.get(requestedKey);
  if (existing) return existing;
  const normalCapacity = fallbackKey ? Math.max(0, maxEntries - 1) : maxEntries;
  const key = map.size < normalCapacity ? requestedKey : fallbackKey;
  const fallback = map.get(key);
  if (fallback) return fallback;
  const created = create();
  map.set(key, created);
  return created;
}

function normalizeProvider(provider: MetricProvider): MetricProvider {
  return providerNames.includes(provider) ? provider : "unknown";
}

function recordDuration(
  metric: DurationMetric,
  durationMs: number,
  failed: boolean,
) {
  const duration = boundedDuration(durationMs);
  metric.count += 1;
  if (failed) metric.errors += 1;
  metric.totalDurationMs += duration;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, duration);
}

const httpMetrics = new Map<string, HttpMetric>();
const databaseMetrics = new Map<string, DurationMetric>();
const providerMetrics = new Map<string, DurationMetric>();
const workerFailureCounts = new Map<string, number>();
let queueSnapshot: QueueMetricSnapshot | null = null;

export function recordHttpRequest(input: {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}) {
  const route = boundedLabel(input.route);
  const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(input.method)
    ? input.method
    : "OTHER";
  const metric = getOrCreateBounded(
    httpMetrics,
    `${method} ${route}`,
    "OTHER",
    MAX_HTTP_METRICS,
    emptyHttpMetric,
  );
  const bucket = statusBucket(input.status);
  recordDuration(metric, input.durationMs, bucket === "4xx" || bucket === "5xx");
  metric.statuses[bucket] += 1;
}

export function recordDatabaseQuery(input: {
  operation: string;
  durationMs: number;
  success: boolean;
}) {
  const operation = boundedLabel(input.operation, 64);
  const metric = getOrCreateBounded(
    databaseMetrics,
    operation,
    OTHER_LABEL,
    MAX_DATABASE_METRICS,
    emptyDurationMetric,
  );
  recordDuration(metric, input.durationMs, !input.success);
}

export function recordProviderRequest(input: {
  provider: MetricProvider;
  status: number | "error";
  durationMs: number;
}) {
  const provider = normalizeProvider(input.provider);
  const metric = getOrCreateBounded(
    providerMetrics,
    provider,
    "unknown",
    MAX_PROVIDER_METRICS,
    emptyDurationMetric,
  );
  recordDuration(metric, input.durationMs, statusBucket(input.status) === "5xx");
}

export function recordQueueSnapshot(snapshot: QueueMetricSnapshot) {
  queueSnapshot = {
    pending: Math.max(0, Math.floor(snapshot.pending)),
    processing: Math.max(0, Math.floor(snapshot.processing)),
    oldestPendingAgeSeconds:
      snapshot.oldestPendingAgeSeconds === null
        ? null
        : Math.max(0, Math.floor(snapshot.oldestPendingAgeSeconds)),
    failedCleanup: Math.max(0, Math.floor(snapshot.failedCleanup)),
  };
}

export function recordWorkerFailure(kind: string) {
  const key = boundedLabel(kind, 64);
  const metricKey =
    workerFailureCounts.has(key) || workerFailureCounts.size < MAX_WORKER_FAILURE_METRICS
      ? key
      : OTHER_LABEL;
  workerFailureCounts.set(metricKey, (workerFailureCounts.get(metricKey) ?? 0) + 1);
}

function durationSnapshot(metric: DurationMetric) {
  return {
    count: metric.count,
    errors: metric.errors,
    totalDurationMs: Math.round(metric.totalDurationMs),
    averageDurationMs:
      metric.count > 0
        ? Math.round(metric.totalDurationMs / metric.count)
        : 0,
    maxDurationMs: Math.round(metric.maxDurationMs),
  };
}

export function getObservabilitySnapshot(
  databasePool: DatabasePoolSnapshot | null = null,
) {
  return {
    generatedAt: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    },
    http: Array.from(httpMetrics.entries()).map(([route, metric]) => ({
      route,
      ...durationSnapshot(metric),
      statuses: { ...metric.statuses },
    })),
    database: Array.from(databaseMetrics.entries()).map(([operation, metric]) => ({
      operation,
      ...durationSnapshot(metric),
    })),
    databasePool,
    providers: Array.from(providerMetrics.entries()).map(([provider, metric]) => ({
      provider,
      ...durationSnapshot(metric),
    })),
    queue: queueSnapshot,
    workerFailures: Object.fromEntries(workerFailureCounts),
  };
}

export function resetObservabilityMetrics() {
  httpMetrics.clear();
  databaseMetrics.clear();
  providerMetrics.clear();
  workerFailureCounts.clear();
  queueSnapshot = null;
}
