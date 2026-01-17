import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import {
  defaultModelKey,
  modelDefaults,
  modelOptions,
} from "@/features/image-generation/model/image-models";
import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import {
  defaultVideoModelKey,
  videoModelDefaults,
  videoModelOptions,
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
const BATCH_SIZE = 3;
const PROCESSING_PROGRESS = 92;

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

  return {
    prompt: record.prompt,
    width: normalizeNumber(params.width, defaults.width),
    height: normalizeNumber(params.height, defaults.height),
    initImages: [],
    model,
    imageCount: normalizeNumber(params.imageCount, record.imageCount),
    steps: normalizeNumber(params.steps, record.steps),
    seed: typeof params.seed === "string" ? params.seed : record.seed ?? "",
  };
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

  return {
    prompt: record.prompt,
    initImage: typeof params.initImage === "string" ? params.initImage : "",
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

export async function processImageJobs() {
  const pending = await prisma.imageGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const record of pending) {
    const claimed = await prisma.imageGeneration.updateMany({
      where: { id: record.id, status: "pending" },
      data: { status: "processing", progress: PROCESSING_PROGRESS },
    });
    if (claimed.count === 0) continue;

    const payload = buildImagePayload(record);
    const parsed = imageGenerationSchema.safeParse(payload);
    if (!parsed.success) {
      await updateImageGenerationStatus(
        record.id,
        "failed",
        record.progress,
        "INVALID_JOB_PAYLOAD",
      );
      continue;
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
        error instanceof Error ? error.message : "이미지 생성에 실패했습니다.",
      );
    }
  }
}

export async function processVideoJobs() {
  const pending = await prisma.videoGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const record of pending) {
    const claimed = await prisma.videoGeneration.updateMany({
      where: { id: record.id, status: "pending" },
      data: { status: "processing", progress: PROCESSING_PROGRESS },
    });
    if (claimed.count === 0) continue;

    const payload = buildVideoPayload(record);
    const parsed = videoGenerationSchema.safeParse(payload);
    if (!parsed.success) {
      await updateVideoGenerationStatus(
        record.id,
        "failed",
        record.progress,
        "INVALID_JOB_PAYLOAD",
      );
      continue;
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
        error instanceof Error ? error.message : "비디오 생성에 실패했습니다.",
      );
    }
  }
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
