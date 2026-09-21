import { restoreRequest, frozenExecutionModel } from '@/server/generation-request/request-snapshot';
import { inputAssetRefsFromSnapshot } from '@/server/generation-request/generation-input-assets';
import {fileInputsFromAssets,parseFileInputPort} from '@/shared/model-catalog/file-input-ports';
import { jsonValueSchema } from "@/shared/model-catalog/gradio-contract";
import { z } from "zod";
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
import { releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";
import { NodeExecutionCancelledError } from "@/server/node-executions/node-execution-errors";
import { nodeExecutionRepository } from "@/server/node-executions/node-execution-repository";
import {
  claimPendingGenerationJobs,
  GENERATION_EXECUTION_GLOBAL_LIMIT,
  isGenerationLeaseLost,
  requireGenerationLease,
  startGenerationLeaseMonitor,
  type ClaimedGeneration,
} from "@/server/generation-worker/execution-lease";
import { recordWorkerFailure } from "@/server/observability/metrics";
import { logStructured } from "@/server/observability/request-observability";

const WORKER_INTERVAL_MS = 2000;
export const GENERATION_WORKER_DRAIN_TIMEOUT_MS = 25_000;
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

function recordGenerationFailure(
  mediaType: "image" | "video" | "audio",
  jobId: string,
  error: unknown,
) {
  recordWorkerFailure(`generation.${mediaType}`);
  logStructured("job.failure", {
    worker: "generation",
    jobId,
    kind: mediaType,
    errorType: error instanceof Error ? error.name : typeof error,
  }, "error");
}

type WorkerGlobal = typeof globalThis & {
  __generationWorkerStarted?: boolean;
  __generationWorkerRunning?: boolean;
  __generationWorkerStopping?: boolean;
  __generationWorkerInterval?: ReturnType<typeof setInterval>;
  __generationWorkerInstanceToken?: symbol;
  __generationWorkerStopPromise?: Promise<void>;
  __generationWorkerLastHeartbeatAt?: number;
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

function normalizeNumber(value: unknown, fallback: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  mediaType: "image" | "video" | "files",
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
    .filter((input) => mediaType === "files" ? Boolean(parseFileInputPort(input.portId)) : !parseFileInputPort(input.portId) && (mediaType === "image" || input.portId === "initImage"))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const assets=await Promise.all(candidates.map(async input=>({...input,url:(await mediaAssetService.get(record.ownerEmail as string,input.assetId)).url})));
  return assets;
}

/** Resolves v3 request refs immediately before provider execution. */
async function hydrateRequestInputAssets(
  record: { ownerEmail?: string | null },
  params: Record<string, unknown>,
  generationType: "image" | "video" | "audio",
) {
  if (!record.ownerEmail) return params;
  const refs = inputAssetRefsFromSnapshot(generationType, params).filter((ref) =>
    ref.field === "initImages" ||
    ref.field === "initImage" ||
    ref.field === "inputAudio" ||
    ref.field.startsWith("dynamicParams."),
  );
  if (refs.length === 0) return params;
  const resolved = await Promise.all(refs.map(async (ref) => ({
    ref,
    url: (await mediaAssetService.get(record.ownerEmail as string, ref.assetId)).url,
  })));
  const result = { ...params };
  const grouped = new Map<string, typeof resolved>();
  for (const item of resolved) {
    const values = grouped.get(item.ref.field) ?? [];
    values.push(item);
    grouped.set(item.ref.field, values);
  }
  for (const [field, values] of grouped) {
    values.sort((left, right) => left.ref.sortOrder - right.ref.sortOrder);
    const urls = values.map((value) => value.url);
    if (field === "initImages") result.initImages = urls;
    else if (field === "initImage") result.initImage = urls[0] ?? "";
    else if (field === "inputAudio") result.inputAudio = urls[0] ?? "";
    else if (field.startsWith("dynamicParams.")) {
      const key = field.slice("dynamicParams.".length);
      if (!key) continue;
      const dynamic = {
        ...(result.dynamicParams && typeof result.dynamicParams === "object" && !Array.isArray(result.dynamicParams)
          ? result.dynamicParams as Record<string, unknown>
          : {}),
      };
      dynamic[key] = values[0]?.ref.multiple ? urls : urls[0] ?? "";
      result.dynamicParams = dynamic;
    }
  }
  return result;
}

async function buildImagePayload(
  record: {
    prompt: string;
    requestParams: unknown;
    requestId?: string;
    imageCount?: number | null;
    steps?: number | null;
    seed?: string | null;
    ownerEmail?: string | null;
    graphNodeId?: string | null;
  },
  runtime: ImageRuntimeState,
) {
  const params = await hydrateRequestInputAssets(
    record,
    restoreRequest(record.requestParams),
    "image",
  );
  if(frozenExecutionModel(record.requestParams,"image",params.model) && record.requestId) {
    const {modalJobRepository}=await import("@/server/modal-comfyui/job-repository");
    const job=await modalJobRepository.find?.(record.requestId);
    if(job?.jobId)return {...params,prompt:record.prompt,initImages:[],initImage:""};
  }
  if(frozenExecutionModel(record.requestParams,"image",params.model))return {...params,prompt:record.prompt,initImages:(await resolveGraphInputUrls(record,"image")).map(a=>a.url),fileInputs:fileInputsFromAssets(await resolveGraphInputUrls(record,"files"))};
  if (typeof params.model === "string" && !runtime.modelMap.has(params.model)) throw new Error("MODEL_NOT_FOUND");
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
    ...(await resolveGraphInputUrls(record, "image")).map(a=>a.url),
    ...storedInitImages,
  ];

  if (runtime.modelMap.get(model)?.mapped) return { ...params, model, prompt: record.prompt, initImages, fileInputs:fileInputsFromAssets(await resolveGraphInputUrls(record,"files")) };

  return {
    prompt: record.prompt,
    dynamicParams: params.dynamicParams === undefined ? undefined : z.record(z.string(),jsonValueSchema).parse(params.dynamicParams),
    width: normalizeNumber(params.width, defaults.width),
    height: normalizeNumber(params.height, defaults.height),
    initImages,
    model,
    imageCount: normalizeNumber(params.imageCount, record.imageCount ?? undefined),
    steps: normalizeNumber(params.steps, record.steps ?? defaults.steps),
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
    requestId?: string;
    ownerEmail?: string | null;
    graphNodeId?: string | null;
  },
  runtime: VideoRuntimeState,
) {
  const params = await hydrateRequestInputAssets(
    record,
    restoreRequest(record.requestParams),
    "video",
  );
  if(frozenExecutionModel(record.requestParams,"video",params.model) && record.requestId) {
    const {modalJobRepository}=await import("@/server/modal-comfyui/job-repository");
    const job=await modalJobRepository.find?.(record.requestId);
    if(job?.jobId)return {...params,prompt:record.prompt,initImages:[],initImage:""};
  }
  if(frozenExecutionModel(record.requestParams,"video",params.model))return {...params,prompt:record.prompt,initImage:(await resolveGraphInputUrls(record,"video"))[0]?.url??"",fileInputs:fileInputsFromAssets(await resolveGraphInputUrls(record,"files"))};
  if (typeof params.model === "string" && !runtime.modelMap.has(params.model)) throw new Error("MODEL_NOT_FOUND");
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const defaults =
    runtime.modelMap.get(model)?.defaults ?? runtime.fallbackDefaults;
  const graphInputs = await resolveGraphInputUrls(record, "video");
  const initImage = graphInputs[0]?.url ?? (
    typeof params.initImage === "string"
      ? params.initImage
      : Array.isArray(params.initImages)
        ? params.initImages.find((value) => typeof value === "string") ?? ""
        : "");

  if (runtime.modelMap.get(model)?.mapped) return { ...params, model, prompt: record.prompt, initImage, fileInputs:fileInputsFromAssets(await resolveGraphInputUrls(record,"files")) };

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

async function buildAudioPayload(
  record: {
    prompt: string;
    requestParams: unknown;
    ownerEmail?: string | null;
  },
  runtime: AudioRuntimeState,
) {
  const params = await hydrateRequestInputAssets(
    record,
    restoreRequest(record.requestParams),
    "audio",
  );
  if (typeof params.model === "string" && !runtime.modelMap.has(params.model)) throw new Error("MODEL_NOT_FOUND");
  const model =
    typeof params.model === "string" && runtime.modelMap.has(params.model)
      ? params.model
      : runtime.defaultKey;
  const runtimeModel = runtime.modelMap.get(model);
  if (runtimeModel?.mapped) return { ...params, model, prompt: record.prompt };
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

export type ProcessGenerationJobsOptions = {
  awaitCompletion?: boolean;
  refillOnCompletion?: boolean;
  maxClaims?: number;
};

const inFlightGenerationJobs = new Map<string, Promise<void>>();

function scheduleGenerationJob(
  key: string,
  run: () => Promise<void>,
  refill?: () => Promise<void>,
) {
  const existing = inFlightGenerationJobs.get(key);
  if (existing) return existing;

  const execution = Promise.resolve().then(run);
  inFlightGenerationJobs.set(key, execution);
  const settle = () => {
    if (inFlightGenerationJobs.get(key) !== execution) return;
    inFlightGenerationJobs.delete(key);
    if (refill) {
      void refill().catch(() => undefined);
    }
  };
  execution.then(settle, settle);
  return execution;
}

async function handleImageRecord(
  record: ClaimedGeneration,
  runtime: ImageRuntimeState,
) {
  const lease = requireGenerationLease(record, "image", record.id);
  const monitor = startGenerationLeaseMonitor("image", record.id, lease);
  try {
    let payload;
    try {
      monitor.assertOwned();
      payload = await buildImagePayload(record, runtime);
    } catch (error) {
      if (isGenerationLeaseLost(error)) return;
      await updateImageGenerationStatus(
        record.id,
        "failed",
        0,
        error instanceof Error ? error.message : "NODE_INPUT_RESOLUTION_FAILED",
        lease,
      );
      return;
    }
    monitor.assertOwned();
    const executionModel = frozenExecutionModel(record.requestParams, "image", payload.model);
    const parsed = executionModel
      ? await validateImageGenerationPayload(payload, undefined, executionModel)
      : await validateImageGenerationPayload(payload);
    if (!parsed.success) {
      await updateImageGenerationStatus(
        record.id,
        "failed",
        record.progress,
        "INVALID_JOB_PAYLOAD",
        lease,
      );
      return;
    }

    const result = record.graphNodeId
      ? await resolveImageGenerationResult(parsed.data, record.requestId, {
          executionModel,
          onUploading: async () => {
            monitor.assertOwned();
            await nodeExecutionRepository.markUploading("image", record.id, lease);
          },
        })
      : executionModel
        ? await resolveImageGenerationResult(parsed.data, record.requestId, { executionModel })
        : await resolveImageGenerationResult(parsed.data, record.requestId);
    monitor.assertOwned();
    if (
      record.graphNodeId &&
      result.status === "completed" &&
      (result.skipDbSave || !result.artifacts?.length)
    ) {
      throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
    }

    if (result.status === "completed" && !result.skipDbSave) {
      if (record.graphNodeId) {
        await nodeExecutionRepository.completeGeneration("image", record.id, result.artifacts ?? [], lease);
      } else {
        await saveImageGenerationResult(
          record.id,
          result.status,
          100,
          result.result,
          result.errorMessage,
          result.artifacts,
          lease,
        );
      }
    } else {
      await updateImageGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
        lease,
      );
    }
  } catch (error) {
    if (isMissingGenerationRecord(error) || isGenerationLeaseLost(error)) return;
    if (error instanceof NodeExecutionCancelledError) return;
    recordGenerationFailure("image", record.id, error);
    await releaseStorageCleanupsForRequest(undefined, record.requestId).catch(() => undefined);
    if (record.graphNodeId && await nodeExecutionRepository.settleCancelledIfRequested("image", record.id, lease)) return;

    try {
      await updateImageGenerationStatus(
        record.id,
        "failed",
        0,
        error instanceof Error ? error.message : ERROR_IMAGE_GENERATION_FAILED,
        lease,
      );
    } catch (statusError) {
      if (isMissingGenerationRecord(statusError) || isGenerationLeaseLost(statusError)) return;
      throw statusError;
    }
  } finally {
    monitor.stop();
  }
}

async function handleVideoRecord(
  record: ClaimedGeneration,
  runtime: VideoRuntimeState,
) {
  const lease = requireGenerationLease(record, "video", record.id);
  const monitor = startGenerationLeaseMonitor("video", record.id, lease);
  try {
    let payload;
    try {
      monitor.assertOwned();
      payload = await buildVideoPayload(record, runtime);
    } catch (error) {
      if (isGenerationLeaseLost(error)) return;
      await updateVideoGenerationStatus(
        record.id,
        "failed",
        0,
        error instanceof Error ? error.message : "NODE_INPUT_RESOLUTION_FAILED",
        lease,
      );
      return;
    }
    monitor.assertOwned();
    const executionModel = frozenExecutionModel(record.requestParams, "video", payload.model);
    const parsed = executionModel
      ? await validateVideoGenerationPayload(payload, undefined, executionModel)
      : await validateVideoGenerationPayload(payload);
    if (!parsed.success) {
      await updateVideoGenerationStatus(
        record.id,
        "failed",
        record.progress,
        "INVALID_JOB_PAYLOAD",
        lease,
      );
      return;
    }

    const result = record.graphNodeId
      ? await resolveVideoGenerationResult(parsed.data, record.requestId, {
          executionModel,
          onUploading: async () => {
            monitor.assertOwned();
            await nodeExecutionRepository.markUploading("video", record.id, lease);
          },
        })
      : executionModel
        ? await resolveVideoGenerationResult(parsed.data, record.requestId, { executionModel })
        : await resolveVideoGenerationResult(parsed.data, record.requestId);
    monitor.assertOwned();
    if (
      record.graphNodeId &&
      result.status === "completed" &&
      (result.skipDbSave || !result.artifacts?.length)
    ) {
      throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
    }

    if (result.status === "completed" && !result.skipDbSave) {
      if (record.graphNodeId) {
        await nodeExecutionRepository.completeGeneration("video", record.id, result.artifacts ?? [], lease);
      } else {
        if (result.artifacts?.length) {
          await saveVideoGenerationResult(
            record.id,
            result.status,
            100,
            result.result,
            result.errorMessage,
            lease,
            result.artifacts,
          );
        } else {
          await saveVideoGenerationResult(
            record.id,
            result.status,
            100,
            result.result,
            result.errorMessage,
            lease,
          );
        }
      }
    } else {
      await updateVideoGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
        lease,
      );
    }
  } catch (error) {
    if (isMissingGenerationRecord(error) || isGenerationLeaseLost(error)) return;
    if (error instanceof NodeExecutionCancelledError) return;
    recordGenerationFailure("video", record.id, error);
    await releaseStorageCleanupsForRequest(undefined, record.requestId).catch(() => undefined);
    if (record.graphNodeId && await nodeExecutionRepository.settleCancelledIfRequested("video", record.id, lease)) return;
    try {
      await updateVideoGenerationStatus(
        record.id,
        "failed",
        0,
        error instanceof Error ? error.message : ERROR_VIDEO_GENERATION_FAILED,
        lease,
      );
    } catch (statusError) {
      if (isMissingGenerationRecord(statusError) || isGenerationLeaseLost(statusError)) return;
      throw statusError;
    }
  } finally {
    monitor.stop();
  }
}

async function handleAudioRecord(
  record: ClaimedGeneration,
  runtime: AudioRuntimeState,
) {
  const lease = requireGenerationLease(record, "audio", record.id);
  const monitor = startGenerationLeaseMonitor("audio", record.id, lease);
  try {
    monitor.assertOwned();
    const payload = await buildAudioPayload(record, runtime);
    const parsed = await validateAudioGenerationPayload(payload);
    if (!parsed.success) {
      await updateAudioGenerationStatus(
        record.id,
        "failed",
        record.progress,
        "INVALID_JOB_PAYLOAD",
        lease,
      );
      return;
    }

    const result = record.graphNodeId
      ? await resolveAudioGenerationResult(parsed.data, record.requestId, {
          onUploading: async () => {
            monitor.assertOwned();
            await nodeExecutionRepository.markUploading("audio", record.id, lease);
          },
        })
      : await resolveAudioGenerationResult(parsed.data, record.requestId);
    monitor.assertOwned();
    if (
      record.graphNodeId &&
      result.status === "completed" &&
      (result.skipDbSave || !result.artifacts?.length)
    ) {
      throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
    }

    if (result.status === "completed" && result.result?.audios?.length) {
      if (record.graphNodeId) {
        await nodeExecutionRepository.completeGeneration("audio", record.id, result.artifacts ?? [], lease);
      } else {
        if (result.artifacts?.length) {
          await saveAudioGenerationResult(
            record.id,
            result.status,
            100,
            result.result,
            result.errorMessage,
            lease,
            result.artifacts,
          );
        } else {
          await saveAudioGenerationResult(
            record.id,
            result.status,
            100,
            result.result,
            result.errorMessage,
            lease,
          );
        }
      }
    } else {
      await updateAudioGenerationStatus(
        record.id,
        result.status,
        result.status === "completed" ? 100 : 0,
        result.errorMessage,
        lease,
      );
    }
  } catch (error) {
    if (isMissingGenerationRecord(error) || isGenerationLeaseLost(error)) return;
    if (error instanceof NodeExecutionCancelledError) return;
    recordGenerationFailure("audio", record.id, error);
    await releaseStorageCleanupsForRequest(undefined, record.requestId).catch(() => undefined);
    if (record.graphNodeId && await nodeExecutionRepository.settleCancelledIfRequested("audio", record.id, lease)) return;
    try {
      await updateAudioGenerationStatus(
        record.id,
        "failed",
        0,
        error instanceof Error ? error.message : ERROR_AUDIO_GENERATION_FAILED,
        lease,
      );
    } catch (statusError) {
      if (isMissingGenerationRecord(statusError) || isGenerationLeaseLost(statusError)) return;
      throw statusError;
    }
  } finally {
    monitor.stop();
  }
}

export async function processImageJobs({
  awaitCompletion = true,
  refillOnCompletion = false,
  maxClaims,
}: ProcessGenerationJobsOptions = {}) {
  if (isGenerationWorkerStopping()) return 0;
  const availableLocalSlots = Math.max(
    GENERATION_EXECUTION_GLOBAL_LIMIT - inFlightGenerationJobs.size,
    0,
  );
  if (availableLocalSlots === 0) return 0;
  const runtime = await getImageRuntimeState();
  if (!runtime) return 0;
  if (isGenerationWorkerStopping()) return 0;
  const claimLimit = Math.min(
    availableLocalSlots,
    maxClaims === undefined ? availableLocalSlots : Math.max(0, Math.floor(maxClaims)),
  );
  if (claimLimit === 0) return 0;
  const claimedRecords = await claimPendingGenerationJobs({
    mediaType: "image",
    modelKeys: runtime.modelKeys,
    defaultKey: runtime.defaultKey,
    getModelLimit: (model) => runtime.modelMap.get(model)?.concurrentLimit ?? 1,
    maxClaims: claimLimit,
  });
  const refill = refillOnCompletion
    ? () => pumpGenerationJobs()
    : undefined;
  const executions = claimedRecords.map((record) =>
    scheduleGenerationJob(
      `image:${record.id}`,
      () => handleImageRecord(record, runtime),
      refill,
    ),
  );
  if (awaitCompletion) await Promise.all(executions);
  return claimedRecords.length;
}

export async function processVideoJobs({
  awaitCompletion = true,
  refillOnCompletion = false,
  maxClaims,
}: ProcessGenerationJobsOptions = {}) {
  if (isGenerationWorkerStopping()) return 0;
  const availableLocalSlots = Math.max(
    GENERATION_EXECUTION_GLOBAL_LIMIT - inFlightGenerationJobs.size,
    0,
  );
  if (availableLocalSlots === 0) return 0;
  const runtime = await getVideoRuntimeState();
  if (!runtime) return 0;
  if (isGenerationWorkerStopping()) return 0;
  const claimLimit = Math.min(
    availableLocalSlots,
    maxClaims === undefined ? availableLocalSlots : Math.max(0, Math.floor(maxClaims)),
  );
  if (claimLimit === 0) return 0;
  const claimedRecords = await claimPendingGenerationJobs({
    mediaType: "video",
    modelKeys: runtime.modelKeys,
    defaultKey: runtime.defaultKey,
    getModelLimit: (model) => runtime.modelMap.get(model)?.concurrentLimit ?? 1,
    maxClaims: claimLimit,
  });
  const refill = refillOnCompletion
    ? () => pumpGenerationJobs()
    : undefined;
  const executions = claimedRecords.map((record) =>
    scheduleGenerationJob(
      `video:${record.id}`,
      () => handleVideoRecord(record, runtime),
      refill,
    ),
  );
  if (awaitCompletion) await Promise.all(executions);
  return claimedRecords.length;
}

export async function processAudioJobs({
  awaitCompletion = true,
  refillOnCompletion = false,
  maxClaims,
}: ProcessGenerationJobsOptions = {}) {
  if (isGenerationWorkerStopping()) return 0;
  const availableLocalSlots = Math.max(
    GENERATION_EXECUTION_GLOBAL_LIMIT - inFlightGenerationJobs.size,
    0,
  );
  if (availableLocalSlots === 0) return 0;
  const runtime = await getAudioRuntimeState();
  if (!runtime) return 0;
  if (isGenerationWorkerStopping()) return 0;
  const claimLimit = Math.min(
    availableLocalSlots,
    maxClaims === undefined ? availableLocalSlots : Math.max(0, Math.floor(maxClaims)),
  );
  if (claimLimit === 0) return 0;
  const claimedRecords = await claimPendingGenerationJobs({
    mediaType: "audio",
    modelKeys: runtime.modelKeys,
    defaultKey: runtime.defaultKey,
    getModelLimit: (model) => runtime.modelMap.get(model)?.concurrentLimit ?? 1,
    maxClaims: claimLimit,
  });
  const refill = refillOnCompletion
    ? () => pumpGenerationJobs()
    : undefined;
  const executions = claimedRecords.map((record) =>
    scheduleGenerationJob(
      `audio:${record.id}`,
      () => handleAudioRecord(record, runtime),
      refill,
    ),
  );
  if (awaitCompletion) await Promise.all(executions);
  return claimedRecords.length;
}

type GenerationScheduler = (
  options: ProcessGenerationJobsOptions,
) => Promise<number>;

const generationSchedulers: readonly GenerationScheduler[] = [
  processImageJobs,
  processVideoJobs,
  processAudioJobs,
];
let nextGenerationSchedulerIndex = 0;
let generationPump: Promise<void> | null = null;

export async function pumpGenerationJobs() {
  if (isGenerationWorkerStopping()) return;
  if (generationPump) return generationPump;

  generationPump = (async () => {
    let emptySchedulers = 0;
    while (
      !isGenerationWorkerStopping() &&
      inFlightGenerationJobs.size < GENERATION_EXECUTION_GLOBAL_LIMIT &&
      emptySchedulers < generationSchedulers.length
    ) {
      const schedulerIndex = nextGenerationSchedulerIndex;
      nextGenerationSchedulerIndex =
        (nextGenerationSchedulerIndex + 1) % generationSchedulers.length;
      const claimed = await generationSchedulers[schedulerIndex]!({
        awaitCompletion: false,
        maxClaims: 1,
      });
      if (claimed > 0) {
        emptySchedulers = 0;
      } else {
        emptySchedulers += 1;
      }
    }
  })().finally(() => {
    generationPump = null;
  });
  return generationPump;
}

export function startGenerationWorker() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return;
  }

  const globalForWorker = globalThis as WorkerGlobal;
  if (globalForWorker.__generationWorkerStopping) return;
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
    globalForWorker.__generationWorkerLastHeartbeatAt = Date.now();
    if (globalForWorker.__generationWorkerRunning) return;
    globalForWorker.__generationWorkerRunning = true;
    try {
      await pumpGenerationJobs();
    } catch (error) {
      recordWorkerFailure("generation.pass");
      logStructured("worker.pass.failure", {
        worker: "generation",
        errorType: error instanceof Error ? error.name : typeof error,
      }, "error");
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

function isGenerationWorkerStopping() {
  return Boolean((globalThis as WorkerGlobal).__generationWorkerStopping);
}

export async function stopGenerationWorker({
  drainTimeoutMs = GENERATION_WORKER_DRAIN_TIMEOUT_MS,
}: { drainTimeoutMs?: number } = {}) {
  const globalForWorker = globalThis as WorkerGlobal;
  if (globalForWorker.__generationWorkerStopPromise) {
    return globalForWorker.__generationWorkerStopPromise;
  }

  globalForWorker.__generationWorkerStopping = true;
  if (globalForWorker.__generationWorkerInterval) {
    clearInterval(globalForWorker.__generationWorkerInterval);
    globalForWorker.__generationWorkerInterval = undefined;
  }

  const draining = Promise.allSettled([
    ...(generationPump ? [generationPump] : []),
    ...inFlightGenerationJobs.values(),
  ]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, drainTimeoutMs));
    timer.unref?.();
  });
  globalForWorker.__generationWorkerStopPromise = Promise.race([draining, timeout]);
  return globalForWorker.__generationWorkerStopPromise;
}

export function getGenerationWorkerState() {
  const globalForWorker = globalThis as WorkerGlobal;
  return {
    started: Boolean(globalForWorker.__generationWorkerStarted),
    stopping: Boolean(globalForWorker.__generationWorkerStopping),
    running: Boolean(globalForWorker.__generationWorkerRunning),
    inFlight: inFlightGenerationJobs.size,
    pumpRunning: Boolean(generationPump),
    lastHeartbeatAt: globalForWorker.__generationWorkerLastHeartbeatAt
      ? new Date(globalForWorker.__generationWorkerLastHeartbeatAt).toISOString()
      : null,
    heartbeatAgeSeconds: globalForWorker.__generationWorkerLastHeartbeatAt
      ? Math.max(0, Math.floor((Date.now() - globalForWorker.__generationWorkerLastHeartbeatAt) / 1000))
      : null,
  };
}
