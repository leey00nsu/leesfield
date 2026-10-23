import { restoreRequest, frozenExecutionModel } from "@/server/generation-request/request-snapshot";
import { inputAssetRefsFromSnapshot } from "@/server/generation-request/generation-input-assets";
import { orderedFileSources, fileInputsFromAssets, parseFileInputPort } from "@/shared/model-catalog/file-input-ports";
import { jsonValueSchema } from "@/shared/model-catalog/gradio-contract";
import { z } from "zod";
import { getRuntimeCatalog, resolveDefaultModelKey, type RuntimeImageModel, type RuntimeVideoModel, type RuntimeAudioModel } from "@/server/model-catalog/runtime-models";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";

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

export async function getImageRuntimeState(): Promise<ImageRuntimeState | null> {
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

export async function getVideoRuntimeState(): Promise<VideoRuntimeState | null> {
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

export async function getAudioRuntimeState(): Promise<AudioRuntimeState | null> {
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
      dynamic[key] = values[0]?.ref.multiple ? orderedFileSources(values.map(item=>({url:item.url,sortOrder:item.ref.sortOrder})),Array.isArray(dynamic[key])?(dynamic[key] as unknown[]).length:0) : urls[0] ?? "";
      result.dynamicParams = dynamic;
    }
  }
  return result;
}

export async function buildImagePayload(
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
  if(frozenExecutionModel(record.requestParams,"image",params.model))return {...params,prompt:record.prompt,
    initImages: record.graphNodeId ? (await resolveGraphInputUrls(record,"image")).map(a=>a.url)
      : Array.isArray(params.initImages) ? params.initImages.filter((v): v is string => typeof v === "string") : [],
    fileInputs:fileInputsFromAssets(await resolveGraphInputUrls(record,"files"))};
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

export async function buildVideoPayload(
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
  if(frozenExecutionModel(record.requestParams,"video",params.model))return {...params,prompt:record.prompt,
    initImage: record.graphNodeId ? (await resolveGraphInputUrls(record,"video"))[0]?.url??""
      : typeof params.initImage === "string" ? params.initImage : "",
    fileInputs:fileInputsFromAssets(await resolveGraphInputUrls(record,"files"))};
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

export async function buildAudioPayload(
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
  // Snapshots omit inline reference audio with null; hydration restores real assets.
  if (params.inputAudio === null) delete params.inputAudio;
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

