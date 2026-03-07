import { prisma } from "@/server/db/prisma";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import {
  buildAudioWhere,
  buildImageWhere,
  buildVideoWhere,
} from "@/server/monitoring/monitoring-where";

export type MonitoringRequestItem = {
  id: string;
  type: "image" | "video" | "audio";
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
const ORDER_BY = [
  { createdAt: "desc" as const },
  { requestId: "desc" as const },
];

type RequestType = "image" | "video" | "audio";

type RequestRecordBase = {
  requestId: string;
  status: string;
  modelKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  apiKeyId: string | null;
  apiKey?: {
    maskedKey: string | null;
  } | null;
};

function resolveApiKeyLabel(maskedKey: string | null, apiKeyId: string | null) {
  if (!apiKeyId) return "UI";
  return maskedKey ?? "-";
}

function toDurationMs(createdAt: Date, updatedAt: Date, status: string) {
  if (!FINISHED_STATUSES.has(status)) return null;
  return Math.max(0, updatedAt.getTime() - createdAt.getTime());
}

function compareRecords(
  a: RequestRecordBase & { type: RequestType },
  b: RequestRecordBase & { type: RequestType },
) {
  const createdAtDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (createdAtDiff !== 0) return createdAtDiff;

  const requestIdDiff = b.requestId.localeCompare(a.requestId);
  if (requestIdDiff !== 0) return requestIdDiff;

  return b.type.localeCompare(a.type);
}

function toMonitoringRequestItem(
  record: RequestRecordBase & { type: RequestType },
): MonitoringRequestItem {
  return {
    id: record.requestId,
    type: record.type,
    status: record.status,
    model: record.modelKey ?? null,
    createdAt: record.createdAt.toISOString(),
    durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
    apiKeyLabel: resolveApiKeyLabel(record.apiKey?.maskedKey ?? null, record.apiKeyId),
  };
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
        orderBy: ORDER_BY,
        skip: offset,
        take: limit,
        select,
      }),
    ]);

    const items = records.map((record) =>
      toMonitoringRequestItem({ ...record, type: "image" }),
    );

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
        orderBy: ORDER_BY,
        skip: offset,
        take: limit,
        select,
      }),
    ]);

    const items = records.map((record) =>
      toMonitoringRequestItem({ ...record, type: "video" }),
    );

    return {
      updatedAt: new Date().toISOString(),
      items,
      total,
      limit,
      offset,
    };
  }

  if (query.type === "audio") {
    const where = buildAudioWhere(filters, {
      includeDate: true,
      includeStatus: true,
      includeQuery: true,
    });
    const [total, records] = await Promise.all([
      prisma.audioGeneration.count({ where }),
      prisma.audioGeneration.findMany({
        where,
        orderBy: ORDER_BY,
        skip: offset,
        take: limit,
        select,
      }),
    ]);

    const items = records.map((record) =>
      toMonitoringRequestItem({ ...record, type: "audio" }),
    );

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
  const audioWhere = buildAudioWhere(filters, {
    includeDate: true,
    includeStatus: true,
    includeQuery: true,
  });
  const take = limit + offset;

  const [
    imageTotal,
    videoTotal,
    audioTotal,
    imageRecords,
    videoRecords,
    audioRecords,
  ] = await Promise.all([
    prisma.imageGeneration.count({ where: imageWhere }),
    prisma.videoGeneration.count({ where: videoWhere }),
    prisma.audioGeneration.count({ where: audioWhere }),
    prisma.imageGeneration.findMany({
      where: imageWhere,
      orderBy: ORDER_BY,
      take,
      select,
    }),
    prisma.videoGeneration.findMany({
      where: videoWhere,
      orderBy: ORDER_BY,
      take,
      select,
    }),
    prisma.audioGeneration.findMany({
      where: audioWhere,
      orderBy: ORDER_BY,
      take,
      select,
    }),
  ]);

  const mergedRecords = [
    ...imageRecords.map((record) => ({
      ...record,
      type: "image" as const,
    })),
    ...videoRecords.map((record) => ({
      ...record,
      type: "video" as const,
    })),
    ...audioRecords.map((record) => ({
      ...record,
      type: "audio" as const,
    })),
  ].sort(compareRecords);

  const items = mergedRecords
    .slice(offset, offset + limit)
    .map(toMonitoringRequestItem);

  return {
    updatedAt: new Date().toISOString(),
    items,
    total: imageTotal + videoTotal + audioTotal,
    limit,
    offset,
  };
}
