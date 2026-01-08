import { Client } from "@gradio/client";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";

const DEFAULT_SPACE_ID = "leey00nsu/Z-Image-Turbo";
const DEFAULT_API_NAME = "/generate_image";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_SHIFT = 3.0;
const MIN_STEPS = 1;
const MAX_STEPS = 20;
const MIN_SIZE = 512;
const MAX_SIZE = 2048;

type SpaceConfig = {
  spaceId: string;
  apiName: string;
  token?: `hf_${string}`;
  timeoutMs: number;
  spaceUrl: string;
};

let cachedClientPromise: Promise<Client> | null = null;

function resolveSpaceUrl(spaceId: string) {
  const explicit = process.env.HF_IMAGE_SPACE_URL?.trim();
  if (explicit) return explicit;
  const slug = spaceId.replace("/", "-");
  return `https://${slug}.hf.space`;
}

function getSpaceConfig(): SpaceConfig {
  const spaceId = process.env.HF_IMAGE_SPACE_ID?.trim() || DEFAULT_SPACE_ID;
  const apiName =
    process.env.HF_IMAGE_SPACE_API_NAME?.trim() || DEFAULT_API_NAME;
  const timeoutRaw = Number(
    process.env.HF_IMAGE_SPACE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );
  const tokenValue =
    process.env.HF_TOKEN?.trim() ||
    process.env.HUGGINGFACEHUB_API_TOKEN?.trim() ||
    undefined;

  return {
    spaceId,
    apiName,
    token: tokenValue as `hf_${string}` | undefined,
    timeoutMs:
      Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? timeoutRaw
        : DEFAULT_TIMEOUT_MS,
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

function parseSeed(seed?: string) {
  if (!seed?.trim()) {
    return { seedValue: -1, randomize: true };
  }
  const parsed = Number(seed);
  const isValid =
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= Number.MAX_SAFE_INTEGER;
  return { seedValue: isValid ? parsed : -1, randomize: !isValid };
}

function clampSteps(steps: number) {
  if (!Number.isFinite(steps)) return MIN_STEPS;
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(steps)));
}

function clampSize(value: number) {
  if (!Number.isFinite(value)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
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
  if (
    typeof candidate.data === "string" &&
    candidate.data.startsWith("data:")
  ) {
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

async function fetchImageDataUrl(fileUrl: string, spaceUrl: string) {
  const normalized = normalizeFileUrl(fileUrl, spaceUrl);
  if (normalized.startsWith("data:")) {
    return normalized;
  }
  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error("HF_SPACE_IMAGE_FETCH_FAILED");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/png";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export const hfSpaceImageAdapter: ImageGenerationAdapter = {
  async generate(payload: ImageGenerationFormValues) {
    if (payload.initImages && payload.initImages.length > 0) {
      throw new Error("HF_SPACE_ONLY_SUPPORTS_T2I");
    }

    const config = getSpaceConfig();
    const client = await getClient(config);
    const { seedValue, randomize } = parseSeed(payload.seed);
    const width = clampSize(payload.width);
    const height = clampSize(payload.height);
    const apiName = normalizeApiName(config.apiName || DEFAULT_API_NAME);

    const predictPromise = client.predict(apiName, {
      prompt: payload.prompt,
      height,
      width,
      num_inference_steps: clampSteps(Number(payload.steps ?? 8)),
      seed: seedValue,
      randomize_seed: randomize,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("HF_SPACE_REQUEST_TIMEOUT")),
        config.timeoutMs
      );
    });

    const result = await Promise.race([predictPromise, timeoutPromise]);
    const data = Array.isArray(result?.data) ? result.data : result;
    const imageValue = Array.isArray(data) ? data[0] : data;
    const imageUrl = extractFileUrl(imageValue);
    if (!imageUrl) {
      throw new Error("HF_SPACE_RESPONSE_INVALID");
    }

    const dataUrl = await fetchImageDataUrl(imageUrl, config.spaceUrl);
    return { images: [dataUrl] };
  },
};
