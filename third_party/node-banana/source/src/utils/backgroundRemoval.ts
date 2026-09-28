import type { BackgroundRemovalModel } from "@/types";

export interface BackgroundRemovalOptions {
  model?: BackgroundRemovalModel;
  onProgress?: (progress: number) => void;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert result to data URL"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Remove the background from an image using client-side AI (IMG.LY).
 * Returns a PNG data URL with transparency.
 */
export async function removeImageBackground(
  imageSrc: string,
  options?: BackgroundRemovalOptions,
): Promise<string> {
  const { removeBackground } = await import("@imgly/background-removal");

  // NOTE (memory tradeoff): @imgly/background-removal memoizes its
  // onnxruntime-web WASM session keyed on the config (notably `model`). This
  // means the model weights are downloaded and initialized once per distinct
  // model and then cached for fast subsequent runs — but that cache is also
  // *retained* for the lifetime of the browser session. Switching between the
  // quality tiers (isnet_quint8 ~44MB, isnet_fp16 ~88MB, isnet ~170MB) therefore
  // accumulates a separate session per model (potentially ~300MB total) with no
  // way to release it: the library exposes no session-dispose API. We keep the
  // memoization (caching is desirable for repeated removals at the same
  // quality) and simply avoid gratuitous model switching in the UI rather than
  // attempting a manual teardown that the library does not support.
  const config = {
    model: options?.model ?? "isnet_fp16",
    output: {
      format: "image/png" as const,
      quality: 0.9,
    },
    progress: (_key: string, current: number, total: number) => {
      if (options?.onProgress && total > 0) {
        options.onProgress(Math.round((current / total) * 100));
      }
    },
  };

  const blob = await removeBackground(imageSrc, config);
  return blobToDataUrl(blob);
}
