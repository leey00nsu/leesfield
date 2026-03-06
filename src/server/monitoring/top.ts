import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { MonitoringMetric, MonitoringQuery } from "@/server/monitoring/monitoring-query";
import {
  FINISHED_STATUSES,
  buildBaseSelect,
  buildRawWhere,
} from "@/server/monitoring/monitoring-sql";

const UI_KEY_SENTINEL = "__ui__";

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

type RawTopRow = {
  key: string;
  total: number | bigint;
  failed: number | bigint;
  avg_ms: number | null;
  p95_ms: number | null;
};

function toNumber(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

function calcErrorRate(total: number, failed: number) {
  if (total <= 0) return 0;
  return Number((failed / total).toFixed(4));
}

function resolveOrder(metric: MonitoringMetric) {
  if (metric === "latency") {
    return Prisma.sql`p95_ms`;
  }
  if (metric === "errors") {
    return Prisma.sql`failed`;
  }
  return Prisma.sql`total`;
}

async function queryTopByModel(query: MonitoringQuery, limit: number) {
  const filters = {
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
  };

  const where = buildRawWhere(filters, { includeDate: true, includeStatus: true });
  const imageSelect = buildBaseSelect("ImageGeneration", where);
  const videoSelect = buildBaseSelect("VideoGeneration", where);
  const audioSelect = buildBaseSelect("AudioGeneration", where);

  const baseQuery =
    query.type === "image"
      ? imageSelect
      : query.type === "video"
        ? videoSelect
        : query.type === "audio"
          ? audioSelect
          : Prisma.sql`${imageSelect} UNION ALL ${videoSelect} UNION ALL ${audioSelect}`;

  const orderBy = resolveOrder(query.metric);

  return prisma.$queryRaw<RawTopRow[]>`
    SELECT
      COALESCE("modelKey", 'unknown') as key,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "status" = 'failed')::int as failed,
      AVG(CASE
        WHEN "status" IN (${Prisma.join(FINISHED_STATUSES)})
        THEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000
        ELSE NULL
      END) as avg_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY CASE
          WHEN "status" IN (${Prisma.join(FINISHED_STATUSES)})
          THEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000
          ELSE NULL
        END
      ) as p95_ms
    FROM (
      ${baseQuery}
    ) as base
    GROUP BY 1
    ORDER BY ${orderBy} DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function queryTopByApiKey(query: MonitoringQuery, limit: number) {
  const filters = {
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
  };

  const where = buildRawWhere(filters, { includeDate: true, includeStatus: true });
  const imageSelect = buildBaseSelect("ImageGeneration", where);
  const videoSelect = buildBaseSelect("VideoGeneration", where);
  const audioSelect = buildBaseSelect("AudioGeneration", where);

  const baseQuery =
    query.type === "image"
      ? imageSelect
      : query.type === "video"
        ? videoSelect
        : query.type === "audio"
          ? audioSelect
          : Prisma.sql`${imageSelect} UNION ALL ${videoSelect} UNION ALL ${audioSelect}`;

  const orderBy = resolveOrder(query.metric);

  return prisma.$queryRaw<RawTopRow[]>`
    SELECT
      COALESCE("apiKeyId", ${UI_KEY_SENTINEL}) as key,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "status" = 'failed')::int as failed,
      AVG(CASE
        WHEN "status" IN (${Prisma.join(FINISHED_STATUSES)})
        THEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000
        ELSE NULL
      END) as avg_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY CASE
          WHEN "status" IN (${Prisma.join(FINISHED_STATUSES)})
          THEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000
          ELSE NULL
        END
      ) as p95_ms
    FROM (
      ${baseQuery}
    ) as base
    GROUP BY 1
    ORDER BY ${orderBy} DESC NULLS LAST
    LIMIT ${limit}
  `;
}

export async function getMonitoringTop(
  query: MonitoringQuery,
  limit: number,
): Promise<MonitoringTopResponse> {
  const [modelRows, apiKeyRows] = await Promise.all([
    queryTopByModel(query, limit),
    queryTopByApiKey(query, limit),
  ]);

  const apiKeyIds = apiKeyRows
    .map((row) => row.key)
    .filter((id) => id !== UI_KEY_SENTINEL);

  const apiKeyRecords = apiKeyIds.length
    ? await prisma.apiKey.findMany({
        where: { id: { in: apiKeyIds } },
        select: { id: true, maskedKey: true },
      })
    : [];

  const apiKeyMap = new Map(
    apiKeyRecords.map((record) => [record.id, record.maskedKey]),
  );

  const models = modelRows.map((row) => {
    const total = toNumber(row.total);
    const failed = toNumber(row.failed);
    return {
      key: row.key,
      label: row.key,
      total,
      failed,
      errorRate: calcErrorRate(total, failed),
      avgLatencyMs: row.avg_ms ?? null,
      p95LatencyMs: row.p95_ms ?? null,
    };
  });

  const apiKeys = apiKeyRows.map((row) => {
    const total = toNumber(row.total);
    const failed = toNumber(row.failed);
    const label =
      row.key === UI_KEY_SENTINEL
        ? "UI"
        : apiKeyMap.get(row.key) ?? "-";

    return {
      key: row.key === UI_KEY_SENTINEL ? "UI" : row.key,
      label,
      total,
      failed,
      errorRate: calcErrorRate(total, failed),
      avgLatencyMs: row.avg_ms ?? null,
      p95LatencyMs: row.p95_ms ?? null,
    };
  });

  return {
    metric: query.metric,
    limit,
    models,
    apiKeys,
  };
}
