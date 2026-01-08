import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import { hfSpaceVideoAdapter } from "@/server/video-generation/adapters/hf-space-adapter";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";
import { uploadGeneratedVideos } from "@/server/video-generation/leemage-storage";

type VideoProvider = "hf_space";

function resolveVideoProvider(): VideoProvider {
  const raw = process.env.VIDEO_PROVIDER?.trim().toLowerCase();
  if (raw === "hf_space") return "hf_space";
  if (!raw) return "hf_space";
  throw new Error(`VIDEO_PROVIDER 설정이 올바르지 않습니다: ${raw}`);
}

function getAdapter(): VideoGenerationAdapter {
  resolveVideoProvider();
  return hfSpaceVideoAdapter;
}

function mapProviderError(error: unknown) {
  if (!(error instanceof Error)) {
    return "비디오 생성에 실패했습니다.";
  }
  const message = error.message || "";
  const lower = message.toLowerCase();
  if (message.startsWith("HF_SPACE_NOT_READY")) {
    return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
  }
  if (message === "HF_SPACE_STATUS_FETCH_FAILED") {
    return "HF Space 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
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
      return message || "비디오 생성에 실패했습니다.";
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
    const adapter = getAdapter();
    const result = await adapter.generate(payload);
    return uploadGeneratedVideos(payload, requestId, result.videos, result.meta);
  } catch (error) {
    return {
      status: "failed",
      errorMessage: mapProviderError(error),
    };
  }
}
