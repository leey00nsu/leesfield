import type {
  AudioGenerationStatus,
  ImageGenerationStatus,
  VideoGenerationStatus,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  getRuntimeCatalog,
  resolveDefaultModelKey,
} from "@/server/model-catalog/runtime-models";

export type QueueStatusItem = {
  type: "audio" | "image" | "video";
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
const AUDIO_ACTIVE_STATUSES: AudioGenerationStatus[] = [
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

function normalizeQueueModelKey(
  model: string | null,
  options: readonly string[],
  fallback?: string,
) {
  if (model && options.includes(model)) {
    return model;
  }
  if (model) {
    return model;
  }
  return fallback ?? "unknown";
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

type AudioQueueGroup = {
  modelKey: string | null;
  status: AudioGenerationStatus;
  _count: { _all: number };
};

export async function getQueueStatus(): Promise<QueueStatusResponse> {
  const [audioRows, imageRows, videoRows, runtime] = await Promise.all([
    prisma.audioGeneration.groupBy({
      by: ["modelKey", "status"],
      where: { status: { in: AUDIO_ACTIVE_STATUSES } },
      _count: { _all: true },
    }),
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
    getRuntimeCatalog({ includeInactive: true }),
  ]);

  const audioKeys = runtime.audioModels.map((model) => model.key);
  const imageKeys = runtime.imageModels.map((model) => model.key);
  const videoKeys = runtime.videoModels.map((model) => model.key);
  const audioDefaultKey =
    resolveDefaultModelKey(runtime.audioModels) ?? audioKeys[0];
  const imageDefaultKey =
    resolveDefaultModelKey(runtime.imageModels) ?? imageKeys[0];
  const videoDefaultKey =
    resolveDefaultModelKey(runtime.videoModels) ?? videoKeys[0];

  const audioCounts = initCounts(
    runtime.audioModels.filter((model) => model.isActive).map((model) => model.key),
  );
  const imageCounts = initCounts(
    runtime.imageModels.filter((model) => model.isActive).map((model) => model.key),
  );
  const videoCounts = initCounts(
    runtime.videoModels.filter((model) => model.isActive).map((model) => model.key),
  );

  for (const row of audioRows as AudioQueueGroup[]) {
    const key = normalizeQueueModelKey(
      row.modelKey,
      audioKeys,
      audioDefaultKey,
    );
    const counts = audioCounts.get(key) ?? { pending: 0, processing: 0 };
    const count = row._count._all;
    if (row.status === "pending") {
      counts.pending += count;
    } else {
      counts.processing += count;
    }
    audioCounts.set(key, counts);
  }

  for (const row of imageRows as ImageQueueGroup[]) {
    const key = normalizeQueueModelKey(
      row.modelKey,
      imageKeys,
      imageDefaultKey,
    );
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
    const key = normalizeQueueModelKey(
      row.modelKey,
      videoKeys,
      videoDefaultKey,
    );
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
    items: [
      ...toItems("audio", audioCounts),
      ...toItems("image", imageCounts),
      ...toItems("video", videoCounts),
    ],
  };
}
