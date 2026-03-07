export type MonitoringType = "image" | "video" | "audio" | "all";
export type MonitoringStatus = "pending" | "processing" | "completed" | "failed";
export type MonitoringMetric = "requests" | "errors" | "latency";

export type ApiKeyFilter =
  | { mode: "all" }
  | { mode: "ui" }
  | { mode: "id"; value: string };

export type MonitoringQuery = {
  type: MonitoringType;
  statuses: MonitoringStatus[] | null;
  model: string | null;
  apiKey: ApiKeyFilter;
  query: string | null;
  from: Date;
  to: Date;
  tz: string;
  limit: number;
  offset: number;
  metric: MonitoringMetric;
};

const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const MAX_LIMIT = 200;
const MAX_OFFSET = 10_000;
const DEFAULT_TOP_LIMIT = 5;

const TYPES = new Set<MonitoringType>(["image", "video", "audio", "all"]);
const STATUS = new Set<MonitoringStatus>([
  "pending",
  "processing",
  "completed",
  "failed",
]);
const METRICS = new Set<MonitoringMetric>([
  "requests",
  "errors",
  "latency",
]);

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveType(value: string | null): MonitoringType {
  if (!value) return "all";
  const normalized = value.toLowerCase();
  return TYPES.has(normalized as MonitoringType)
    ? (normalized as MonitoringType)
    : "all";
}

function resolveStatuses(value: string | null): MonitoringStatus[] | null {
  if (!value) return null;
  const tokens = value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  const resolved = new Set<MonitoringStatus>();
  for (const token of tokens) {
    if (token === "active") {
      resolved.add("pending");
      resolved.add("processing");
      continue;
    }
    if (STATUS.has(token as MonitoringStatus)) {
      resolved.add(token as MonitoringStatus);
    }
  }

  return resolved.size > 0 ? Array.from(resolved) : null;
}

function resolveApiKeyFilter(value: string | null): ApiKeyFilter {
  if (!value) return { mode: "all" };
  const normalized = value.trim();
  if (!normalized) return { mode: "all" };
  const lowered = normalized.toLowerCase();
  if (["ui", "-", "none", "null"].includes(lowered)) {
    return { mode: "ui" };
  }
  return { mode: "id", value: normalized };
}

function resolveTimeZone(value: string | null) {
  if (!value) return "UTC";
  const trimmed = value.trim();
  if (!trimmed) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return "UTC";
  }
}

function resolveRange(
  fromRaw: string | null,
  toRaw: string | null,
  defaultDays: number,
) {
  const fromDate = parseDate(fromRaw);
  const toDate = parseDate(toRaw);

  if (!fromDate && !toDate) {
    const to = new Date();
    const from = new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  if (fromDate && !toDate) {
    return { from: fromDate, to: new Date() };
  }

  if (!fromDate && toDate) {
    const from = new Date(toDate.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    return { from, to: toDate };
  }

  const from = fromDate as Date;
  const to = toDate as Date;

  return from.getTime() <= to.getTime() ? { from, to } : { from: to, to: from };
}

function resolveLimit(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, 1, MAX_LIMIT);
}

function resolveOffset(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, 0, MAX_OFFSET);
}

function resolveMetric(value: string | null) {
  if (!value) return "requests";
  const normalized = value.toLowerCase();
  return METRICS.has(normalized as MonitoringMetric)
    ? (normalized as MonitoringMetric)
    : "requests";
}

export function parseMonitoringQuery(
  searchParams: URLSearchParams,
  options?: {
    defaultLimit?: number;
    defaultOffset?: number;
    defaultDays?: number;
    defaultMetric?: MonitoringMetric;
  },
): MonitoringQuery {
  const type = resolveType(searchParams.get("type"));
  const statuses = resolveStatuses(searchParams.get("status"));
  const model = searchParams.get("model")?.trim() || null;
  const apiKey = resolveApiKeyFilter(searchParams.get("apiKeyId"));
  const query =
    searchParams.get("query")?.trim() || searchParams.get("q")?.trim() || null;
  const tz = resolveTimeZone(searchParams.get("tz"));

  const { from, to } = resolveRange(
    searchParams.get("from"),
    searchParams.get("to"),
    options?.defaultDays ?? DEFAULT_DAYS,
  );

  const limit = resolveLimit(
    searchParams.get("limit"),
    options?.defaultLimit ?? DEFAULT_LIMIT,
  );
  const offset = resolveOffset(
    searchParams.get("offset"),
    options?.defaultOffset ?? DEFAULT_OFFSET,
  );

  const rawMetric = searchParams.get("metric");
  const metric = rawMetric
    ? resolveMetric(rawMetric)
    : options?.defaultMetric ?? "requests";

  return {
    type,
    statuses,
    model,
    apiKey,
    query,
    from,
    to,
    tz,
    limit,
    offset,
    metric,
  };
}

export function parseTopLimit(searchParams: URLSearchParams) {
  return resolveLimit(searchParams.get("limit"), DEFAULT_TOP_LIMIT);
}
