import type { ImageGenerationStatus, VideoGenerationStatus } from "@prisma/client";
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

const IMAGE_ACTIVE_STATUSES: ImageGenerationStatus[] = [
  "pending",
  "processing",
];
const VIDEO_ACTIVE_STATUSES: VideoGenerationStatus[] = [
  "pending",
  "processing",
];

function initCounts(keys: readonly string[]) {
  const map = new Map<string, QueueCounts>();
  for (const key of keys) {
    map.set(key, { pending: 0, processing: 0 });
  }
  return map;
}

function normalizeModelKey(
  model: string | null,
  options: readonly string[],
  fallback: string,
) {
  if (model && options.includes(model)) {
    return model;
  }
  return fallback;
}

function toItems(type: QueueStatusItem["type"], map: Map<string, QueueCounts>) {
  return Array.from(map.entries()).map(([model, counts]) => ({
    type,
    model,
    pending: counts.pending,
    processing: counts.processing,
  }));
}

type ImageQueueGroup = {
  modelKey: string | null;
  status: ImageGenerationStatus;
  _count: { _all: number };
};

type VideoQueueGroup = {
  modelKey: string | null;
  status: VideoGenerationStatus;
  _count: { _all: number };
};

export async function getQueueStatus(): Promise<QueueStatusResponse> {
  const [imageRows, videoRows] = await Promise.all([
    prisma.imageGeneration.groupBy({
      by: ["modelKey", "status"],
      where: { status: { in: IMAGE_ACTIVE_STATUSES } },
      _count: { _all: true },
    }),
    prisma.videoGeneration.groupBy({
      by: ["modelKey", "status"],
      where: { status: { in: VIDEO_ACTIVE_STATUSES } },
      _count: { _all: true },
    }),
  ]);

  const imageCounts = initCounts(modelOptions);
  const videoCounts = initCounts(videoModelOptions);

  for (const row of imageRows as ImageQueueGroup[]) {
    const key = normalizeModelKey(row.modelKey, modelOptions, defaultModelKey);
    const counts = imageCounts.get(key) ?? { pending: 0, processing: 0 };
    const count = row._count._all;
    if (row.status === "pending") {
      counts.pending += count;
    } else {
      counts.processing += count;
    }
    imageCounts.set(key, counts);
  }

  for (const row of videoRows as VideoQueueGroup[]) {
    const key = normalizeModelKey(row.modelKey, videoModelOptions, defaultVideoModelKey);
    const counts = videoCounts.get(key) ?? { pending: 0, processing: 0 };
    const count = row._count._all;
    if (row.status === "pending") {
      counts.pending += count;
    } else {
      counts.processing += count;
    }
    videoCounts.set(key, counts);
  }

  return {
    updatedAt: new Date().toISOString(),
    items: [...toItems("image", imageCounts), ...toItems("video", videoCounts)],
  };
}
