import { withLogContext } from "@/server/observability/logger";
import { ModalApiError } from "@/server/modal-comfyui/client";
import { modalComfyImageAdapter } from "./adapters/modal-comfyui-adapter";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import { codexBridgeImageAdapter } from "@/server/image-generation/adapters/codex-bridge-adapter";
import { codexCliImageAdapter } from "@/server/image-generation/adapters/codex-cli-adapter";
import { hfSpaceImageAdapter } from "@/server/image-generation/adapters/hf-space-adapter";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import { leemageStorageAdapter } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import type { ImageStorageAdapter } from "@/server/image-generation/storage/storage-adapter";
import { resolveImageStorageProvider } from "@/server/image-generation/storage/storage-selector";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { GeneratedMediaArtifact, GenerationUploadLifecycle } from "@/server/media-assets/generated-media-artifact";
import { NodeExecutionCancelledError } from "@/server/node-executions/node-execution-errors";
import type { ImageModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import {
  isNodeStudioE2EMockGenerationEnabled,
  mockImageGenerationResult,
} from "@/server/media-assets/node-studio-e2e-media-fixtures";

type ImageProvider = ImageModelCatalogItem["provider"];

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
) {
  const provider = await resolveImageProvider(modelKey);
  if (provider === "modal_comfyui") return { adapter: modalComfyImageAdapter, provider };
  if (provider === "hf_space") return { adapter: hfSpaceImageAdapter, provider };
  if (provider === "codex_cli") return { adapter: codexCliImageAdapter, provider };
  if (provider === "codex_bridge") return { adapter: codexBridgeImageAdapter, provider };
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
  requestId: string,
  lifecycle: GenerationUploadLifecycle = {},
): Promise<{
  status: "completed" | "failed";
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
  artifacts?: GeneratedMediaArtifact[];
}> {
  return withLogContext({ requestId, modelKey: payload.model, kind: "image" }, async () => {
    let adapter: ImageGenerationAdapter | null = null;
    let provider = "unresolved";
    let phase = "provider.resolve";
    try {
      const selected = lifecycle.executionModel?.provider === "modal_comfyui"
        ? { adapter: modalComfyImageAdapter, provider: "modal_comfyui" }
        : await getAdapter(payload.model);
      adapter = selected.adapter;
      provider = selected.provider;
      phase = "storage.configure";
      if (adapter === modalComfyImageAdapter && resolveImageStorageProvider().provider !== "leemage")
        throw new ModalApiError("MODAL_STORAGE_NOT_CONFIGURED");
      phase = "provider.generate";
      const activeAdapter = adapter;
      const result = await withLogContext({ provider, phase }, async () => isNodeStudioE2EMockGenerationEnabled()
        ? mockImageGenerationResult(payload)
        : await activeAdapter.generate(payload, {
            requestId,
            executionModel: lifecycle.executionModel,
          }));
      phase = "storage.resolve";
      const { provider: storageProvider, warningMessage } = resolveImageStorageProvider();
      provider = storageProvider ?? "unresolved";

      if (!storageProvider) {
        if(adapter === modalComfyImageAdapter) throw new ModalApiError("MODAL_STORAGE_NOT_CONFIGURED");
        const message =
          warningMessage ??
          "이미지 저장소가 지정되지 않아 결과가 저장되지 않습니다.";
        logStructured("generation.storage_skipped", {
          requestId,
          kind: "image",
          outcome: "storage_unavailable",
        });
        return {
          status: "completed",
          result: buildInlineResult(payload, result.images),
          errorMessage: message,
          skipDbSave: true,
        };
      }

      phase = "storage.uploading";
      await lifecycle.onUploading?.();
      phase = "storage.upload";
      const storageAdapter = getStorageAdapter();
      const stored=await withLogContext({ provider, phase }, () => storageAdapter.uploadImages(
        adapter===modalComfyImageAdapter && result.meta ? {...payload,...result.meta,imageCount:result.images.length} : payload,
        requestId,result.images));
      if(adapter===modalComfyImageAdapter && (!stored.artifacts?.length || stored.errorMessage))
        throw new ModalApiError("MODAL_STORAGE_FAILED");
      return stored;
    } catch (error) {
      if (error instanceof NodeExecutionCancelledError) throw error;
      logGenerationProviderFailure(
        { requestId, kind: "image", modelKey: payload.model, provider, phase },
        error,
      );
      return {
        status: "failed",
        errorMessage: generationFailureMessage({ kind: "image", phase }, error, () => mapProviderError(adapter, error)),
      };
    }
  });
}
import { logStructured } from "@/server/observability/request-observability";
import { generationFailureMessage, logGenerationProviderFailure } from "@/server/observability/generation-failure";
