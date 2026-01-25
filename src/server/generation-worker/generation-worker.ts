import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import {
  defaultModelKey,
  getImageModelConcurrentLimit,
  modelDefaults,
  modelOptions,
  type ImageGenerationModel,
} from "@/features/image-generation/model/image-models";
import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import {
  defaultVideoModelKey,
  getVideoModelConcurrentLimit,
  videoModelDefaults,
  videoModelOptions,
  type VideoGenerationModel,
} from "@/features/video-generation/model/video-models";
import { prisma } from "@/server/db/prisma";
import { resolveImageGenerationResult } from "@/server/image-generation/image-generation";
import {
  saveImageGenerationResult,
  updateImageGenerationStatus,
} from "@/server/image-generation/image-generation-repository";
import { resolveVideoGenerationResult } from "@/server/video-generation/video-generation";
import {
  saveVideoGenerationResult,
  updateVideoGenerationStatus,
} from "@/server/video-generation/video-generation-repository";

const WORKER_INTERVAL_MS = 2000;
const PENDING_SCAN_LIMIT = 60;
const PROCESSING_PROGRESS = 92;
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const ERROR_IMAGE_GENERATION_FAILED = "이미지 생성에 실패했습니다.";
const ERROR_VIDEO_GENERATION_FAILED = "비디오 생성에 실패했습니다.";

type WorkerGlobal = typeof globalThis & {
  __generationWorkerStarted?: boolean;
  __generationWorkerRunning?: boolean;
};

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildImagePayload(record: {
  prompt: string;
  requestParams: unknown;
  imageCount: number;
  steps: number;
  seed: string | null;
}) {
  const params =
    record.requestParams && typeof record.requestParams === "object"
      ? (record.requestParams as Record<string, unknown>)
      : {};
  const model =
    typeof params.model === "string" && modelOptions.includes(params.model)
      ? (params.model as (typeof modelOptions)[number])
      : defaultModelKey;
  const defaults = modelDefaults[model];
  const initImages = Array.isArray(params.initImages)
    ? params.initImages.filter((value) => typeof value === "string")
    : [];

  return {
    prompt: record.prompt,
    width: normalizeNumber(params.width, defaults.width),
    height: normalizeNumber(params.height, defaults.height),
    initImages,
    model,
    imageCount: normalizeNumber(params.imageCount, record.imageCount),
    steps: normalizeNumber(params.steps, record.steps),
    seed: typeof params.seed === "string" ? params.seed : record.seed ?? "",
    modeChoice: typeof params.modeChoice === "string" ? params.modeChoice : undefined,
    guidanceScale:
      typeof params.guidanceScale === "number"
        ? params.guidanceScale
        : undefined,
    promptUpsampling:
      typeof params.promptUpsampling === "boolean"
        ? params.promptUpsampling
        : undefined,
  };
}

function resolveImageModelKey(
  requestParams: unknown,
): ImageGenerationModel {
  if (requestParams && typeof requestParams === "object") {
    const model = (requestParams as Record<string, unknown>).model;
    if (typeof model === "string" && modelOptions.includes(model)) {
      return model as ImageGenerationModel;
    }
  }
  return defaultModelKey;
}

function buildVideoPayload(record: {
  prompt: string;
  requestParams: unknown;
}) {
  const params =
    record.requestParams && typeof record.requestParams === "object"
      ? (record.requestParams as Record<string, unknown>)
      : {};
  const model =
    typeof params.model === "string" && videoModelOptions.includes(params.model)
      ? (params.model as (typeof videoModelOptions)[number])
      : defaultVideoModelKey;
  const defaults = videoModelDefaults[model];
  const initImage =
    typeof params.initImage === "string"
      ? params.initImage
      : Array.isArray(params.initImages)
        ? params.initImages.find((value) => typeof value === "string") ?? ""
        : "";

  return {
    prompt: record.prompt,
    initImage,
    model,
    aspectRatio:
      typeof params.aspectRatio === "string"
        ? params.aspectRatio
        : defaults.aspectRatio,
    resolution: normalizeNumber(params.resolution, defaults.resolution),
    durationSec: normalizeNumber(params.durationSec, defaults.durationSec),
    fps: normalizeNumber(params.fps, defaults.fps),
    steps: normalizeNumber(params.steps, defaults.steps),
    guidanceScale: normalizeNumber(params.guidanceScale, defaults.guidanceScale),
    seed: typeof params.seed === "string" ? params.seed : "",
  };
}

function resolveVideoModelKey(
  requestParams: unknown,
): VideoGenerationModel {
  if (requestParams && typeof requestParams === "object") {
    const model = (requestParams as Record<string, unknown>).model;
    if (typeof model === "string" && videoModelOptions.includes(model)) {
      return model as VideoGenerationModel;
    }
  }
  return defaultVideoModelKey;
}

function buildSlotsByModel<TModel extends string>(
  models: readonly TModel[],
  processingCounts: Map<TModel, number>,
  getLimit: (model: TModel) => number,
) {
  const slots = new Map<TModel, number>();
  let totalSlots = 0;

  for (const model of models) {
    const limit = getLimit(model);
    const used = processingCounts.get(model) ?? 0;
    const available = Math.max(limit - used, 0);
    slots.set(model, available);
    totalSlots += available;
  }

  return { slots, totalSlots };
}

