import {
  resolveAspectRatioSize,
  type ImageGenerationFormValues,
} from "@/features/image-generation/model/image-generation-schema";

const DEFAULT_MODAL_TIMEOUT = 120_000;

function getModalConfig() {
  const endpoint = process.env.MODAL_IMAGE_ENDPOINT;
  const proxyKey = process.env.MODAL_PROXY_KEY;
  const proxySecret = process.env.MODAL_PROXY_SECRET;
  const timeout = Number(process.env.MODAL_TIMEOUT_MS ?? DEFAULT_MODAL_TIMEOUT);

  const missing = [
    !endpoint && "MODAL_IMAGE_ENDPOINT",
    !proxyKey && "MODAL_PROXY_KEY",
    !proxySecret && "MODAL_PROXY_SECRET",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(`MODAL 설정이 필요합니다: ${missing.join(", ")}`);
  }

  return {
    endpoint,
    proxyKey,
    proxySecret,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_MODAL_TIMEOUT,
  } as const;
}

export async function requestModalGeneration(payload: ImageGenerationFormValues) {
  const { endpoint, proxyKey, proxySecret, timeout } = getModalConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const { width, height } = resolveAspectRatioSize(
      payload.aspectRatio,
      payload.resolution
    );
    const isTurbo = payload.model === "z-image-turbo";
    const isSdxlTurbo = payload.model === "sdxl-turbo";
    const normalizedSampler = payload.sampler?.trim();
    const sampler =
      isTurbo ||
      isSdxlTurbo ||
      !normalizedSampler ||
      normalizedSampler === "Default"
        ? null
        : normalizedSampler;
    const parsedSeed = payload.seed ? Number(payload.seed) : null;
    const seed =
      isTurbo || isSdxlTurbo
        ? null
        : parsedSeed !== null && Number.isFinite(parsedSeed) && parsedSeed >= 0
          ? parsedSeed
          : null;
    const steps = isTurbo ? 8 : isSdxlTurbo ? 2 : payload.steps;
    const cfgScale = isTurbo || isSdxlTurbo ? 0 : payload.cfgScale;
    const negativePrompt =
      isTurbo || isSdxlTurbo ? null : payload.negativePrompt || null;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Modal-Key": proxyKey,
        "Modal-Secret": proxySecret,
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        init_images:
          payload.initImages && payload.initImages.length > 0
            ? payload.initImages
            : null,
        image_count: payload.imageCount,
        steps,
        cfg_scale: cfgScale,
        seed,
        sampler,
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

    if (!result?.images || !Array.isArray(result.images)) {
      throw new Error("MODAL_RESPONSE_INVALID");
    }

    return {
      images: result.images as string[],
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
