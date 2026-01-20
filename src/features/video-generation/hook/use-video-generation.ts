import { useCallback } from "react";
import { useTranslations } from "next-intl";
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

export type VideoGenerationState = GenerationPollingState<
  VideoGenerationStatus,
  VideoGenerationResponse["result"]
>;

export function useVideoGeneration() {
  const tErrors = useTranslations("generation.errors");
  const request = useCallback(
    async (values: VideoGenerationFormValues) => {
      try {
        return await requestVideoGeneration(values);
      } catch (error) {
        const code =
          error && typeof error === "object" ? (error as { code?: string }).code : undefined;
        if (code === "IN_PROGRESS_ALREADY") {
          const mapped = new Error(tErrors("inProgress"));
          (mapped as Error & { requestId?: string }).requestId = (
            error as Error & { requestId?: string }
          ).requestId;
          throw mapped;
        }
        throw new Error(tErrors("requestFailed"));
      }
    },
    [tErrors],
  );
  const poll = useCallback(
    async (requestId: string) => {
      try {
        return await fetchVideoGenerationStatus(requestId);
      } catch {
        throw new Error(tErrors("pollFailed"));
      }
    },
    [tErrors],
  );

  return useGenerationPolling<
    VideoGenerationFormValues,
    VideoGenerationStatus,
    VideoGenerationResponse["result"]
  >({
    request,
    poll,
    pollIntervalMs: POLL_INTERVAL_MS,
    timeoutMs: pollTimeoutMs,
    startStatus: "pending",
    errorStatus: "failed",
    timeoutStatus: "failed",
    terminalStatuses,
    requestErrorMessage: tErrors("requestFailed"),
    pollErrorMessage: tErrors("pollFailed"),
    timeoutMessage: tErrors("timeout"),
  });
}
