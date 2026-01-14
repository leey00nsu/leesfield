import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import {
  fetchVideoGenerationStatus,
  requestVideoGeneration,
} from "@/features/video-generation/api/video-generation-api";
import {
  type GenerationPollingState,
  useGenerationPolling,
} from "@/shared/lib/hooks/use-generation-polling";

const POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 300_000;
const EXTRA_TIMEOUT_MS = 30_000;
const envTimeoutMs = Number(process.env.NEXT_PUBLIC_VIDEO_TIMEOUT_MS);
const configuredTimeoutMs =
  Number.isFinite(envTimeoutMs) && envTimeoutMs > 0
    ? envTimeoutMs
    : DEFAULT_TIMEOUT_MS;
// 모델 응답 지연을 고려해 기본 타임아웃에 버퍼를 더한다.
const pollTimeoutMs = configuredTimeoutMs + EXTRA_TIMEOUT_MS;

const terminalStatuses = ["completed", "failed"] as const;

export interface VideoGenerationState
  extends GenerationPollingState<
    VideoGenerationStatus,
    VideoGenerationResponse["result"]
  > {}

export function useVideoGeneration() {
  return useGenerationPolling<
    VideoGenerationFormValues,
    VideoGenerationStatus,
    VideoGenerationResponse["result"]
  >({
    request: requestVideoGeneration,
    poll: fetchVideoGenerationStatus,
    pollIntervalMs: POLL_INTERVAL_MS,
    timeoutMs: pollTimeoutMs,
    startStatus: "pending",
    errorStatus: "failed",
    timeoutStatus: "failed",
    terminalStatuses,
    requestErrorMessage: "요청에 실패했습니다.",
    pollErrorMessage: "상태 조회에 실패했습니다.",
    timeoutMessage: "응답 시간이 초과되었습니다.",
  });
}
