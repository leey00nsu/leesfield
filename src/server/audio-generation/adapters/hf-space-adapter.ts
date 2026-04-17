import { Client, handle_file } from "@gradio/client";
import { z } from "zod";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationAdapter } from "@/server/audio-generation/adapters/types";
import {
  resolveHfSpaceFileReferenceCandidates,
  resolveHfSpaceFileReference,
} from "@/server/hf-space/file-reference-resolver";
import { scoreEndpointCandidate } from "@/server/hf-space/endpoint-scoring";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { AudioModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import {
  getRuntimeAudioParamRange,
  resolveRuntimeAudioDefaults,
  type RuntimeAudioModel,
} from "@/shared/model-catalog/runtime-utils";
import { resolveAudioMime } from "@/shared/lib/audio-file";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_CHECK_TTL_MS = 30_000;
const STATUS_CHECK_TIMEOUT_MS = 5_000;
const FILE_FETCH_TIMEOUT_MS = 60_000;

const hfSpaceConfigSchema = z
  .object({
    space_id: z.string().min(1),
    api_name: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
    space_url: z.string().min(1).optional(),
  })
  .passthrough();

type SpaceConfig = {
  spaceId: string;
  apiName: string;
  token?: `hf_${string}`;
  timeoutMs: number;
  spaceUrl: string;
};

type EndpointParameter = {
  parameter_name?: string;
  label?: string;
  parameter_default?: unknown;
  hidden?: boolean;
  component?: string;
};

type EndpointInfo = {
  parameters?: EndpointParameter[];
};

type ViewApiResponse = {
  named_endpoints?: Record<string, EndpointInfo>;
};

type ClientConfigComponent = {
  id?: number;
  type?: string;
};

type ClientConfigDependency = {
  api_name?: string;
  outputs?: number[];
};

type ClientConfigSnapshot = {
  components?: ClientConfigComponent[];
  dependencies?: ClientConfigDependency[];
};

const clientCache = new Map<string, Promise<Client>>();
const statusCache = new Map<
  string,
  { checkedAt: number; ok: boolean | null }
>();

function resolveSpaceUrl(spaceId: string, explicit?: string) {
  if (explicit?.trim()) return explicit.trim();
  const slug = spaceId.replace("/", "-");
  return `https://${slug}.hf.space`;
}

function toRuntimeAudioModel(model: AudioModelCatalogItem): RuntimeAudioModel {
  return model as RuntimeAudioModel;
}

async function getCatalogAudioModel(modelKey: string) {
  const catalog = await getModelCatalog({ includeInactive: true });
  const model = catalog.find(
    (item): item is AudioModelCatalogItem =>
      item.type === "audio" && item.key === modelKey,
  );
  if (!model) {
    throw new Error(`AUDIO_MODEL_NOT_FOUND:${modelKey}`);
  }
  return toRuntimeAudioModel(model);
}

async function getSpaceConfig(modelKey: AudioGenerationFormValues["model"]) {
  const model = await getCatalogAudioModel(modelKey);
  if (model.provider !== "hf_space") {
    throw new Error("AUDIO_PROVIDER_NOT_SUPPORTED");
  }
  const parsedConfig = hfSpaceConfigSchema.safeParse(model.providerConfig);
  if (!parsedConfig.success) {
    throw new Error("HF_SPACE_CONFIG_INVALID");
  }
  const providerConfig = parsedConfig.data;
  const timeoutRaw = Number(providerConfig.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const tokenValue =
    process.env.HF_TOKEN?.trim() ||
    process.env.HUGGINGFACEHUB_API_TOKEN?.trim() ||
    undefined;
  if (tokenValue && !tokenValue.startsWith("hf_")) {
    throw new Error("INVALID_HF_TOKEN_FORMAT");
  }

  const config: SpaceConfig = {
    spaceId: providerConfig.space_id,
    apiName: providerConfig.api_name,
    token: tokenValue as `hf_${string}` | undefined,
    timeoutMs:
      Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? timeoutRaw
        : DEFAULT_TIMEOUT_MS,
    spaceUrl: resolveSpaceUrl(providerConfig.space_id, providerConfig.space_url),
  };

  return { config, model };
}

async function getClient(config: SpaceConfig) {
  let cached = clientCache.get(config.spaceId);
  if (!cached) {
    cached = Client.connect(config.spaceId, { token: config.token });
    clientCache.set(config.spaceId, cached);
  }
  try {
    return await cached;
  } catch (error) {
    clientCache.delete(config.spaceId);
    throw error;
  }
}

function resolveSpaceApiUrl(spaceId: string) {
  return `https://huggingface.co/api/spaces/${spaceId}`;
}

function extractRuntimeStage(payload: Record<string, unknown>) {
  const runtime = payload.runtime as Record<string, unknown> | undefined;
  const candidates = [
    runtime?.stage,
    runtime?.status,
    payload.stage,
    payload.status,
    payload.state,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function ensureSpaceRunning(config: SpaceConfig) {
  const now = Date.now();
  const cached = statusCache.get(config.spaceId);
  if (
    cached &&
    cached.checkedAt > 0 &&
    now - cached.checkedAt < STATUS_CHECK_TTL_MS &&
    cached.ok !== null
  ) {
    if (!cached.ok) {
      throw new Error("HF_SPACE_NOT_READY");
    }
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_CHECK_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  try {
    const response = await fetch(resolveSpaceApiUrl(config.spaceId), {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      statusCache.set(config.spaceId, { checkedAt: Date.now(), ok: false });
      throw new Error("HF_SPACE_STATUS_FETCH_FAILED");
    }
    const data = (await response.json()) as Record<string, unknown>;
    const stage = extractRuntimeStage(data);
    const normalized = stage?.toUpperCase() ?? "";
    const ok = normalized === "RUNNING" || normalized === "READY";
    statusCache.set(config.spaceId, { checkedAt: Date.now(), ok });
    if (!ok) {
      throw new Error(
        stage ? `HF_SPACE_NOT_READY:${stage}` : "HF_SPACE_NOT_READY",
      );
    }
  } catch (error) {
    statusCache.set(config.spaceId, { checkedAt: Date.now(), ok: false });
    if (controller.signal.aborted) {
      throw new Error("HF_SPACE_STATUS_FETCH_FAILED");
    }
    if (error instanceof Error && error.message === "HF_SPACE_STATUS_FETCH_FAILED") {
      throw error;
    }
    throw new Error("HF_SPACE_STATUS_FETCH_FAILED");
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message || "";
  }
  if (!error || typeof error !== "object") {
    return "";
  }

  const record = error as Record<string, unknown>;
  const candidates = [
    record.message,
    record.title,
    record.original_msg,
    record.stage,
  ];

  return candidates
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();
}

function normalizeApiName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/generate_audio";
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

function clampNumber(value: number, range: { min: number; max: number; step: number }) {
  if (!Number.isFinite(value)) return range.min;
  let resolved = Math.min(range.max, Math.max(range.min, value));
  if (range.step > 0) {
    const steps = Math.round((resolved - range.min) / range.step);
    resolved = range.min + steps * range.step;
  }
  return Math.min(range.max, Math.max(range.min, resolved));
}

function parseSeed(seed?: string) {
  if (!seed?.trim()) {
    return { seedValue: 0, randomize: true };
  }
  const parsed = Number(seed);
  const isValid =
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= Number.MAX_SAFE_INTEGER;
  return { seedValue: isValid ? parsed : 0, randomize: !isValid };
}

function getEndpointInfoFromSnapshot(
  apiInfo: ViewApiResponse | null,
  apiName: string,
) {
  if (!apiInfo?.named_endpoints) return null;
  return (
    apiInfo.named_endpoints[apiName] ??
    apiInfo.named_endpoints[apiName.replace(/^\//, "")] ??
    null
  );
}

function resolveComponentType(component?: ClientConfigComponent | null) {
  const raw = component?.type ?? "";
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

function normalizeApiKey(apiName: string) {
  return normalizeApiName(apiName);
}

function buildOutputTypesByApiName(config: ClientConfigSnapshot | null | undefined) {
  const componentsById = new Map(
    (config?.components ?? []).map((component) => [component.id, component]),
  );
  const outputTypesByApiName = new Map<string, string[]>();

  for (const dependency of config?.dependencies ?? []) {
    const rawApiName = dependency.api_name?.trim();
    if (!rawApiName) {
      continue;
    }
    const apiName = normalizeApiKey(rawApiName);
    const outputTypes = (dependency.outputs ?? [])
      .map((id) => componentsById.get(id))
      .map((component) => resolveComponentType(component))
      .filter(Boolean);
    outputTypesByApiName.set(apiName, outputTypes);
  }

  return outputTypesByApiName;
}

function resolveApiCandidates(
  apiInfo: ViewApiResponse | null,
  requestedApiName: string,
  outputTypesByApiName?: Map<string, string[]>,
) {
  const namedEndpoints = apiInfo?.named_endpoints ?? {};
  const entries = Object.entries(namedEndpoints);
  if (!entries.length) {
    return [normalizeApiName(requestedApiName)];
  }

  const normalizedRequested = normalizeApiName(requestedApiName);
  const scoredCandidates = entries
    .map(([name, endpoint]) => ({
      name,
      score: scoreEndpointCandidate(
        name,
        endpoint,
        outputTypesByApiName?.get(normalizeApiKey(name)) ?? [],
      ),
    }))
    .sort((left, right) => right.score - left.score);

  const ordered: string[] = [];
  const requestedCandidate = scoredCandidates.find(
    ({ name }) => normalizeApiName(name) === normalizedRequested,
  );
  if (requestedCandidate) {
    ordered.push(requestedCandidate.name);
  }

  for (const candidate of scoredCandidates) {
    if (!ordered.includes(candidate.name)) {
      ordered.push(candidate.name);
    }
  }

  return ordered;
}

function classifyPredictError(error: unknown) {
  const message = extractErrorText(error).toLowerCase();
  if (!message) return null;

  const parameterIndicators = [
    "unexpected keyword",
    "unknown argument",
    "missing required positional argument",
    "missing 1 required positional argument",
    "positional argument",
    "got multiple values",
    "invalid parameter",
    "required argument",
  ];
  const positionalArgumentPattern =
    /takes .* positional arguments?.* (was|were) given/;
  if (
    parameterIndicators.some((indicator) => message.includes(indicator)) ||
    positionalArgumentPattern.test(message)
  ) {
    return "HF_SPACE_PARAMETER_INVALID";
  }

  const endpointPatterns = [
    /\b404\b/,
    /api_name .* not found/,
    /unknown api[_ ]?name/,
    /not a valid api[_ ]?name/,
    /no endpoint named/,
    /no function named/,
    /endpoint .* not found/,
  ];
  if (endpointPatterns.some((pattern) => pattern.test(message))) {
    return "HF_SPACE_ENDPOINT_INVALID";
  }

  return null;
}

function normalizeLookupKey(parameter: EndpointParameter) {
  return `${parameter.parameter_name ?? ""} ${parameter.label ?? ""}`
    .toLowerCase()
    .replace(/[_\-]+/g, " ");
}

function resolveRequestParameterKey(parameter: EndpointParameter) {
  const parameterName =
    typeof parameter.parameter_name === "string"
      ? parameter.parameter_name.trim()
      : "";
  if (parameterName.length > 0) {
    return parameterName;
  }

  return typeof parameter.label === "string" ? parameter.label.trim() : "";
}

function getRetryableErrorPriority(message: string) {
  switch (message) {
    case "HF_SPACE_PARAMETER_INVALID":
      return 3;
    case "HF_SPACE_ENDPOINT_INVALID":
      return 2;
    case "HF_SPACE_RESPONSE_INVALID":
      return 1;
    case "HF_SPACE_REQUEST_TIMEOUT":
      return 0;
    default:
      return -1;
  }
}

function keepMoreSpecificRetryableError(
  current: Error | null,
  nextMessage: string,
) {
  const next = new Error(nextMessage);
  if (!current) {
    return next;
  }

  return getRetryableErrorPriority(next.message) >
      getRetryableErrorPriority(current.message)
    ? next
    : current;
}

function resolveParamValue(
  parameter: EndpointParameter,
  payload: AudioGenerationFormValues,
  defaults: ReturnType<typeof resolveRuntimeAudioDefaults>,
  speed: number,
  seed: { seedValue: number; randomize: boolean },
) {
  const lookup = normalizeLookupKey(parameter);

  if (
    lookup.includes("reference transcript") ||
    lookup.includes("reference text") ||
    lookup.includes("ref text") ||
    lookup.includes("ref_text")
  ) {
    return payload.referenceText?.trim() || parameter.parameter_default;
  }

  if (
    lookup.includes("reference audio") ||
    lookup.includes("ref audio") ||
    lookup.includes("ref_audio")
  ) {
    return payload.inputAudio ? toGradioInputAudio(payload.inputAudio) : parameter.parameter_default;
  }

  if (lookup.includes("reference preset") || lookup.includes("ref preset") || lookup.includes("ref_preset")) {
    return payload.referencePreset?.trim() || defaults.referencePreset || parameter.parameter_default;
  }

  if (
    lookup.includes("prompt") ||
    lookup.includes("text") ||
    lookup.includes("script") ||
    lookup.includes("message")
  ) {
    return payload.prompt;
  }

  if (lookup.includes("language")) {
    return payload.language?.trim() || defaults.language || parameter.parameter_default;
  }

  if (lookup.includes("stream mode") || lookup.includes("stream_mode")) {
    return payload.streamMode ?? defaults.streamMode ?? parameter.parameter_default;
  }

  if (lookup.includes("custom instruction") || lookup.includes("custom_instruct")) {
    return payload.customInstruction?.trim() || parameter.parameter_default;
  }

  if (lookup.includes("voice instruction") || lookup.includes("voice_instruct")) {
    return payload.voiceInstruction?.trim() || parameter.parameter_default;
  }

  if (lookup.includes("xvec")) {
    return payload.xvecOnly ?? defaults.xvecOnly ?? parameter.parameter_default;
  }

  if (lookup.includes("chunk size") || lookup.includes("chunk_size")) {
    return payload.chunkSize ?? defaults.chunkSize ?? parameter.parameter_default;
  }

  if (lookup.includes("temperature")) {
    return payload.temperature ?? defaults.temperature ?? parameter.parameter_default;
  }

  if (lookup.includes("top k") || lookup.includes("top_k")) {
    return payload.topK ?? defaults.topK ?? parameter.parameter_default;
  }

  if (lookup.includes("repetition penalty") || lookup.includes("repetition_penalty")) {
    return payload.repetitionPenalty ?? defaults.repetitionPenalty ?? parameter.parameter_default;
  }

  if (lookup === "mode" || lookup.includes("generation mode")) {
    return (
      payload.modeChoice?.trim() ||
      (payload.inputAudio ? "voice_clone" : "") ||
      defaults.modeChoice ||
      parameter.parameter_default
    );
  }

  if (
    lookup.includes("voice") ||
    lookup.includes("speaker") ||
    lookup.includes("spk")
  ) {
    return (
      payload.speaker?.trim() ||
      payload.voice?.trim() ||
      defaults.speaker ||
      defaults.voice ||
      parameter.parameter_default
    );
  }

  if (lookup.includes("speed") || lookup.includes("rate")) {
    return speed;
  }

  if (lookup.includes("seed") && lookup.includes("random")) {
    return seed.randomize;
  }

  if (lookup.includes("seed")) {
    return seed.seedValue;
  }

  return parameter.parameter_default;
}

function buildRequestPayload(
  apiInfo: ViewApiResponse | null,
  apiName: string,
  payload: AudioGenerationFormValues,
  defaults: ReturnType<typeof resolveRuntimeAudioDefaults>,
  speed: number,
  seed: { seedValue: number; randomize: boolean },
) {
  const endpoint = getEndpointInfoFromSnapshot(apiInfo, apiName);
  const parameters =
    endpoint?.parameters?.filter(
      (parameter) => {
        const component =
          typeof parameter.component === "string"
            ? parameter.component.trim().toLowerCase()
            : "";
        const requestKey = resolveRequestParameterKey(parameter);

        return (
          requestKey.length > 0 &&
          parameter.hidden !== true &&
          component !== "state"
        );
      },
    ) ?? [];

  if (!parameters?.length) {
    const fallbackPayload: Record<string, unknown> = {
      prompt: payload.prompt,
    };

    if (payload.voice?.trim()) {
      fallbackPayload.voice = payload.voice.trim();
    }
    if (payload.speaker?.trim()) {
      fallbackPayload.speaker = payload.speaker.trim();
    }
    if (typeof payload.speed === "number") {
      fallbackPayload.speed = speed;
    }
    if (payload.modeChoice?.trim()) {
      fallbackPayload.mode = payload.modeChoice.trim();
    } else if (payload.inputAudio) {
      fallbackPayload.mode = "voice_clone";
    }
    if (payload.language?.trim()) {
      fallbackPayload.language = payload.language.trim();
    }
    if (typeof payload.streamMode === "boolean") {
      fallbackPayload.stream_mode = payload.streamMode;
    }
    if (payload.referencePreset?.trim()) {
      fallbackPayload.ref_preset = payload.referencePreset.trim();
    }
    if (payload.inputAudio) {
      fallbackPayload.ref_audio_path = toGradioInputAudio(payload.inputAudio);
    }
    if (payload.referenceText?.trim()) {
      fallbackPayload.ref_text = payload.referenceText.trim();
    }
    if (payload.customInstruction?.trim()) {
      fallbackPayload.custom_instruct = payload.customInstruction.trim();
    }
    if (payload.voiceInstruction?.trim()) {
      fallbackPayload.voice_instruct = payload.voiceInstruction.trim();
    }
    if (typeof payload.xvecOnly === "boolean") {
      fallbackPayload.xvec_only = payload.xvecOnly;
    }
    if (typeof payload.chunkSize === "number") {
      fallbackPayload.chunk_size = payload.chunkSize;
    }
    if (typeof payload.temperature === "number") {
      fallbackPayload.temperature = payload.temperature;
    }
    if (typeof payload.topK === "number") {
      fallbackPayload.top_k = payload.topK;
    }
    if (typeof payload.repetitionPenalty === "number") {
      fallbackPayload.repetition_penalty = payload.repetitionPenalty;
    }
    if (!seed.randomize) {
      fallbackPayload.seed = seed.seedValue;
    }

    return fallbackPayload;
  }

  const requestPayload: Record<string, unknown> = {};

  parameters.forEach((parameter) => {
    const key = resolveRequestParameterKey(parameter);

    requestPayload[key] = resolveParamValue(
      parameter,
      payload,
      defaults,
      speed,
      seed,
    );
  });

  return requestPayload;
}

function looksLikeAudioPath(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:audio/")) return true;
  if (trimmed.includes("file=") || trimmed.includes("/file/")) return true;
  if (/\.(mp3|wav|flac|ogg|m4a|aac|webm)(\?|$)/.test(trimmed)) return true;
  return false;
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("HF_SPACE_INPUT_AUDIO_INVALID");
  }
  return new Blob([Buffer.from(match[2], "base64")], {
    type: match[1],
  });
}

function toGradioInputAudio(inputAudio: string) {
  if (inputAudio.startsWith("data:")) {
    return handle_file(dataUrlToBlob(inputAudio));
  }
  return handle_file(inputAudio);
}

async function fetchAudioDataUrl(
  fileRef: string | ReturnType<typeof resolveHfSpaceFileReference>,
  spaceUrl: string,
  timeoutMs: number = FILE_FETCH_TIMEOUT_MS,
) {
  const resolvedFile =
    typeof fileRef === "string"
      ? resolveHfSpaceFileReference(fileRef, spaceUrl)
      : fileRef;
  const normalized = resolvedFile.normalizedUrl;
  if (normalized.startsWith("data:")) {
    return normalized;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(normalized, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("HF_SPACE_AUDIO_FETCH_FAILED");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = resolveAudioMime({
      contentType: response.headers.get("content-type"),
      sourceUrl: normalized,
      buffer,
    });
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("HF_SPACE_AUDIO_FETCH_TIMEOUT");
    }
    throw new Error("HF_SPACE_AUDIO_FETCH_FAILED");
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractDurationSec(value: unknown, depth = 0): number | undefined {
  if (depth > 4 || value === null || value === undefined) return undefined;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractDurationSec(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const candidates = [
    record.duration_sec,
    record.durationSec,
    record.duration,
    record.audio_duration,
    record.audioDuration,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  for (const nested of Object.values(record)) {
    const found = extractDurationSec(nested, depth + 1);
    if (found) return found;
  }

  return undefined;
}

export const hfSpaceAudioAdapter: AudioGenerationAdapter = {
  mapError(error: unknown) {
    const message = extractErrorText(error);
    if (!message) {
      return "오디오 생성에 실패했습니다.";
    }
    const lower = message.toLowerCase();

    if (lower.startsWith("hf_space_not_ready")) {
      return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_status_fetch_failed") {
      return "HF Space 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_audio_fetch_failed") {
      return "생성된 오디오 다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_audio_fetch_timeout") {
      return "생성된 오디오 다운로드 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_request_timeout") {
      return "오디오 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_response_invalid") {
      return "HF Space 응답에서 오디오 결과를 찾지 못했습니다.";
    }
    if (lower === "hf_space_endpoint_invalid") {
      return "HF Space 생성 엔드포인트를 찾지 못했습니다. 모델 구성을 다시 가져오세요.";
    }
    if (lower === "hf_space_parameter_invalid") {
      return "HF Space 입력 파라미터가 현재 엔드포인트와 맞지 않습니다. 모델 구성을 다시 가져오세요.";
    }
    if (lower === "hf_space_config_invalid") {
      return "오디오 모델 설정이 올바르지 않습니다.";
    }
    if (lower === "fetch failed") {
      return "HF Space 통신 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "invalid_hf_token_format") {
      return "HF 토큰 형식이 올바르지 않습니다.";
    }
    if (lower.startsWith("audio_model_not_found:")) {
      return "선택한 오디오 모델을 찾을 수 없습니다.";
    }

    let code: string | null = null;
    if (
      lower.includes("quota") ||
      lower.includes("exceed") ||
      lower.includes("limit") ||
      lower.includes("daily") ||
      lower.includes("zero gpu") ||
      lower.includes("zerogpu")
    ) {
      code = "HF_SPACE_QUOTA_EXCEEDED";
    } else if (lower.includes("queue") || lower.includes("queued")) {
      code = "HF_SPACE_QUEUE_FULL";
    } else if (
      lower.includes("too many requests") ||
      lower.includes("rate limit") ||
      lower.includes("429")
    ) {
      code = "HF_SPACE_RATE_LIMITED";
    } else if (
      lower.includes("sleep") ||
      lower.includes("paused") ||
      lower.includes("building") ||
      lower.includes("loading")
    ) {
      code = "HF_SPACE_NOT_READY";
    }

    switch (code) {
      case "HF_SPACE_QUOTA_EXCEEDED":
        return "ZeroGPU 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 다른 제공자를 사용해주세요.";
      case "HF_SPACE_QUEUE_FULL":
        return "현재 대기열이 가득합니다. 잠시 후 다시 시도해주세요.";
      case "HF_SPACE_RATE_LIMITED":
        return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
      case "HF_SPACE_NOT_READY":
        return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
      default:
        return message || "오디오 생성에 실패했습니다.";
    }
  },

  async generate(payload: AudioGenerationFormValues) {
    const { config, model } = await getSpaceConfig(payload.model);
    await ensureSpaceRunning(config);
    const client = await getClient(config);
    const apiInfo = (await client.view_api().catch(() => null)) as ViewApiResponse | null;
    const outputTypesByApiName = buildOutputTypesByApiName(
      (client as Client & { config?: ClientConfigSnapshot }).config,
    );

    const defaults = resolveRuntimeAudioDefaults(model);
    const speedRange = getRuntimeAudioParamRange(model, "speed");
    const speed = clampNumber(payload.speed ?? defaults.speed, speedRange);
    const seed = parseSeed(payload.seed);
    const apiCandidates = resolveApiCandidates(
      apiInfo,
      config.apiName || "/generate_audio",
      outputTypesByApiName,
    );

    let lastRetryableError: Error | null = null;

    for (const apiName of apiCandidates) {
      const requestPayload = buildRequestPayload(
        apiInfo,
        apiName,
        payload,
        defaults,
        speed,
        seed,
      );

      const predictPromise = client.predict(apiName, requestPayload);

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("HF_SPACE_REQUEST_TIMEOUT")),
          config.timeoutMs,
        );
      });

      let result: Awaited<typeof predictPromise>;
      try {
        result = await Promise.race([predictPromise, timeoutPromise]);
      } catch (error) {
        const classified = classifyPredictError(error);
        if (classified) {
          lastRetryableError = keepMoreSpecificRetryableError(
            lastRetryableError,
            classified,
          );
          continue;
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      const rawData = Array.isArray(result?.data) ? result.data : result;
      const audioGroups = resolveHfSpaceFileReferenceCandidates(rawData, {
        spaceUrl: config.spaceUrl,
        matcher: looksLikeAudioPath,
        maxDepth: 4,
      });

      if (audioGroups.length === 0) {
        lastRetryableError = keepMoreSpecificRetryableError(
          lastRetryableError,
          "HF_SPACE_RESPONSE_INVALID",
        );
        continue;
      }

      const dataUrls: string[] = [];
      for (const group of audioGroups) {
        let lastError: Error | null = null;
        let resolvedDataUrl: string | null = null;

        for (const candidate of group.candidates) {
          try {
            resolvedDataUrl = await fetchAudioDataUrl(
              candidate,
              config.spaceUrl,
              Math.min(config.timeoutMs, FILE_FETCH_TIMEOUT_MS),
            );
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
          }
        }

        if (!resolvedDataUrl) {
          throw lastError ?? new Error("HF_SPACE_AUDIO_FETCH_FAILED");
        }

        dataUrls.push(resolvedDataUrl);
      }

      return {
        audios: dataUrls,
        meta: {
          duration_sec: extractDurationSec(rawData),
        },
      };
    }

    if (lastRetryableError) {
      throw lastRetryableError;
    }
    throw new Error("HF_SPACE_RESPONSE_INVALID");
  },
};
