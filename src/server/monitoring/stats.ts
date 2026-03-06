import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import {
  FINISHED_STATUSES,
  buildBaseSelect,
  buildRawWhere,
} from "@/server/monitoring/monitoring-sql";

export type MonitoringStatsRow = {
  day: string;
  total: number;
  failed: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

type RawStatsRow = {
  day: string;
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

export async function getMonitoringStats(
  query: MonitoringQuery,
): Promise<MonitoringStatsRow[]> {
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

  const rows = await prisma.$queryRaw<RawStatsRow[]>`
    SELECT
      TO_CHAR(DATE_TRUNC('day', "createdAt" AT TIME ZONE ${query.tz}), 'YYYY-MM-DD') as day,
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
    GROUP BY day
    ORDER BY day ASC
  `;

  return rows.map((row) => {
    const total = toNumber(row.total);
    const failed = toNumber(row.failed);
    return {
      day: row.day,
      total,
      failed,
      errorRate: calcErrorRate(total, failed),
      avgLatencyMs: row.avg_ms ?? null,
      p95LatencyMs: row.p95_ms ?? null,
    };
  });
}
