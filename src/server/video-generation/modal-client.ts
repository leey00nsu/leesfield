import {
  resolveVideoAspectRatioSize,
  videoModelMeta,
  type VideoGenerationFormValues,
} from "@/features/video-generation/model/video-generation-schema";

const DEFAULT_MODAL_TIMEOUT = 120_000;

function getModalConfig() {
  const endpoint = process.env.MODAL_VIDEO_ENDPOINT;
  const proxyKey = process.env.MODAL_PROXY_KEY;
  const proxySecret = process.env.MODAL_PROXY_SECRET;
  const timeout = Number(process.env.MODAL_TIMEOUT_MS ?? DEFAULT_MODAL_TIMEOUT);

  if (!endpoint || !proxyKey || !proxySecret) {
    const missing = [
      !endpoint && "MODAL_VIDEO_ENDPOINT",
      !proxyKey && "MODAL_PROXY_KEY",
      !proxySecret && "MODAL_PROXY_SECRET",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`MODAL 설정이 필요합니다: ${missing}`);
  }

  return {
    endpoint,
    proxyKey,
    proxySecret,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_MODAL_TIMEOUT,
  };
}

export type ModalVideoResult = {
  videos: string[];
  meta?: {
    width?: number;
    height?: number;
    duration_sec?: number;
    fps?: number;
  };
};

export async function requestModalVideoGeneration(
  payload: VideoGenerationFormValues
): Promise<ModalVideoResult> {
  const { endpoint, proxyKey, proxySecret, timeout } = getModalConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const { width, height } = resolveVideoAspectRatioSize(
      payload.aspectRatio,
      payload.resolution
    );
    const parsedSeed = payload.seed ? Number(payload.seed) : null;
    const isValidSeed =
      parsedSeed !== null &&
      Number.isSafeInteger(parsedSeed) &&
      parsedSeed >= 0 &&
      parsedSeed <= Number.MAX_SAFE_INTEGER;
    const seed = isValidSeed ? parsedSeed : null;
    const supportsInitImage =
      videoModelMeta[payload.model]?.supportsInitImage ?? false;
    const initImage = payload.initImage?.trim()
      ? payload.initImage
      : null;

    if (!supportsInitImage && initImage) {
      throw new Error("UNSUPPORTED_IMAGE_INPUT");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Modal-Key": proxyKey,
        "Modal-Secret": proxySecret,
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        init_image: initImage,
        width,
        height,
        duration_sec: payload.durationSec,
        fps: payload.fps,
        steps: payload.steps,
        guidance_scale: payload.guidanceScale,
        seed,
        model: payload.model,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const message = errorPayload?.detail ?? "MODAL_REQUEST_FAILED";
      throw new Error(message);
    }

    const result = await response.json().catch(() => {
      throw new Error("MODAL_RESPONSE_INVALID");
    });

    if (!result?.videos || !Array.isArray(result.videos)) {
      throw new Error("MODAL_RESPONSE_INVALID");
    }

    if (!result.videos.every((item: unknown) => typeof item === "string")) {
      throw new Error("MODAL_RESPONSE_INVALID");
    }

    return {
      videos: result.videos,
      meta: result.meta,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MODAL_REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
