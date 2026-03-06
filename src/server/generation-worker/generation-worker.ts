import { prisma } from "@/server/db/prisma";
import { resolveAudioGenerationResult } from "@/server/audio-generation/audio-generation";
import {
  saveAudioGenerationResult,
  updateAudioGenerationStatus,
} from "@/server/audio-generation/audio-generation-repository";
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
import {
  validateAudioGenerationPayload,
  validateImageGenerationPayload,
  validateVideoGenerationPayload,
} from "@/server/model-catalog/generation-validation";
import {
  type RuntimeAudioModel,
  getRuntimeCatalog,
  resolveDefaultModelKey,
  type RuntimeImageModel,
  type RuntimeVideoModel,
} from "@/server/model-catalog/runtime-models";

const WORKER_INTERVAL_MS = 2000;
const PENDING_SCAN_LIMIT = 60;
const PROCESSING_PROGRESS = 92;
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const ERROR_AUDIO_GENERATION_FAILED = "오디오 생성에 실패했습니다.";
const ERROR_IMAGE_GENERATION_FAILED = "이미지 생성에 실패했습니다.";
const ERROR_VIDEO_GENERATION_FAILED = "비디오 생성에 실패했습니다.";

type WorkerGlobal = typeof globalThis & {
  __generationWorkerStarted?: boolean;
  __generationWorkerRunning?: boolean;
};

type ImageRuntimeState = {
  modelMap: Map<string, RuntimeImageModel>;
  modelKeys: string[];
  defaultKey: string;
  fallbackDefaults: RuntimeImageModel["defaults"];
};

type VideoRuntimeState = {
  modelMap: Map<string, RuntimeVideoModel>;
  modelKeys: string[];
  defaultKey: string;
  fallbackDefaults: RuntimeVideoModel["defaults"];
};

type AudioRuntimeState = {
  modelMap: Map<string, RuntimeAudioModel>;
  modelKeys: string[];
  defaultKey: string;
  fallbackDefaults: RuntimeAudioModel["defaults"];
};

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveModelKey(
  requestParams: unknown,
  modelKeys: string[],
  fallbackKey: string,
) {
  if (requestParams && typeof requestParams === "object") {
    const model = (requestParams as Record<string, unknown>).model;
    if (typeof model === "string" && modelKeys.includes(model)) {
      return model;
    }
  }
  return fallbackKey;
}

function resolveRecordModelKey(
  record: {
    modelKey?: string | null;
    requestParams: unknown;
  },
  modelKeys: string[],
  fallbackKey: string,
) {
  if (typeof record.modelKey === "string" && modelKeys.includes(record.modelKey)) {
    return record.modelKey;
  }

  return resolveModelKey(record.requestParams, modelKeys, fallbackKey);
}

async function getImageRuntimeState(): Promise<ImageRuntimeState | null> {
  const { imageModels } = await getRuntimeCatalog({ includeInactive: true });
  if (imageModels.length === 0) return null;
  const modelMap = new Map(imageModels.map((model) => [model.key, model]));
  const defaultKey = resolveDefaultModelKey(imageModels) ?? imageModels[0].key;
  const fallbackDefaults =
    modelMap.get(defaultKey)?.defaults ?? imageModels[0].defaults;
  return {
    modelMap,
    modelKeys: imageModels.map((model) => model.key),
    defaultKey,
    fallbackDefaults,
  };
}

async function getVideoRuntimeState(): Promise<VideoRuntimeState | null> {
  const { videoModels } = await getRuntimeCatalog({ includeInactive: true });
  if (videoModels.length === 0) return null;
  const modelMap = new Map(videoModels.map((model) => [model.key, model]));
  const defaultKey = resolveDefaultModelKey(videoModels) ?? videoModels[0].key;
  const fallbackDefaults =
    modelMap.get(defaultKey)?.defaults ?? videoModels[0].defaults;
  return {
    modelMap,
    modelKeys: videoModels.map((model) => model.key),
    defaultKey,
    fallbackDefaults,
  };
}

