import { useCallback } from "react";
import { useTranslations } from "next-intl";
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
  const tErrors = useTranslations("generation.errors");
  const request = useCallback(
    async (values: ImageGenerationFormValues) => {
      try {
        return await requestImageGeneration(values);
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
        return await fetchImageGenerationStatus(requestId);
      } catch {
        throw new Error(tErrors("pollFailed"));
      }
    },
    [tErrors],
  );

  return useGenerationPolling<
    ImageGenerationFormValues,
    ImageGenerationStatus,
    ImageGenerationResponse["result"]
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
