import { MediaOutputError, mediaOutputDataUrl, normalizeMediaOutputs } from "@/server/media-assets/binary-media-output";
import { withLogContext } from "@/server/observability/logger";
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


async function getAdapter(modelKey: VideoGenerationFormValues["model"]) {
 const model=(await getModelCatalog({includeInactive:true})).find(m=>m.type==="video"&&m.key===modelKey);
 if(!model) throw new Error("VIDEO_MODEL_NOT_FOUND");
 if(model.provider==="modal_comfyui") return { adapter: modalComfyVideoAdapter, provider: model.provider };
 if(model.provider==="hf_space") return { adapter: hfSpaceVideoAdapter, provider: model.provider };
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
  return withLogContext({ requestId, modelKey: payload.model, kind: "video" }, async () => {
    let adapter: VideoGenerationAdapter | null = null;
    let provider = "unresolved";
    let phase = "provider.resolve";
    try {
      const selected = lifecycle.executionModel?.provider === "modal_comfyui"
        ? { adapter: modalComfyVideoAdapter, provider: "modal_comfyui" }
        : await getAdapter(payload.model);
      adapter = selected.adapter;
      provider = selected.provider;
      phase = "storage.configure";
      if (adapter === modalComfyVideoAdapter && resolveVideoStorageProvider().provider !== "leemage")
        throw new ModalApiError("MODAL_STORAGE_NOT_CONFIGURED");
      phase = "provider.generate";
      const activeAdapter = adapter;
      const result = await withLogContext({ provider, phase }, async () => isNodeStudioE2EMockGenerationEnabled()
        ? mockVideoGenerationResult()
        : adapter === modalComfyVideoAdapter
          ? await activeAdapter.generate(payload, { requestId, executionModel:lifecycle.executionModel })
          : await activeAdapter.generate(payload));
      phase = "result.decode";
      const outputs = await normalizeMediaOutputs(result.videos, "video");
      phase = "result.metadata";
      const meta = await withLogContext({ provider, phase }, () => videoOutputMetadata(outputs));
      phase = "storage.resolve";
      const { provider: storageProvider, warningMessage } = resolveVideoStorageProvider();
      provider = storageProvider ?? "unresolved";

      if (!storageProvider) {
        if(adapter === modalComfyVideoAdapter) throw new ModalApiError("MODAL_STORAGE_NOT_CONFIGURED");
        const message =
          warningMessage ??
          "비디오 저장소가 지정되지 않아 결과가 저장되지 않습니다.";
        logStructured("generation.storage_skipped", {
          requestId,
          kind: "video",
          outcome: "storage_unavailable",
        });
        return {
          status: "completed",
          result: buildInlineResult(payload, outputs.map(mediaOutputDataUrl), meta),
          errorMessage: message,
          skipDbSave: true,
        };
      }

      phase = "storage.uploading";
      await lifecycle.onUploading?.();
      phase = "storage.upload";
      const storageAdapter = getStorageAdapter();
      const stored=await withLogContext({ provider, phase }, () => storageAdapter.uploadVideos(
        payload,
        requestId,
        outputs,
        meta,
      ));
      if(adapter===modalComfyVideoAdapter && (!stored.artifacts?.length || stored.errorMessage))
        throw new MediaOutputError(stored.failure ? generationProviderErrorCode(stored.failure.error, stored.failure.phase) : "VIDEO_STORAGE_FAILED", stored.failure?.phase ?? "storage.upload", { cause: stored.failure?.error });
      return {
        status: stored.status, result: stored.result, errorMessage: stored.errorMessage,
        skipDbSave: stored.skipDbSave, artifacts: stored.artifacts,
      };
    } catch (error) {
      if (error instanceof NodeExecutionCancelledError) throw error;
      phase = generationFailurePhase(error, phase);
      logGenerationProviderFailure(
        { requestId, kind: "video", modelKey: payload.model, provider, phase },
        error,
      );
      return {
        status: "failed",
        errorMessage: generationFailureMessage({ kind: "video", phase }, error, () => mapProviderError(adapter, error)),
      };
    }
  });
}
import { logStructured } from "@/server/observability/request-observability";
import { generationFailurePhase, generationProviderErrorCode, generationFailureMessage, logGenerationProviderFailure } from "@/server/observability/generation-failure";
