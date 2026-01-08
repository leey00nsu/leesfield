import { Client, handle_file } from "@gradio/client";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import { videoModelMeta } from "@/features/video-generation/model/video-generation-schema";
import {
  getVideoModelConfig,
  getVideoParamRange,
  videoModelDefaults,
} from "@/features/video-generation/model/video-models";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_CHECK_TTL_MS = 30_000;
const STATUS_CHECK_TIMEOUT_MS = 5_000;
const FILE_FETCH_TIMEOUT_MS = 60_000;

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

function getSpaceConfig(modelKey: VideoGenerationFormValues["model"]): SpaceConfig {
  const model = getVideoModelConfig(modelKey);
  if (model.provider !== "hf_space") {
    throw new Error("VIDEO_PROVIDER_NOT_SUPPORTED");
  }
  const timeoutRaw = Number(model.api.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const tokenValue =
    process.env.HF_TOKEN?.trim() ||
    process.env.HUGGINGFACEHUB_API_TOKEN?.trim() ||
    undefined;
  if (tokenValue && (!tokenValue.startsWith("hf_") || tokenValue.length <= 3)) {
    throw new Error("INVALID_HF_TOKEN_FORMAT");
  }

  return {
    spaceId: model.api.space_id,
    apiName: model.api.api_name,
    token: tokenValue as `hf_${string}` | undefined,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
    spaceUrl: resolveSpaceUrl(model.api.space_id, model.api.space_url),
  };
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

function decodeImageToBuffer(dataUrl: string) {
  const [header, payload] = dataUrl.split(",", 2);
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

function extractFileUrl(file: unknown) {
  if (!file) return null;
  if (typeof file === "string") return file;
  if (typeof file !== "object") return null;
  const candidate = file as {
    url?: unknown;
    path?: unknown;
    name?: unknown;
    data?: unknown;
  };
  if (typeof candidate.data === "string" && candidate.data.startsWith("data:")) {
    return candidate.data;
  }
  if (typeof candidate.url === "string") return candidate.url;
  if (typeof candidate.path === "string") return candidate.path;
  if (typeof candidate.name === "string") return candidate.name;
  return null;
}

function normalizeFileUrl(fileUrl: string, spaceUrl: string) {
  if (fileUrl.startsWith("data:")) return fileUrl;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  if (fileUrl.startsWith("/")) {
    return `${spaceUrl}${fileUrl}`;
  }
  if (fileUrl.startsWith("file=")) {
    return `${spaceUrl}/${fileUrl}`;
  }
  return `${spaceUrl}/file=${fileUrl}`;
}

async function fetchVideoDataUrl(
  fileUrl: string,
  spaceUrl: string,
  timeoutMs: number = FILE_FETCH_TIMEOUT_MS
) {
  const normalized = normalizeFileUrl(fileUrl, spaceUrl);
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
  async generate(payload: VideoGenerationFormValues) {
    const supportsInitImage =
      videoModelMeta[payload.model]?.supportsInitImage ?? false;
    const initImage = payload.initImage?.trim() ? payload.initImage : null;

    if (!supportsInitImage) {
      throw new Error("HF_SPACE_INIT_IMAGE_UNSUPPORTED");
    }
    if (!initImage) {
      throw new Error("INIT_IMAGE_REQUIRED");
    }

    const config = getSpaceConfig(payload.model);
    await ensureSpaceRunning(config);
    const client = await getClient(config);

    const { buffer, mime } = decodeImageToBuffer(initImage);
    const imageFile = await handle_file(new Blob([buffer], { type: mime }));
    const defaults = videoModelDefaults[payload.model];
    const durationRange = getVideoParamRange(payload.model, "durationSec");
    const stepsRange = getVideoParamRange(payload.model, "steps");
    const guidanceRange = getVideoParamRange(payload.model, "guidanceScale");
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

    const predictPromise = client.predict(apiName, {
      input_image: imageFile,
      prompt: payload.prompt,
      steps: Math.round(steps),
      duration_seconds: durationSeconds,
      guidance_scale: guidanceScale,
      guidance_scale_2: guidanceScale,
      seed: seedValue,
      randomize_seed: randomize,
    });

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
    const fileUrl = extractFileUrl(videoFile);
    if (!fileUrl) {
      throw new Error("HF_SPACE_RESPONSE_INVALID");
    }

    const dataUrl = await fetchVideoDataUrl(
      fileUrl,
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
