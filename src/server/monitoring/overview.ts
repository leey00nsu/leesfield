import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import {
  buildAudioWhere,
  buildImageWhere,
  buildVideoWhere,
} from "@/server/monitoring/monitoring-where";
import {
  ACTIVE_STATUSES,
  FINISHED_STATUSES,
  buildMonitoringBaseSelect,
  buildAssistantBaseSelect,
  buildRawWhere,
} from "@/server/monitoring/monitoring-sql";
import { measureDatabase } from "@/server/observability/request-observability";

export type MonitoringOverview = {
  activeCount: number;
  totalCount: number;
  failedCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  usageByType: {
    image: number;
    video: number;
    audio: number;
    other: number;
    assistant?: number;
  };
};

type MetricRow = {
  total: number | bigint;
  failed: number | bigint;
  avg_ms: number | null;
  p95_ms: number | null;
};

type UsageRow = {
  type: "image" | "video" | "audio" | "assistant" | "other";
  total: number | bigint;
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
    ownerEmail: query.ownerEmail,
    statuses: ACTIVE_STATUSES,
    model: query.model,
    apiKey: query.apiKey,
  };

  const assistantCount=async()=>{if(!query.includeAssistant)return 0;const rows=await prisma.$queryRaw<{count:number}[]>(Prisma.sql`SELECT count(*)::int AS count FROM (${buildAssistantBaseSelect(buildRawWhere(baseFilters,{includeStatus:true}))}) a`);return rows[0]?.count??0;};
  if(query.type==="assistant")return assistantCount();
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

  if (query.type === "audio") {
    return prisma.audioGeneration.count({
      where: buildAudioWhere(baseFilters, { includeStatus: true }),
    });
  }

  const [imageCount, videoCount, audioCount,assistant] = await Promise.all([
    prisma.imageGeneration.count({
      where: buildImageWhere(baseFilters, { includeStatus: true }),
    }),
    prisma.videoGeneration.count({
      where: buildVideoWhere(baseFilters, { includeStatus: true }),
    }),
    prisma.audioGeneration.count({
      where: buildAudioWhere(baseFilters, { includeStatus: true }),
    }),
    assistantCount(),
  ]);

  return imageCount + videoCount + audioCount + assistant;
}

async function getMetrics(query: MonitoringQuery) {
  const filters = {
    ownerEmail: query.ownerEmail,
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
  };

  const includeStatus = true;
  const where = buildRawWhere(filters, { includeDate: true, includeStatus });

  const baseQuery = buildMonitoringBaseSelect(query,where);

  const rows = await prisma.$queryRaw<MetricRow[]>`
    SELECT
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
  `;

  return rows[0];
}

function buildUsageSelect(
  table: "ImageGeneration" | "VideoGeneration" | "AudioGeneration",
  type: "image" | "video" | "audio",
  where: Prisma.Sql,
) {
  const tableName = Prisma.raw(`"${table}"`);
  return Prisma.sql`
    SELECT ${type}::text as "type"
    FROM ${tableName}
    ${where}
  `;
}

async function getUsageByType(query: MonitoringQuery) {
  const filters = {
    ownerEmail: query.ownerEmail,
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
  };
  const where = buildRawWhere(filters, {
    includeDate: true,
    includeStatus: true,
  });
  const imageSelect = buildUsageSelect("ImageGeneration", "image", where);
  const videoSelect = buildUsageSelect("VideoGeneration", "video", where);
  const audioSelect = buildUsageSelect("AudioGeneration", "audio", where);
  const assistantSelect=Prisma.sql`SELECT 'assistant'::text AS "type" FROM (${buildAssistantBaseSelect(where)}) a`;
  const baseQuery=query.type==="assistant"?assistantSelect:query.type==="image"?imageSelect:query.type==="video"?videoSelect:query.type==="audio"?audioSelect:Prisma.sql`${imageSelect} UNION ALL ${videoSelect} UNION ALL ${audioSelect}${query.includeAssistant?Prisma.sql` UNION ALL ${assistantSelect}`:Prisma.empty}`;

  const rows = await prisma.$queryRaw<UsageRow[]>`
    SELECT "type", COUNT(*)::int as total
    FROM (
      ${baseQuery}
    ) as base
    GROUP BY "type"
  `;

  const usageByType:MonitoringOverview["usageByType"] = {
    image: 0,
    video: 0,
    audio: 0,
    other: 0,
    ...(query.includeAssistant?{assistant:0}:{}),
  };

  for (const row of rows) {
    usageByType[row.type] = toNumber(row.total);
  }

  return usageByType;
}

async function getMonitoringOverviewUnobserved(
  query: MonitoringQuery,
): Promise<MonitoringOverview> {
  const [activeCount, metrics, usageByType] = await Promise.all([
    getActiveCount(query),
    getMetrics(query),
    getUsageByType(query),
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
    usageByType,
  };
}

export async function getMonitoringOverview(query: MonitoringQuery) {
  return measureDatabase("monitoring.overview", () =>
    getMonitoringOverviewUnobserved(query),
  );
}
