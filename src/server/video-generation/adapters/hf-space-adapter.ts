import { Client, handle_file } from "@gradio/client";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import { videoModelMeta } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";

const DEFAULT_SPACE_ID = "leey00nsu/wan2-2-fp8da-aoti-faster";
const DEFAULT_API_NAME = "/generate_video";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 5.0;
const MIN_STEPS = 4;
const MAX_STEPS = 8;
const MIN_GUIDANCE = 0.0;
const MAX_GUIDANCE = 10.0;

type SpaceConfig = {
  spaceId: string;
  apiName: string;
  token?: `hf_${string}`;
  timeoutMs: number;
  spaceUrl: string;
};

let cachedClientPromise: Promise<Client> | null = null;

function resolveSpaceUrl(spaceId: string) {
  const explicit = process.env.HF_VIDEO_SPACE_URL?.trim();
  if (explicit) return explicit;
  const slug = spaceId.replace("/", "-");
  return `https://${slug}.hf.space`;
}

function getSpaceConfig(): SpaceConfig {
  const spaceId = process.env.HF_VIDEO_SPACE_ID?.trim() || DEFAULT_SPACE_ID;
  const apiName = process.env.HF_VIDEO_SPACE_API_NAME?.trim() || DEFAULT_API_NAME;
  const timeoutRaw = Number(
    process.env.HF_VIDEO_SPACE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );
  const tokenValue =
    process.env.HF_TOKEN?.trim() ||
    process.env.HUGGINGFACEHUB_API_TOKEN?.trim() ||
    undefined;

  return {
    spaceId,
    apiName,
    token: tokenValue as `hf_${string}` | undefined,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
    spaceUrl: resolveSpaceUrl(spaceId),
  };
}

async function getClient(config: SpaceConfig) {
  if (!cachedClientPromise) {
    cachedClientPromise = Client.connect(config.spaceId, {
      token: config.token,
    });
  }
  try {
    return await cachedClientPromise;
  } catch (error) {
    cachedClientPromise = null;
    throw error;
  }
}

function normalizeApiName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_API_NAME;
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

function clampDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return MIN_DURATION_SEC;
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, seconds));
}

function clampSteps(steps: number) {
  if (!Number.isFinite(steps)) return MIN_STEPS;
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(steps)));
}

function clampGuidance(scale: number) {
  if (!Number.isFinite(scale)) return MIN_GUIDANCE;
  return Math.min(MAX_GUIDANCE, Math.max(MIN_GUIDANCE, scale));
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

async function fetchVideoDataUrl(fileUrl: string, spaceUrl: string) {
  const normalized = normalizeFileUrl(fileUrl, spaceUrl);
  if (normalized.startsWith("data:")) {
    return normalized;
  }
  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error("HF_SPACE_VIDEO_FETCH_FAILED");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:video/mp4;base64,${buffer.toString("base64")}`;
}

export const hfSpaceVideoAdapter: VideoGenerationAdapter = {
  async generate(payload: VideoGenerationFormValues) {
    const supportsInitImage =
      videoModelMeta[payload.model]?.supportsInitImage ?? false;
    const initImage = payload.initImage?.trim() ? payload.initImage : null;

    if (!supportsInitImage) {
      throw new Error("HF_SPACE_ONLY_SUPPORTS_I2V");
    }
    if (!initImage) {
      throw new Error("INIT_IMAGE_REQUIRED");
    }

    const config = getSpaceConfig();
    const client = await getClient(config);

    const { buffer, mime } = decodeImageToBuffer(initImage);
    const imageFile = await handle_file(new Blob([buffer], { type: mime }));
    const durationSeconds = clampDuration(payload.durationSec);
    const guidanceScale = clampGuidance(Number(payload.guidanceScale ?? 1));
    const steps = clampSteps(Number(payload.steps ?? MIN_STEPS));
    const { seedValue, randomize } = parseSeed(payload.seed);
    const apiName = normalizeApiName(config.apiName || DEFAULT_API_NAME);

    const predictPromise = client.predict(apiName, {
      input_image: imageFile,
      prompt: payload.prompt,
      steps,
      duration_seconds: durationSeconds,
      guidance_scale: guidanceScale,
      guidance_scale_2: guidanceScale,
      seed: seedValue,
      randomize_seed: randomize,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("HF_SPACE_REQUEST_TIMEOUT")), config.timeoutMs);
    });

    const result = await Promise.race([predictPromise, timeoutPromise]);
    const data = Array.isArray(result?.data) ? result.data : result;
    const videoFile = Array.isArray(data) ? data[0] : data;
    const fileUrl = extractFileUrl(videoFile);
    if (!fileUrl) {
      throw new Error("HF_SPACE_RESPONSE_INVALID");
    }

    const dataUrl = await fetchVideoDataUrl(fileUrl, config.spaceUrl);
    return {
      videos: [dataUrl],
      meta: {
        duration_sec: durationSeconds,
        fps: 16,
      },
    };
  },
};
