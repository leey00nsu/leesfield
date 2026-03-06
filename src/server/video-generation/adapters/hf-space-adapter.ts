import { Client, handle_file } from "@gradio/client";
import { z } from "zod";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";
import {
  resolveHfSpaceFileReference,
  selectPreferredHfSpaceFileReference,
} from "@/server/hf-space/file-reference-resolver";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { VideoModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import {
  getRuntimeVideoParamRange,
  resolveRuntimeVideoDefaults,
  resolveRuntimeVideoSupportsInitImage,
  type RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

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

function toRuntimeVideoModel(model: VideoModelCatalogItem): RuntimeVideoModel {
  return model as RuntimeVideoModel;
}

async function getCatalogVideoModel(modelKey: string) {
  const catalog = await getModelCatalog({ includeInactive: true });
  const model = catalog.find(
    (item): item is VideoModelCatalogItem =>
      item.type === "video" && item.key === modelKey,
  );
  if (!model) {
    throw new Error(`VIDEO_MODEL_NOT_FOUND:${modelKey}`);
  }
  return toRuntimeVideoModel(model);
}

async function getSpaceConfig(modelKey: VideoGenerationFormValues["model"]) {
  const model = await getCatalogVideoModel(modelKey);
  if (model.provider !== "hf_space") {
    throw new Error("VIDEO_PROVIDER_NOT_SUPPORTED");
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
  if (tokenValue && (!tokenValue.startsWith("hf_") || tokenValue.length <= 3)) {
    throw new Error("INVALID_HF_TOKEN_FORMAT");
  }

  const config: SpaceConfig = {
    spaceId: providerConfig.space_id,
    apiName: providerConfig.api_name,
    token: tokenValue as `hf_${string}` | undefined,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
    spaceUrl: resolveSpaceUrl(providerConfig.space_id, providerConfig.space_url),
  };

  return { config, model };
}

async function getClient(config: SpaceConfig) {
  let cached = clientCache.get(config.spaceId);
  if (!cached) {
    cached = Client.connect(config.spaceId, {
      token: config.token,
    });
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
        stage ? `HF_SPACE_NOT_READY:${stage}` : "HF_SPACE_NOT_READY"
      );
    }
  } catch (error) {
    statusCache.set(config.spaceId, { checkedAt: Date.now(), ok: false });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeApiName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/generate_video";
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
  return resolved;
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

async function detectImageMime(buffer: Buffer): Promise<string | null> {
  const { fileTypeFromBuffer } = await import("file-type");
  const result = await fileTypeFromBuffer(buffer);
  if (!result || !result.mime.startsWith("image/")) {
    return null;
  }
  return result.mime;
}

async function resolveInitImageBuffer(source: string) {
  if (source.startsWith("data:")) {
    const [header, payload] = source.split(",", 2);
    if (!payload) {
      throw new Error("HF_SPACE_IMAGE_INVALID");
    }
    if (!header?.includes(";base64")) {
      throw new Error("HF_SPACE_IMAGE_NOT_BASE64");
    }
    const mimeMatch = header?.match(/data:(.*?);base64/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const buffer = Buffer.from(payload, "base64");
    return { buffer, mime };
  }

  let resolved: URL;
  try {
    resolved = new URL(source);
  } catch {
    throw new Error("HF_SPACE_IMAGE_INVALID");
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error("HF_SPACE_IMAGE_INVALID");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FILE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(resolved.toString(), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("HF_SPACE_IMAGE_FETCH_FAILED");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "image/png";
    if (contentType.startsWith("image/")) {
      return { buffer, mime: contentType };
    }
    const detected = await detectImageMime(buffer);
    if (!detected) {
      throw new Error("HF_SPACE_IMAGE_INVALID");
    }
    return { buffer, mime: detected };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchVideoDataUrl(
  fileRef: string | ReturnType<typeof resolveHfSpaceFileReference>,
  spaceUrl: string,
  timeoutMs: number = FILE_FETCH_TIMEOUT_MS
) {
  const resolved =
    typeof fileRef === "string"
      ? resolveHfSpaceFileReference(fileRef, spaceUrl)
      : fileRef;
  const normalized = resolved.normalizedUrl;
  if (normalized.startsWith("data:")) {
    return normalized;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(normalized, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("HF_SPACE_VIDEO_FETCH_FAILED");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "video/mp4";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("HF_SPACE_VIDEO_FETCH_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const hfSpaceVideoAdapter: VideoGenerationAdapter = {
  mapError(error: unknown) {
    if (!(error instanceof Error)) {
      return "비디오 생성에 실패했습니다.";
    }
    const message = error.message || "";
    const lower = message.toLowerCase();
    if (lower.startsWith("hf_space_not_ready")) {
      return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_status_fetch_failed") {
      return "HF Space 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_init_image_unsupported") {
      return "선택한 모델은 이미지 입력을 지원하지 않습니다.";
    }
    if (lower === "hf_space_image_not_base64") {
      return "업로드한 이미지 형식이 올바르지 않습니다. 다른 이미지를 사용해주세요.";
    }
    if (lower === "hf_space_video_fetch_timeout") {
      return "생성된 비디오 다운로드 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
    }
    if (lower === "hf_space_request_timeout") {
      return "비디오 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
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
        return message || "비디오 생성에 실패했습니다.";
    }
  },
  async generate(payload: VideoGenerationFormValues) {
    const { config, model } = await getSpaceConfig(payload.model);
    const supportsInitImage = resolveRuntimeVideoSupportsInitImage(model);
    const initImage = payload.initImage?.trim() ? payload.initImage : null;

    if (supportsInitImage && !initImage) {
      throw new Error("INIT_IMAGE_REQUIRED");
    }
    if (!supportsInitImage && initImage) {
      throw new Error("HF_SPACE_INIT_IMAGE_UNSUPPORTED");
    }

    await ensureSpaceRunning(config);
    const client = await getClient(config);

    const defaults = resolveRuntimeVideoDefaults(model);
    const durationRange = getRuntimeVideoParamRange(model, "durationSec");
    const stepsRange = getRuntimeVideoParamRange(model, "steps");
    const guidanceRange = getRuntimeVideoParamRange(model, "guidanceScale");
    const durationSeconds = clampNumber(
      payload.durationSec ?? defaults.durationSec,
      durationRange,
    );
    const guidanceScale = clampNumber(
      Number(payload.guidanceScale ?? defaults.guidanceScale),
      guidanceRange,
    );
    const steps = clampNumber(
      Number(payload.steps ?? defaults.steps),
      stepsRange,
    );
    const { seedValue, randomize } = parseSeed(payload.seed);
    const apiName = normalizeApiName(config.apiName || "/generate_video");
    const requestPayload: Record<string, unknown> = {
      prompt: payload.prompt,
      steps: Math.round(steps),
      duration_seconds: durationSeconds,
      guidance_scale: guidanceScale,
      guidance_scale_2: guidanceScale,
      seed: seedValue,
      randomize_seed: randomize,
    };

    if (initImage) {
      const { buffer, mime } = await resolveInitImageBuffer(initImage);
      const imageFile = await handle_file(new Blob([buffer], { type: mime }));
      requestPayload.input_image = imageFile;
    }

    const predictPromise = client.predict(apiName, requestPayload);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("HF_SPACE_REQUEST_TIMEOUT")),
        config.timeoutMs
      );
    });

    let result: Awaited<typeof predictPromise>;
    try {
      result = await Promise.race([predictPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    const data = Array.isArray(result?.data) ? result.data : result;
    const videoFile = Array.isArray(data) ? data[0] : data;
    const fileRef = selectPreferredHfSpaceFileReference(videoFile, {
      spaceUrl: config.spaceUrl,
      maxDepth: 4,
    });
    if (!fileRef) {
      throw new Error("HF_SPACE_RESPONSE_INVALID");
    }

    const dataUrl = await fetchVideoDataUrl(
      fileRef,
      config.spaceUrl,
      Math.min(config.timeoutMs, FILE_FETCH_TIMEOUT_MS)
    );
    return {
      videos: [dataUrl],
      meta: {
        duration_sec: durationSeconds,
        fps: defaults?.fps ?? 16,
      },
    };
  },
};