async function getAudioRuntimeState(): Promise<AudioRuntimeState | null> {
  const { audioModels } = await getRuntimeCatalog({ includeInactive: true });
  if (audioModels.length === 0) return null;
  const modelMap = new Map(audioModels.map((model) => [model.key, model]));
  const defaultKey = resolveDefaultModelKey(audioModels) ?? audioModels[0].key;
  const fallbackDefaults =
    modelMap.get(defaultKey)?.defaults ?? audioModels[0].defaults;
  return {
    modelMap,
    modelKeys: audioModels.map((model) => model.key),
    defaultKey,
    fallbackDefaults,
  };
}

function buildImagePayload(
  record: {
    prompt: string;
    requestParams: unknown;
    imageCount: number;
    steps: number;
    seed: string | null;
  },
  runtime: ImageRuntimeState,
) {
  const params =
    record.requestParams && typeof record.requestParams === "object"
      ? (record.requestParams as Record<string, unknown>)
      : {};
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const defaults =
    runtime.modelMap.get(model)?.defaults ?? runtime.fallbackDefaults;
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

function buildVideoPayload(
  record: {
    prompt: string;
    requestParams: unknown;
  },
  runtime: VideoRuntimeState,
) {
  const params =
    record.requestParams && typeof record.requestParams === "object"
      ? (record.requestParams as Record<string, unknown>)
      : {};
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const defaults =
    runtime.modelMap.get(model)?.defaults ?? runtime.fallbackDefaults;
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

function buildAudioPayload(
  record: {
    prompt: string;
    requestParams: unknown;
  },
  runtime: AudioRuntimeState,
) {
  const params =
    record.requestParams && typeof record.requestParams === "object"
      ? (record.requestParams as Record<string, unknown>)
      : {};
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const defaults =
    runtime.modelMap.get(model)?.defaults ?? runtime.fallbackDefaults;

  return {
    prompt: record.prompt,
    model,
    voice: typeof params.voice === "string" ? params.voice : defaults.voice,
    speed: normalizeNumber(params.speed, defaults.speed),
    seed: typeof params.seed === "string" ? params.seed : "",
  };
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

async function getImageProcessingCounts(
  modelKeys: string[],
  defaultKey: string,
) {
  const records = await prisma.imageGeneration.findMany({
    where: { status: "processing" },
    select: { modelKey: true, requestParams: true },
  });
  const counts = new Map<string, number>();

  for (const record of records) {
    const model = resolveRecordModelKey(record, modelKeys, defaultKey);
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  return counts;
}

async function getVideoProcessingCounts(
  modelKeys: string[],
  defaultKey: string,
) {
  const records = await prisma.videoGeneration.findMany({
    where: { status: "processing" },
    select: { modelKey: true, requestParams: true },
  });
  const counts = new Map<string, number>();

  for (const record of records) {
    const model = resolveRecordModelKey(record, modelKeys, defaultKey);
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  return counts;
}

async function getAudioProcessingCounts(
  modelKeys: string[],
  defaultKey: string,
) {
  const records = await prisma.audioGeneration.findMany({
    where: { status: "processing" },
    select: { modelKey: true, requestParams: true },
  });
  const counts = new Map<string, number>();

  for (const record of records) {
    const model = resolveRecordModelKey(record, modelKeys, defaultKey);
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

async function expireStaleAudioProcessing() {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  await prisma.audioGeneration.updateMany({
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
}, runtime: ImageRuntimeState) {
  const payload = buildImagePayload(record, runtime);
  const parsed = await validateImageGenerationPayload(payload);
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
}, runtime: VideoRuntimeState) {
  const payload = buildVideoPayload(record, runtime);
  const parsed = await validateVideoGenerationPayload(payload);
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

async function handleAudioRecord(record: {
  id: string;
  requestId: string;
  prompt: string;
  requestParams: unknown;
  progress: number;
}, runtime: AudioRuntimeState) {
  const payload = buildAudioPayload(record, runtime);
  const parsed = await validateAudioGenerationPayload(payload);
  if (!parsed.success) {
    await updateAudioGenerationStatus(
      record.id,
      "failed",
      record.progress,
      "INVALID_JOB_PAYLOAD",
    );
    return;
  }

  try {
    const result = await resolveAudioGenerationResult(
      parsed.data,
      record.requestId,
    );

    if (result.status === "completed" && !result.skipDbSave) {
      await saveAudioGenerationResult(
        record.id,
        result.status,
        100,
        result.result,
        result.errorMessage,
      );
    } else {
      await updateAudioGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
      );
    }
  } catch (error) {
    await updateAudioGenerationStatus(
      record.id,
      "failed",
      0,
      error instanceof Error ? error.message : ERROR_AUDIO_GENERATION_FAILED,
    );
  }
}

export async function processImageJobs() {
  const runtime = await getImageRuntimeState();
  if (!runtime) return;
  await expireStaleImageProcessing();
  const processingCounts = await getImageProcessingCounts(
    runtime.modelKeys,
    runtime.defaultKey,
  );
  const { slots, totalSlots } = buildSlotsByModel(
    runtime.modelKeys,
    processingCounts,
    (model) => runtime.modelMap.get(model)?.concurrentLimit ?? 1,
  );
  if (totalSlots === 0) return;

  const pending = await prisma.imageGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.max(totalSlots * 3, PENDING_SCAN_LIMIT),
  });

  const claimedRecords: typeof pending = [];

  for (const record of pending) {
    const model = resolveRecordModelKey(record, runtime.modelKeys, runtime.defaultKey);
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

  await Promise.all(claimedRecords.map((record) => handleImageRecord(record, runtime)));
}

export async function processVideoJobs() {
  const runtime = await getVideoRuntimeState();
  if (!runtime) return;
  await expireStaleVideoProcessing();
  const processingCounts = await getVideoProcessingCounts(
    runtime.modelKeys,
    runtime.defaultKey,
  );
  const { slots, totalSlots } = buildSlotsByModel(
    runtime.modelKeys,
    processingCounts,
    (model) => runtime.modelMap.get(model)?.concurrentLimit ?? 1,
  );
  if (totalSlots === 0) return;

  const pending = await prisma.videoGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.max(totalSlots * 3, PENDING_SCAN_LIMIT),
  });

  const claimedRecords: typeof pending = [];

  for (const record of pending) {
    const model = resolveRecordModelKey(record, runtime.modelKeys, runtime.defaultKey);
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

  await Promise.all(claimedRecords.map((record) => handleVideoRecord(record, runtime)));
}

export async function processAudioJobs() {
  const runtime = await getAudioRuntimeState();
  if (!runtime) return;
  await expireStaleAudioProcessing();
  const processingCounts = await getAudioProcessingCounts(
    runtime.modelKeys,
    runtime.defaultKey,
  );
  const { slots, totalSlots } = buildSlotsByModel(
    runtime.modelKeys,
    processingCounts,
    (model) => runtime.modelMap.get(model)?.concurrentLimit ?? 1,
  );
  if (totalSlots === 0) return;

  const pending = await prisma.audioGeneration.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.max(totalSlots * 3, PENDING_SCAN_LIMIT),
  });

  const claimedRecords: typeof pending = [];

  for (const record of pending) {
    const model = resolveRecordModelKey(record, runtime.modelKeys, runtime.defaultKey);
    const available = slots.get(model) ?? 0;
    if (available <= 0) continue;

    const claimed = await prisma.audioGeneration.updateMany({
      where: { id: record.id, status: "pending" },
      data: { status: "processing", progress: PROCESSING_PROGRESS },
    });
    if (claimed.count === 0) continue;

    slots.set(model, available - 1);
    claimedRecords.push(record);
    if (claimedRecords.length >= totalSlots) break;
  }

  await Promise.all(claimedRecords.map((record) => handleAudioRecord(record, runtime)));
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
      await Promise.all([processImageJobs(), processVideoJobs(), processAudioJobs()]);
    } finally {
      globalForWorker.__generationWorkerRunning = false;
    }
  };

  void tick();
  setInterval(() => void tick(), WORKER_INTERVAL_MS);
}
