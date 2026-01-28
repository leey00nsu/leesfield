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
    const records = await prisma.imageGeneration.findMany({
      where: buildImageWhere(filters, {
        includeDate: true,
        includeStatus: true,
        includeQuery: true,
      }),
      orderBy,
      take: limit,
      select,
    });

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

    return { updatedAt: new Date().toISOString(), items };
  }

  if (query.type === "video") {
    const records = await prisma.videoGeneration.findMany({
      where: buildVideoWhere(filters, {
        includeDate: true,
        includeStatus: true,
        includeQuery: true,
      }),
      orderBy,
      take: limit,
      select,
    });

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

    return { updatedAt: new Date().toISOString(), items };
  }

  const [imageRecords, videoRecords] = await Promise.all([
    prisma.imageGeneration.findMany({
      where: buildImageWhere(filters, {
        includeDate: true,
        includeStatus: true,
        includeQuery: true,
      }),
      orderBy,
      take: limit,
      select,
    }),
    prisma.videoGeneration.findMany({
      where: buildVideoWhere(filters, {
        includeDate: true,
        includeStatus: true,
        includeQuery: true,
      }),
      orderBy,
      take: limit,
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
    items: items.slice(0, limit),
  };
}
