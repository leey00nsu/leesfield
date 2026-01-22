import { prisma } from "@/server/db/prisma";
import {
  defaultModelKey,
  modelOptions,
} from "@/features/image-generation/model/image-models";
import {
  defaultVideoModelKey,
  videoModelOptions,
} from "@/features/video-generation/model/video-models";

export type QueueStatusItem = {
  type: "image" | "video";
  model: string;
  pending: number;
  processing: number;
};

export type QueueStatusResponse = {
  updatedAt: string;
  items: QueueStatusItem[];
};

type QueueCounts = {
  pending: number;
  processing: number;
};

function resolveImageModelKey(requestParams: unknown) {
  if (requestParams && typeof requestParams === "object") {
    const model = (requestParams as Record<string, unknown>).model;
    if (typeof model === "string" && modelOptions.includes(model)) {
      return model;
    }
  }
  return defaultModelKey;
}

function resolveVideoModelKey(requestParams: unknown) {
  if (requestParams && typeof requestParams === "object") {
    const model = (requestParams as Record<string, unknown>).model;
    if (typeof model === "string" && videoModelOptions.includes(model)) {
      return model;
    }
  }
  return defaultVideoModelKey;
}

function initCounts(keys: readonly string[]) {
  const map = new Map<string, QueueCounts>();
  for (const key of keys) {
    map.set(key, { pending: 0, processing: 0 });
  }
  return map;
}

function toItems(type: QueueStatusItem["type"], map: Map<string, QueueCounts>) {
  return Array.from(map.entries()).map(([model, counts]) => ({
    type,
    model,
    pending: counts.pending,
    processing: counts.processing,
  }));
}

export async function getQueueStatus(): Promise<QueueStatusResponse> {
  const [imageRecords, videoRecords] = await Promise.all([
    prisma.imageGeneration.findMany({
      where: { status: { in: ["pending", "processing"] } },
      select: { status: true, requestParams: true },
    }),
    prisma.videoGeneration.findMany({
      where: { status: { in: ["pending", "processing"] } },
      select: { status: true, requestParams: true },
    }),
  ]);

  const imageCounts = initCounts(modelOptions);
  const videoCounts = initCounts(videoModelOptions);

  for (const record of imageRecords) {
    const key = resolveImageModelKey(record.requestParams);
    const counts = imageCounts.get(key) ?? { pending: 0, processing: 0 };
    if (record.status === "pending") {
      counts.pending += 1;
    } else {
      counts.processing += 1;
    }
    imageCounts.set(key, counts);
  }

  for (const record of videoRecords) {
    const key = resolveVideoModelKey(record.requestParams);
    const counts = videoCounts.get(key) ?? { pending: 0, processing: 0 };
    if (record.status === "pending") {
      counts.pending += 1;
    } else {
      counts.processing += 1;
    }
    videoCounts.set(key, counts);
  }

  return {
    updatedAt: new Date().toISOString(),
    items: [...toItems("image", imageCounts), ...toItems("video", videoCounts)],
  };
}
