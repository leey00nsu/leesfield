import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import { codexCliImageAdapter } from "@/server/image-generation/adapters/codex-cli-adapter";
import { hfSpaceImageAdapter } from "@/server/image-generation/adapters/hf-space-adapter";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import { leemageStorageAdapter } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import type { ImageStorageAdapter } from "@/server/image-generation/storage/storage-adapter";
import { resolveImageStorageProvider } from "@/server/image-generation/storage/storage-selector";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { ImageModelCatalogItem } from "@/server/model-catalog/catalog-schema";

type ImageProvider = "hf_space" | "codex_cli";

async function resolveCatalogImageModel(
  modelKey: ImageGenerationFormValues["model"]
) {
  const catalog = await getModelCatalog({ includeInactive: true });
  const model = catalog.find(
    (item): item is ImageModelCatalogItem =>
      item.type === "image" && item.key === modelKey,
  );
  if (!model) {
    throw new Error(`IMAGE_MODEL_NOT_FOUND:${modelKey}`);
  }
  return model;
}

async function resolveImageProvider(
  modelKey: ImageGenerationFormValues["model"]
): Promise<ImageProvider> {
  const model = await resolveCatalogImageModel(modelKey);
  return model.provider;
}

async function getAdapter(
  modelKey: ImageGenerationFormValues["model"]
): Promise<ImageGenerationAdapter> {
  const provider = await resolveImageProvider(modelKey);
  if (provider === "hf_space") return hfSpaceImageAdapter;
  if (provider === "codex_cli") return codexCliImageAdapter;
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

function mapProviderError(adapter: ImageGenerationAdapter | null, error: unknown) {
  if (adapter?.mapError) {
    return adapter.mapError(error);
  }
  if (error instanceof Error) {
    if (error.message.startsWith("IMAGE_MODEL_NOT_FOUND")) {
      return "선택한 이미지 모델을 찾을 수 없습니다.";
    }
    if (error.message.startsWith("IMAGE_PROVIDER_NOT_SUPPORTED")) {
      return "지원하지 않는 이미지 provider입니다.";
    }
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
  let adapter: ImageGenerationAdapter | null = null;
  try {
    adapter = await getAdapter(payload.model);
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
