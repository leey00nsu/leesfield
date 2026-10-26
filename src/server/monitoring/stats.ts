import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import {
  FINISHED_STATUSES,
  buildMonitoringBaseSelect,
  buildRawWhere,
} from "@/server/monitoring/monitoring-sql";
import { measureDatabase } from "@/server/observability/request-observability";

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

async function getMonitoringStatsUnobserved(
  query: MonitoringQuery,
): Promise<MonitoringStatsRow[]> {
  const filters = {
    ownerEmail: query.ownerEmail,
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
  };

  const where = buildRawWhere(filters, { includeDate: true, includeStatus: true });
  const baseQuery = buildMonitoringBaseSelect(query,where);

  const rows = await prisma.$queryRaw<RawStatsRow[]>`
    SELECT
      TO_CHAR(DATE_TRUNC('day', "createdAt" AT TIME ZONE ${query.tz}), 'YYYY-MM-DD') as day,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "status" = 'failed')::int as failed,
      AVG(CASE
        WHEN "status" IN (${Prisma.join(FINISHED_STATUSES)})
        THEN EXTRACT(EPOCH FROM ("finishedAt" - "createdAt")) * 1000
        ELSE NULL
      END)::double precision as avg_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY CASE
          WHEN "status" IN (${Prisma.join(FINISHED_STATUSES)})
          THEN EXTRACT(EPOCH FROM ("finishedAt" - "createdAt")) * 1000
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

export async function getMonitoringStats(query: MonitoringQuery) {
  return measureDatabase("monitoring.stats", () =>
    getMonitoringStatsUnobserved(query),
  );
}
