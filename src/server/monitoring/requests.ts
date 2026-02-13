import { prisma } from "@/server/db/prisma";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { buildImageWhere, buildVideoWhere } from "@/server/monitoring/monitoring-where";

export type MonitoringRequestItem = {
  id: string;
  type: "image" | "video";
  status: string;
  model: string | null;
  createdAt: string;
  durationMs: number | null;
  apiKeyLabel: string;
};

export type MonitoringRequestResponse = {
  updatedAt: string;
  items: MonitoringRequestItem[];
  total: number;
  limit: number;
  offset: number;
};

const FINISHED_STATUSES = new Set(["completed", "failed"]);

function resolveApiKeyLabel(maskedKey: string | null, apiKeyId: string | null) {
  if (!apiKeyId) return "UI";
  return maskedKey ?? "-";
}

function toDurationMs(createdAt: Date, updatedAt: Date, status: string) {
  if (!FINISHED_STATUSES.has(status)) return null;
  return Math.max(0, updatedAt.getTime() - createdAt.getTime());
}

export async function getMonitoringRequests(
  query: MonitoringQuery,
): Promise<MonitoringRequestResponse> {
  const filters = {
    statuses: query.statuses,
    model: query.model,
    apiKey: query.apiKey,
    from: query.from,
    to: query.to,
    query: query.query,
  };

  const limit = query.limit;
  const offset = query.offset;

  const select = {
    requestId: true,
    status: true,
    modelKey: true,
    createdAt: true,
    updatedAt: true,
    apiKeyId: true,
    apiKey: {
      select: {
        maskedKey: true,
      },
    },
  } as const;

  const orderBy = { createdAt: "desc" } as const;

  if (query.type === "image") {
    const where = buildImageWhere(filters, {
      includeDate: true,
      includeStatus: true,
      includeQuery: true,
    });
    const [total, records] = await Promise.all([
      prisma.imageGeneration.count({ where }),
      prisma.imageGeneration.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select,
      }),
    ]);

    const items = records.map((record) => ({
      id: record.requestId,
      type: "image" as const,
      status: record.status,
      model: record.modelKey ?? null,
      createdAt: record.createdAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      apiKeyLabel: resolveApiKeyLabel(
        record.apiKey?.maskedKey ?? null,
        record.apiKeyId,
      ),
    }));

    return {
      updatedAt: new Date().toISOString(),
      items,
      total,
      limit,
      offset,
    };
  }

  if (query.type === "video") {
    const where = buildVideoWhere(filters, {
      includeDate: true,
      includeStatus: true,
      includeQuery: true,
    });
    const [total, records] = await Promise.all([
      prisma.videoGeneration.count({ where }),
      prisma.videoGeneration.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select,
      }),
    ]);

    const items = records.map((record) => ({
      id: record.requestId,
      type: "video" as const,
      status: record.status,
      model: record.modelKey ?? null,
      createdAt: record.createdAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      apiKeyLabel: resolveApiKeyLabel(
        record.apiKey?.maskedKey ?? null,
        record.apiKeyId,
      ),
    }));

    return {
      updatedAt: new Date().toISOString(),
      items,
      total,
      limit,
      offset,
    };
  }

  const imageWhere = buildImageWhere(filters, {
    includeDate: true,
    includeStatus: true,
    includeQuery: true,
  });
  const videoWhere = buildVideoWhere(filters, {
    includeDate: true,
    includeStatus: true,
    includeQuery: true,
  });
  const take = limit + offset;

  const [imageTotal, videoTotal, imageRecords, videoRecords] = await Promise.all([
    prisma.imageGeneration.count({ where: imageWhere }),
    prisma.videoGeneration.count({ where: videoWhere }),
    prisma.imageGeneration.findMany({
      where: imageWhere,
      orderBy,
      take,
      select,
    }),
    prisma.videoGeneration.findMany({
      where: videoWhere,
      orderBy,
      take,
      select,
    }),
  ]);

  const items = [
    ...imageRecords.map((record) => ({
      id: record.requestId,
      type: "image" as const,
      status: record.status,
      model: record.modelKey ?? null,
      createdAt: record.createdAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      apiKeyLabel: resolveApiKeyLabel(
        record.apiKey?.maskedKey ?? null,
        record.apiKeyId,
      ),
    })),
    ...videoRecords.map((record) => ({
      id: record.requestId,
      type: "video" as const,
      status: record.status,
      model: record.modelKey ?? null,
      createdAt: record.createdAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      apiKeyLabel: resolveApiKeyLabel(
        record.apiKey?.maskedKey ?? null,
        record.apiKeyId,
      ),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    updatedAt: new Date().toISOString(),
    items: items.slice(offset, offset + limit),
    total: imageTotal + videoTotal,
    limit,
    offset,
  };
}