async function getImageProcessingCounts() {
  const records = await prisma.imageGeneration.findMany({
    where: { status: "processing" },
    select: { requestParams: true },
  });
  const counts = new Map<ImageGenerationModel, number>();

  for (const record of records) {
    const model = resolveImageModelKey(record.requestParams);
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  return counts;
}

async function getVideoProcessingCounts() {
  const records = await prisma.videoGeneration.findMany({
    where: { status: "processing" },
    select: { requestParams: true },
  });
  const counts = new Map<VideoGenerationModel, number>();

  for (const record of records) {
    const model = resolveVideoModelKey(record.requestParams);
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  return counts;
}

async function expireStaleImageProcessing() {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  await prisma.imageGeneration.updateMany({
    where: { status: "processing", updatedAt: { lt: cutoff } },
    data: {
      status: "failed",
      progress: 0,
      errorMessage: "PROCESSING_TIMEOUT",
    },
  });
}

async function expireStaleVideoProcessing() {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  await prisma.videoGeneration.updateMany({
    where: { status: "processing", updatedAt: { lt: cutoff } },
    data: {
      status: "failed",
      progress: 0,
      errorMessage: "PROCESSING_TIMEOUT",
    },
  });
}

async function handleImageRecord(record: {
  id: string;
  requestId: string;
  prompt: string;
  requestParams: unknown;
  imageCount: number;
  steps: number;
  seed: string | null;
  progress: number;
}) {
  const payload = buildImagePayload(record);
  const parsed = imageGenerationSchema.safeParse(payload);
  if (!parsed.success) {
    await updateImageGenerationStatus(
      record.id,
      "failed",
      record.progress,
      "INVALID_JOB_PAYLOAD",
    );
    return;
  }

  try {
    const result = await resolveImageGenerationResult(
      parsed.data,
      record.requestId,
    );

    if (result.status === "completed" && !result.skipDbSave) {
      await saveImageGenerationResult(
        record.id,
        result.status,
        100,
        result.result,
        result.errorMessage,
      );
    } else {
      await updateImageGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
      );
    }
  } catch (error) {
    await updateImageGenerationStatus(
      record.id,
      "failed",
      0,
      error instanceof Error ? error.message : ERROR_IMAGE_GENERATION_FAILED,
    );
  }
}

async function handleVideoRecord(record: {
  id: string;
  requestId: string;
  prompt: string;
  requestParams: unknown;
  progress: number;
}) {
  const payload = buildVideoPayload(record);
  const parsed = videoGenerationSchema.safeParse(payload);
  if (!parsed.success) {
    await updateVideoGenerationStatus(
      record.id,
      "failed",
      record.progress,
      "INVALID_JOB_PAYLOAD",
    );
    return;
  }

  try {
    const result = await resolveVideoGenerationResult(
      parsed.data,
      record.requestId,
    );

    if (result.status === "completed" && !result.skipDbSave) {
      await saveVideoGenerationResult(
        record.id,
        result.status,
        100,
        result.result,
        result.errorMessage,
      );
    } else {
      await updateVideoGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
      );
    }
  } catch (error) {
    await updateVideoGenerationStatus(
      record.id,
      "failed",
      0,
      error instanceof Error ? error.message : ERROR_VIDEO_GENERATION_FAILED,
    );
  }
}

export async function processImageJobs() {
  await expireStaleImageProcessing();
  const processingCounts = await getImageProcessingCounts();
  const { slots, totalSlots } = buildSlotsByModel(
    modelOptions,
    processingCounts,
    getImageModelConcurrentLimit,
  );
  if (totalSlots === 0) return;

  const pending = await prisma.imageGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.max(totalSlots * 3, PENDING_SCAN_LIMIT),
  });

  const claimedRecords: typeof pending = [];

  for (const record of pending) {
    const model = resolveImageModelKey(record.requestParams);
    const available = slots.get(model) ?? 0;
    if (available <= 0) continue;

    const claimed = await prisma.imageGeneration.updateMany({
      where: { id: record.id, status: "pending" },
      data: { status: "processing", progress: PROCESSING_PROGRESS },
    });
    if (claimed.count === 0) continue;

    slots.set(model, available - 1);
    claimedRecords.push(record);
    if (claimedRecords.length >= totalSlots) break;
  }

  await Promise.all(claimedRecords.map(handleImageRecord));
}

export async function processVideoJobs() {
  await expireStaleVideoProcessing();
  const processingCounts = await getVideoProcessingCounts();
  const { slots, totalSlots } = buildSlotsByModel(
    videoModelOptions,
    processingCounts,
    getVideoModelConcurrentLimit,
  );
  if (totalSlots === 0) return;

  const pending = await prisma.videoGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.max(totalSlots * 3, PENDING_SCAN_LIMIT),
  });

  const claimedRecords: typeof pending = [];

  for (const record of pending) {
    const model = resolveVideoModelKey(record.requestParams);
    const available = slots.get(model) ?? 0;
    if (available <= 0) continue;

    const claimed = await prisma.videoGeneration.updateMany({
      where: { id: record.id, status: "pending" },
      data: { status: "processing", progress: PROCESSING_PROGRESS },
    });
    if (claimed.count === 0) continue;

    slots.set(model, available - 1);
    claimedRecords.push(record);
    if (claimedRecords.length >= totalSlots) break;
  }

  await Promise.all(claimedRecords.map(handleVideoRecord));
}

export function startGenerationWorker() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return;
  }

  const globalForWorker = globalThis as WorkerGlobal;
  if (globalForWorker.__generationWorkerStarted) return;
  globalForWorker.__generationWorkerStarted = true;

  const tick = async () => {
    if (globalForWorker.__generationWorkerRunning) return;
    globalForWorker.__generationWorkerRunning = true;
    try {
      await Promise.all([processImageJobs(), processVideoJobs()]);
    } finally {
      globalForWorker.__generationWorkerRunning = false;
    }
  };

  void tick();
  setInterval(() => void tick(), WORKER_INTERVAL_MS);
}
