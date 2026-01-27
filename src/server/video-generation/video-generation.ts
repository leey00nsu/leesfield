import {
  resolveVideoAspectRatioSize,
  type VideoGenerationFormValues,
} from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import { hfSpaceVideoAdapter } from "@/server/video-generation/adapters/hf-space-adapter";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";
import { leemageVideoStorageAdapter } from "@/server/video-generation/storage/adapters/leemage-storage-adapter";
import type { VideoStorageAdapter, VideoStorageMeta } from "@/server/video-generation/storage/storage-adapter";
import { resolveVideoStorageProvider } from "@/server/video-generation/storage/storage-selector";

type VideoProvider = "hf_space";
const DEFAULT_VIDEO_META = {
  width: 640,
  height: 360,
  durationSec: 1,
};

function resolveVideoProvider(modelKey: VideoGenerationFormValues["model"]): VideoProvider {
  void modelKey;
  return "hf_space";
}

function getAdapter(modelKey: VideoGenerationFormValues["model"]): VideoGenerationAdapter {
  const provider = resolveVideoProvider(modelKey);
  if (provider === "hf_space") return hfSpaceVideoAdapter;
  throw new Error(`VIDEO_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getStorageAdapter(): VideoStorageAdapter {
  const { provider } = resolveVideoStorageProvider();
  if (provider === "leemage") return leemageVideoStorageAdapter;
  throw new Error("VIDEO_STORAGE_PROVIDER_NOT_RESOLVED");
}

function resolveInlineMeta(
  payload: VideoGenerationFormValues,
  meta?: VideoStorageMeta
) {
  const fallbackSize = resolveVideoAspectRatioSize(
    payload.aspectRatio,
    payload.resolution
  );
  return {
    width: meta?.width ?? fallbackSize.width ?? DEFAULT_VIDEO_META.width,
    height: meta?.height ?? fallbackSize.height ?? DEFAULT_VIDEO_META.height,
    durationSec:
      meta?.duration_sec ??
      payload.durationSec ??
      DEFAULT_VIDEO_META.durationSec,
  };
}

function buildInlineResult(
  payload: VideoGenerationFormValues,
  dataUrls: string[],
  meta?: VideoStorageMeta
): NonNullable<VideoGenerationResponse["result"]> {
  const resolvedMeta = resolveInlineMeta(payload, meta);
  return {
    videos: dataUrls.map((url) => ({
      url,
      ...resolvedMeta,
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
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
}> {
  let adapter: VideoGenerationAdapter | null = null;
  try {
    adapter = getAdapter(payload.model);
    const result = await adapter.generate(payload);
    const { provider, warningMessage } = resolveVideoStorageProvider();

    if (!provider) {
      const message =
        warningMessage ??
        "비디오 저장소가 지정되지 않아 결과가 저장되지 않습니다.";
      console.warn(`[video-storage] ${message}`, { requestId });
      return {
        status: "completed",
        result: buildInlineResult(payload, result.videos, result.meta),
        errorMessage: message,
        skipDbSave: true,
      };
    }

    const storageAdapter = getStorageAdapter();
    return storageAdapter.uploadVideos(
      payload,
      requestId,
      result.videos,
      result.meta,
    );
  } catch (error) {
    return {
      status: "failed",
      errorMessage: mapProviderError(adapter, error),
    };
  }
}
