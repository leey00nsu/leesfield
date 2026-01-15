import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import { getImageModelConfig } from "@/features/image-generation/model/image-models";
import { hfSpaceImageAdapter } from "@/server/image-generation/adapters/hf-space-adapter";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import { leemageStorageAdapter } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import type { ImageStorageAdapter } from "@/server/image-generation/storage/storage-adapter";
import { resolveImageStorageProvider } from "@/server/image-generation/storage/storage-selector";

type ImageProvider = "hf_space";

function resolveImageProvider(modelKey: ImageGenerationFormValues["model"]): ImageProvider {
  const provider = getImageModelConfig(modelKey).provider;
  if (provider === "hf_space") return "hf_space";
  throw new Error(`IMAGE_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getAdapter(modelKey: ImageGenerationFormValues["model"]): ImageGenerationAdapter {
  const provider = resolveImageProvider(modelKey);
  if (provider === "hf_space") return hfSpaceImageAdapter;
  throw new Error(`IMAGE_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getStorageAdapter(): ImageStorageAdapter {
  const { provider } = resolveImageStorageProvider();
  if (provider === "leemage") return leemageStorageAdapter;
  throw new Error("IMAGE_STORAGE_PROVIDER_NOT_RESOLVED");
}

function buildInlineResult(
  payload: ImageGenerationFormValues,
  dataUrls: string[]
): NonNullable<ImageGenerationResponse["result"]> {
  const { width, height } = payload;
  return {
    images: dataUrls.map((url) => ({
      url,
      width,
      height,
    })),
  };
}

function mapProviderError(adapter: ImageGenerationAdapter, error: unknown) {
  if (adapter.mapError) {
    return adapter.mapError(error);
  }
  return error instanceof Error && error.message
    ? error.message
    : "이미지 생성에 실패했습니다.";
}

export async function resolveImageGenerationResult(
  payload: ImageGenerationFormValues,
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
}> {
  try {
    const adapter = getAdapter(payload.model);
    const result = await adapter.generate(payload);
    const { provider, warningMessage } = resolveImageStorageProvider();

    if (!provider) {
      const message =
        warningMessage ??
        "이미지 저장소가 지정되지 않아 결과가 저장되지 않습니다.";
      console.warn(`[image-storage] ${message}`, { requestId });
      return {
        status: "completed",
        result: buildInlineResult(payload, result.images),
        errorMessage: message,
        skipDbSave: true,
      };
    }

    const storageAdapter = getStorageAdapter();
    return storageAdapter.uploadImages(payload, requestId, result.images);
  } catch (error) {
    return {
      status: "failed",
      errorMessage: mapProviderError(adapter, error),
    };
  }
}
