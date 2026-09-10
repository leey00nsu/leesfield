import { ModalApiError } from "@/server/modal-comfyui/client";
import { videoOutputMetadata } from "@/server/media-assets/video-output-metadata";
import { modalComfyVideoAdapter } from "./adapters/modal-comfyui-adapter";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import { hfSpaceVideoAdapter } from "@/server/video-generation/adapters/hf-space-adapter";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";
import { leemageVideoStorageAdapter } from "@/server/video-generation/storage/adapters/leemage-storage-adapter";
import type { VideoStorageAdapter } from "@/server/video-generation/storage/storage-adapter";
import { resolveVideoStorageProvider } from "@/server/video-generation/storage/storage-selector";
import type { GeneratedMediaArtifact, GenerationUploadLifecycle } from "@/server/media-assets/generated-media-artifact";
import { NodeExecutionCancelledError } from "@/server/node-executions/node-execution-errors";
import {
  isNodeStudioE2EMockGenerationEnabled,
  mockVideoGenerationResult,
} from "@/server/media-assets/node-studio-e2e-media-fixtures";


async function getAdapter(modelKey: VideoGenerationFormValues["model"]): Promise<VideoGenerationAdapter> {
 const model=(await getModelCatalog({includeInactive:true})).find(m=>m.type==="video"&&m.key===modelKey);
 if(!model) throw new Error("VIDEO_MODEL_NOT_FOUND");
 if(model.provider==="modal_comfyui") return modalComfyVideoAdapter;
 if(model.provider==="hf_space") return hfSpaceVideoAdapter;
 throw new Error("VIDEO_PROVIDER_NOT_SUPPORTED");
}

function getStorageAdapter(): VideoStorageAdapter {
  const { provider } = resolveVideoStorageProvider();
  if (provider === "leemage") return leemageVideoStorageAdapter;
  throw new Error("VIDEO_STORAGE_PROVIDER_NOT_RESOLVED");
}

function resolveInlineMeta(
  meta: Awaited<ReturnType<typeof videoOutputMetadata>>["outputs"][number]
) {
  return {
    width: meta.width,
    height: meta.height,
    durationSec: meta.duration_sec,
  };
}

function buildInlineResult(
  payload: VideoGenerationFormValues,
  dataUrls: string[],
  meta: Awaited<ReturnType<typeof videoOutputMetadata>>
): NonNullable<VideoGenerationResponse["result"]> {
  return {
    videos: dataUrls.map((url, index) => ({
      url,
      ...resolveInlineMeta(meta.outputs?.[index] ?? meta),
    })),
  };
}

function mapProviderError(adapter: VideoGenerationAdapter | null, error: unknown) {
  if (adapter?.mapError) {
    return adapter.mapError(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "비디오 생성에 실패했습니다.";
}

export async function resolveVideoGenerationResult(
  payload: VideoGenerationFormValues,
  requestId: string,
  lifecycle: GenerationUploadLifecycle = {},
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
  artifacts?: GeneratedMediaArtifact[];
}> {
  let adapter: VideoGenerationAdapter | null = null;
  try {
    adapter = lifecycle.executionModel?.provider==="modal_comfyui" ? modalComfyVideoAdapter : await getAdapter(payload.model);
    if (adapter === modalComfyVideoAdapter && resolveVideoStorageProvider().provider !== "leemage")
      throw new ModalApiError("MODAL_STORAGE_NOT_CONFIGURED");
    const result = isNodeStudioE2EMockGenerationEnabled()
      ? mockVideoGenerationResult()
      : adapter === modalComfyVideoAdapter
        ? await adapter.generate(payload, { requestId, executionModel:lifecycle.executionModel })
        : await adapter.generate(payload);
    const { provider, warningMessage } = resolveVideoStorageProvider();

    if (!provider) {
      if(adapter === modalComfyVideoAdapter) throw new ModalApiError("MODAL_STORAGE_NOT_CONFIGURED");
      const message =
        warningMessage ??
        "비디오 저장소가 지정되지 않아 결과가 저장되지 않습니다.";
      console.warn(`[video-storage] ${message}`, { requestId });
      return {
        status: "completed",
        result: buildInlineResult(payload, result.videos, await videoOutputMetadata(result.videos)),
        errorMessage: message,
        skipDbSave: true,
      };
    }

    await lifecycle.onUploading?.();
    const storageAdapter = getStorageAdapter();
    const stored=await storageAdapter.uploadVideos(
      payload,
      requestId,
      result.videos,
      result.meta,
    );
    if(adapter===modalComfyVideoAdapter && (!stored.artifacts?.length || stored.errorMessage))
      throw new ModalApiError("MODAL_STORAGE_FAILED");
    return stored;
  } catch (error) {
    if (error instanceof NodeExecutionCancelledError) throw error;
    return {
      status: "failed",
      errorMessage: mapProviderError(adapter, error),
    };
  }
}
