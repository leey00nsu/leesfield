import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import { getVideoModelConfig } from "@/features/video-generation/model/video-models";
import { hfSpaceVideoAdapter } from "@/server/video-generation/adapters/hf-space-adapter";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";
import { uploadGeneratedVideos } from "@/server/video-generation/leemage-storage";

type VideoProvider = "hf_space";

function resolveVideoProvider(modelKey: VideoGenerationFormValues["model"]): VideoProvider {
  const provider = getVideoModelConfig(modelKey).provider;
  if (provider === "hf_space") return "hf_space";
  throw new Error(`VIDEO_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getAdapter(modelKey: VideoGenerationFormValues["model"]): VideoGenerationAdapter {
  resolveVideoProvider(modelKey);
  return hfSpaceVideoAdapter;
}

function mapProviderError(error: unknown) {
  if (!(error instanceof Error)) {
    console.error("Video generation error:", error);
    return "비디오 생성에 실패했습니다.";
  }
  const message = error.message || "";
  const lower = message.toLowerCase();
  if (lower.startsWith("hf_space_not_ready")) {
    return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
  }
  if (lower === "hf_space_status_fetch_failed") {
    return "HF Space 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (lower === "hf_space_init_image_unsupported") {
    return "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  }
  if (lower === "hf_space_image_not_base64") {
    return "업로드한 이미지 형식이 올바르지 않습니다. 다른 이미지를 사용해주세요.";
  }
  if (lower === "hf_space_video_fetch_timeout") {
    return "생성된 비디오 다운로드 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (lower === "hf_space_request_timeout") {
    return "비디오 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  }
  let code: string | null = null;
  if (
    lower.includes("quota") ||
    lower.includes("exceed") ||
    lower.includes("limit") ||
    lower.includes("daily") ||
    lower.includes("zero gpu") ||
    lower.includes("zerogpu")
  ) {
    code = "HF_SPACE_QUOTA_EXCEEDED";
  } else if (lower.includes("queue") || lower.includes("queued")) {
    code = "HF_SPACE_QUEUE_FULL";
  } else if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    code = "HF_SPACE_RATE_LIMITED";
  } else if (
    lower.includes("sleep") ||
    lower.includes("paused") ||
    lower.includes("building") ||
    lower.includes("loading")
  ) {
    code = "HF_SPACE_NOT_READY";
  }

  switch (code) {
    case "HF_SPACE_QUOTA_EXCEEDED":
      return "ZeroGPU 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 다른 제공자를 사용해주세요.";
    case "HF_SPACE_QUEUE_FULL":
      return "현재 대기열이 가득합니다. 잠시 후 다시 시도해주세요.";
    case "HF_SPACE_RATE_LIMITED":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case "HF_SPACE_NOT_READY":
      return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
    default:
      console.error("Video generation error:", error);
      return "비디오 생성에 실패했습니다.";
  }
}

export async function resolveVideoGenerationResult(
  payload: VideoGenerationFormValues,
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
}> {
  try {
    const adapter = getAdapter(payload.model);
    const result = await adapter.generate(payload);
    return uploadGeneratedVideos(payload, requestId, result.videos, result.meta);
  } catch (error) {
    return {
      status: "failed",
      errorMessage: mapProviderError(error),
    };
  }
}
