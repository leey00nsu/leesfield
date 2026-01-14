import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";
import {
  fetchImageGenerationStatus,
  requestImageGeneration,
} from "@/features/image-generation/api/image-generation-api";
import {
  type GenerationPollingState,
  useGenerationPolling,
} from "@/shared/lib/hooks/use-generation-polling";

const POLL_INTERVAL_MS = 1200;
const DEFAULT_TIMEOUT_MS = 300_000;
const EXTRA_TIMEOUT_MS = 30_000;
const configuredTimeoutMs = Number(
  process.env.NEXT_PUBLIC_IMAGE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
);
// 모델 응답 지연을 고려해 기본 타임아웃에 버퍼를 더한다.
const pollTimeoutMs =
  (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : DEFAULT_TIMEOUT_MS) + EXTRA_TIMEOUT_MS;

const terminalStatuses = ["completed", "failed"] as const;

export type ImageGenerationState = GenerationPollingState<
  ImageGenerationStatus,
  ImageGenerationResponse["result"]
>;

export function useImageGeneration() {
  return useGenerationPolling<
    ImageGenerationFormValues,
    ImageGenerationStatus,
    ImageGenerationResponse["result"]
  >({
    request: requestImageGeneration,
    poll: fetchImageGenerationStatus,
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
