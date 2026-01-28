import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { buildImageWhere, buildVideoWhere } from "@/server/monitoring/monitoring-where";
import {
  ACTIVE_STATUSES,
  FINISHED_STATUSES,
  buildBaseSelect,
  buildRawWhere,
} from "@/server/monitoring/monitoring-sql";

export type MonitoringOverview = {
  activeCount: number;
  totalCount: number;
  failedCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

type MetricRow = {
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

async function getActiveCount(query: MonitoringQuery) {
  const baseFilters = {
    statuses: ACTIVE_STATUSES,
    model: query.model,
    apiKey: query.apiKey,
  };

  if (query.type === "image") {
    return prisma.imageGeneration.count({
      where: buildImageWhere(baseFilters, { includeStatus: true }),
    });
  }

  if (query.type === "video") {
    return prisma.videoGeneration.count({
      where: buildVideoWhere(baseFilters, { includeStatus: true }),
    });
  }

  const [imageCount, videoCount] = await Promise.all([
    prisma.imageGeneration.count({
      where: buildImageWhere(baseFilters, { includeStatus: true }),
    }),
    prisma.videoGeneration.count({
      where: buildVideoWhere(baseFilters, { includeStatus: true }),
    }),
  ]);

  return imageCount + videoCount;
}

async function getMetrics(query: MonitoringQuery) {
  const filters = {
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
  };

  const includeStatus = true;
  const where = buildRawWhere(filters, { includeDate: true, includeStatus });

  const imageSelect = buildBaseSelect("ImageGeneration", where);
  const videoSelect = buildBaseSelect("VideoGeneration", where);

  const baseQuery =
    query.type === "image"
      ? imageSelect
      : query.type === "video"
        ? videoSelect
        : Prisma.sql`${imageSelect} UNION ALL ${videoSelect}`;

  const rows = await prisma.$queryRaw<MetricRow[]>`
    SELECT
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
  `;

  return rows[0];
}

export async function getMonitoringOverview(
  query: MonitoringQuery,
): Promise<MonitoringOverview> {
  const [activeCount, metrics] = await Promise.all([
    getActiveCount(query),
    getMetrics(query),
  ]);

  const totalCount = metrics ? toNumber(metrics.total) : 0;
  const failedCount = metrics ? toNumber(metrics.failed) : 0;
  const avgLatencyMs = metrics?.avg_ms ?? null;
  const p95LatencyMs = metrics?.p95_ms ?? null;

  return {
    activeCount,
    totalCount,
    failedCount,
    errorRate: calcErrorRate(totalCount, failedCount),
    avgLatencyMs,
    p95LatencyMs,
  };
}
