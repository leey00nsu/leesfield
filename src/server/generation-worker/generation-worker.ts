import { restoreRequest } from '@/server/generation-request/request-snapshot';
import { jsonValueSchema } from "@/shared/model-catalog/gradio-contract";
import { z } from "zod";
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
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { NodeExecutionCancelledError } from "@/server/node-executions/node-execution-errors";
import { nodeExecutionRepository } from "@/server/node-executions/node-execution-repository";

const WORKER_INTERVAL_MS = 2000;
const PENDING_SCAN_LIMIT = 60;
const PROCESSING_PROGRESS = 92;
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const ERROR_AUDIO_GENERATION_FAILED = "오디오 생성에 실패했습니다.";
const ERROR_IMAGE_GENERATION_FAILED = "이미지 생성에 실패했습니다.";
const ERROR_VIDEO_GENERATION_FAILED = "비디오 생성에 실패했습니다.";
const WORKER_INSTANCE_TOKEN = Symbol("generation-worker-instance");

function isMissingGenerationRecord(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}

type WorkerGlobal = typeof globalThis & {
  __generationWorkerStarted?: boolean;
  __generationWorkerRunning?: boolean;
  __generationWorkerInterval?: ReturnType<typeof setInterval>;
  __generationWorkerInstanceToken?: symbol;
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

async function resolveGraphInputUrls(
  record: { ownerEmail?: string | null; graphNodeId?: string | null; requestParams: unknown },
  mediaType: "image" | "video",
) {
  if (!record.graphNodeId || !record.ownerEmail || !record.requestParams || typeof record.requestParams !== "object") {
    return [];
  }
  const inputAssets = (record.requestParams as Record<string, unknown>).inputAssets;
  if (!Array.isArray(inputAssets)) return [];
  const candidates = inputAssets
    .filter((input): input is { assetId: string; portId: string; sortOrder: number } =>
      Boolean(
        input &&
        typeof input === "object" &&
        typeof (input as Record<string, unknown>).assetId === "string" &&
        typeof (input as Record<string, unknown>).portId === "string" &&
        typeof (input as Record<string, unknown>).sortOrder === "number",
      ),
    )
    .filter((input) => mediaType === "image" || input.portId === "initImage")
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return Promise.all(candidates.map(async (input) =>
    (await mediaAssetService.get(record.ownerEmail as string, input.assetId)).url,
  ));
}

async function buildImagePayload(
  record: {
    prompt: string;
    requestParams: unknown;
    imageCount: number;
    steps: number;
    seed: string | null;
    ownerEmail?: string | null;
    graphNodeId?: string | null;
  },
  runtime: ImageRuntimeState,
) {
  const params = restoreRequest(record.requestParams);
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const defaults =
    runtime.modelMap.get(model)?.defaults ?? runtime.fallbackDefaults;
  const storedInitImages = Array.isArray(params.initImages)
    ? params.initImages.filter((value) => typeof value === "string")
    : [];
  const initImages = [
    ...await resolveGraphInputUrls(record, "image"),
    ...storedInitImages,
  ];

  return {
    prompt: record.prompt,
    dynamicParams: params.dynamicParams === undefined ? undefined : z.record(z.string(),jsonValueSchema).parse(params.dynamicParams),
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

async function buildVideoPayload(
  record: {
    prompt: string;
    requestParams: unknown;
    ownerEmail?: string | null;
    graphNodeId?: string | null;
  },
  runtime: VideoRuntimeState,
) {
  const params = restoreRequest(record.requestParams);
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const defaults =
    runtime.modelMap.get(model)?.defaults ?? runtime.fallbackDefaults;
  const graphInputs = await resolveGraphInputUrls(record, "video");
  const initImage = graphInputs[0] ?? (
    typeof params.initImage === "string"
      ? params.initImage
      : Array.isArray(params.initImages)
        ? params.initImages.find((value) => typeof value === "string") ?? ""
        : "");

  return {
    prompt: record.prompt,
    dynamicParams: params.dynamicParams === undefined ? undefined : z.record(z.string(),jsonValueSchema).parse(params.dynamicParams),
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
  const params = restoreRequest(record.requestParams);
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const runtimeModel = runtime.modelMap.get(model);
  const defaults = runtimeModel?.defaults ?? runtime.fallbackDefaults;
  const parameters =
    runtimeModel?.parameters && typeof runtimeModel.parameters === "object"
      ? runtimeModel.parameters
      : {};
  const hasVoiceParameter = "voice" in parameters;
  const hasSpeakerParameter = "speaker" in parameters;
  const hasModeChoiceParameter = "modeChoice" in parameters;
  const hasLanguageParameter = "language" in parameters;
  const hasStreamModeParameter = "streamMode" in parameters;
  const hasReferencePresetParameter = "referencePreset" in parameters;
  const hasCustomInstructionParameter = "customInstruction" in parameters;
  const hasVoiceInstructionParameter = "voiceInstruction" in parameters;
  const hasXvecOnlyParameter = "xvecOnly" in parameters;
  const hasChunkSizeParameter = "chunkSize" in parameters;
  const hasTemperatureParameter = "temperature" in parameters;
  const hasTopKParameter = "topK" in parameters;
  const hasRepetitionPenaltyParameter = "repetitionPenalty" in parameters;
  const submittedVoice =
    typeof params.voice === "string" ? params.voice : undefined;
  const shouldSuppressLegacyVoice =
    hasSpeakerParameter &&
    typeof params.speaker === "string" &&
    Boolean(params.speaker.trim()) &&
    submittedVoice === defaults.voice;
  const dynamicParams =
    params.dynamicParams &&
    typeof params.dynamicParams === "object" &&
    !Array.isArray(params.dynamicParams)
      ? Object.fromEntries(
          Object.entries(params.dynamicParams).filter(
            ([, value]) =>
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean",
          ),
        )
      : {};

  return {
    prompt: record.prompt,
    model,
    voice:
      shouldSuppressLegacyVoice
        ? ""
        : typeof submittedVoice === "string"
          ? submittedVoice
        : hasVoiceParameter
          ? defaults.voice
          : "",
    speed: normalizeNumber(params.speed, defaults.speed),
    seed: typeof params.seed === "string" ? params.seed : "",
    inputAudio: typeof params.inputAudio === "string" ? params.inputAudio : "",
    referenceText:
      typeof params.referenceText === "string" ? params.referenceText : "",
    speaker:
      hasSpeakerParameter && typeof params.speaker === "string"
        ? params.speaker
        : "",
    modeChoice:
      hasModeChoiceParameter && typeof params.modeChoice === "string"
        ? params.modeChoice
        : "",
    language:
      hasLanguageParameter && typeof params.language === "string"
        ? params.language
        : "",
    streamMode:
      hasStreamModeParameter && typeof params.streamMode === "boolean"
        ? params.streamMode
        : undefined,
    referencePreset:
      hasReferencePresetParameter && typeof params.referencePreset === "string"
        ? params.referencePreset
        : "",
    customInstruction:
      hasCustomInstructionParameter &&
      typeof params.customInstruction === "string"
        ? params.customInstruction
        : "",
    voiceInstruction:
      hasVoiceInstructionParameter &&
      typeof params.voiceInstruction === "string"
        ? params.voiceInstruction
        : "",
    xvecOnly:
      hasXvecOnlyParameter && typeof params.xvecOnly === "boolean"
        ? params.xvecOnly
        : undefined,
    chunkSize:
      hasChunkSizeParameter && typeof params.chunkSize === "number"
        ? params.chunkSize
        : undefined,
    temperature:
      hasTemperatureParameter && typeof params.temperature === "number"
        ? params.temperature
        : undefined,
    topK:
      hasTopKParameter && typeof params.topK === "number"
        ? params.topK
        : undefined,
    repetitionPenalty:
      hasRepetitionPenaltyParameter &&
      typeof params.repetitionPenalty === "number"
        ? params.repetitionPenalty
        : undefined,
    dynamicParams: params.dynamicParams === undefined ? dynamicParams : z.record(z.string(),jsonValueSchema).parse(params.dynamicParams),
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
    where: {
      status: { in: ["processing", "uploading"] },
      cancelRequestedAt: { not: null },
      updatedAt: { lt: cutoff },
    },
    data: { status: "cancelled", progress: 0 },
  });
  await prisma.imageGeneration.updateMany({
    where: {
      status: { in: ["processing", "uploading"] },
      cancelRequestedAt: null,
      updatedAt: { lt: cutoff },
    },
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
    where: {
      status: { in: ["processing", "uploading"] },
      cancelRequestedAt: { not: null },
      updatedAt: { lt: cutoff },
    },
    data: { status: "cancelled", progress: 0 },
  });
  await prisma.videoGeneration.updateMany({
    where: {
      status: { in: ["processing", "uploading"] },
      cancelRequestedAt: null,
      updatedAt: { lt: cutoff },
    },
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
    where: {
      status: { in: ["processing", "uploading"] },
      cancelRequestedAt: { not: null },
      updatedAt: { lt: cutoff },
    },
    data: { status: "cancelled", progress: 0 },
  });
  await prisma.audioGeneration.updateMany({
    where: {
      status: { in: ["processing", "uploading"] },
      cancelRequestedAt: null,
      updatedAt: { lt: cutoff },
    },
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
  ownerEmail: string | null;
  graphNodeId: string | null;
}, runtime: ImageRuntimeState) {
  let payload;
  try {
    payload = await buildImagePayload(record, runtime);
  } catch (error) {
    await updateImageGenerationStatus(
      record.id,
      "failed",
      0,
      error instanceof Error ? error.message : "NODE_INPUT_RESOLUTION_FAILED",
    );
    return;
  }
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
    const result = record.graphNodeId
      ? await resolveImageGenerationResult(parsed.data, record.requestId, {
          onUploading: () => nodeExecutionRepository.markUploading("image", record.id),
        })
      : await resolveImageGenerationResult(parsed.data, record.requestId);
    if (
      record.graphNodeId &&
      result.status === "completed" &&
      (result.skipDbSave || !result.artifacts?.length)
    ) {
      throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
    }

    if (result.status === "completed" && !result.skipDbSave) {
      if (record.graphNodeId) {
        await nodeExecutionRepository.completeGeneration("image", record.id, result.artifacts ?? []);
      } else {
        await saveImageGenerationResult(
          record.id,
          result.status,
          100,
          result.result,
          result.errorMessage,
          result.artifacts,
        );
      }
    } else {
      await updateImageGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
      );
    }
  } catch (error) {
    if (isMissingGenerationRecord(error)) return;
    if (error instanceof NodeExecutionCancelledError) return;
    if (record.graphNodeId && await nodeExecutionRepository.settleCancelledIfRequested("image", record.id)) return;

    try {
      await updateImageGenerationStatus(
        record.id,
        "failed",
        0,
        error instanceof Error ? error.message : ERROR_IMAGE_GENERATION_FAILED,
      );
    } catch (statusError) {
      if (isMissingGenerationRecord(statusError)) return;
      throw statusError;
    }
  }
}

async function handleVideoRecord(record: {
  id: string;
  requestId: string;
  prompt: string;
  requestParams: unknown;
  progress: number;
  ownerEmail: string | null;
  graphNodeId: string | null;
}, runtime: VideoRuntimeState) {
  let payload;
  try {
    payload = await buildVideoPayload(record, runtime);
  } catch (error) {
    await updateVideoGenerationStatus(
      record.id,
      "failed",
      0,
      error instanceof Error ? error.message : "NODE_INPUT_RESOLUTION_FAILED",
    );
    return;
  }
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
    const result = record.graphNodeId
      ? await resolveVideoGenerationResult(parsed.data, record.requestId, {
          onUploading: () => nodeExecutionRepository.markUploading("video", record.id),
        })
      : await resolveVideoGenerationResult(parsed.data, record.requestId);
    if (
      record.graphNodeId &&
      result.status === "completed" &&
      (result.skipDbSave || !result.artifacts?.length)
    ) {
      throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
    }

    if (result.status === "completed" && !result.skipDbSave) {
      if (record.graphNodeId) {
        await nodeExecutionRepository.completeGeneration("video", record.id, result.artifacts ?? []);
      } else {
        await saveVideoGenerationResult(
          record.id,
          result.status,
          100,
          result.result,
          result.errorMessage,
        );
      }
    } else {
      await updateVideoGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
      );
    }
  } catch (error) {
    if (error instanceof NodeExecutionCancelledError) return;
    if (record.graphNodeId && await nodeExecutionRepository.settleCancelledIfRequested("video", record.id)) return;
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
  graphNodeId: string | null;
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
    const result = record.graphNodeId
      ? await resolveAudioGenerationResult(parsed.data, record.requestId, {
          onUploading: () => nodeExecutionRepository.markUploading("audio", record.id),
        })
      : await resolveAudioGenerationResult(parsed.data, record.requestId);
    if (
      record.graphNodeId &&
      result.status === "completed" &&
      (result.skipDbSave || !result.artifacts?.length)
    ) {
      throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
    }

    if (result.status === "completed" && result.result?.audios?.length) {
      if (record.graphNodeId) {
        await nodeExecutionRepository.completeGeneration("audio", record.id, result.artifacts ?? []);
      } else {
        await saveAudioGenerationResult(
          record.id,
          result.status,
          100,
          result.result,
          result.errorMessage,
        );
      }
    } else {
      await updateAudioGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
      );
    }
  } catch (error) {
    if (error instanceof NodeExecutionCancelledError) return;
    if (record.graphNodeId && await nodeExecutionRepository.settleCancelledIfRequested("audio", record.id)) return;
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
  const isSameWorkerInstance =
    globalForWorker.__generationWorkerInstanceToken === WORKER_INSTANCE_TOKEN;

  if (globalForWorker.__generationWorkerStarted && isSameWorkerInstance) {
    return;
  }

  if (!isSameWorkerInstance && globalForWorker.__generationWorkerInterval) {
    clearInterval(globalForWorker.__generationWorkerInterval);
    globalForWorker.__generationWorkerInterval = undefined;
  }

  globalForWorker.__generationWorkerInstanceToken = WORKER_INSTANCE_TOKEN;
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
  globalForWorker.__generationWorkerInterval = setInterval(
    () => void tick(),
    WORKER_INTERVAL_MS,
  );
}
