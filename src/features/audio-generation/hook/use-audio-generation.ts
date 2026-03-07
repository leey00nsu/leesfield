import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type {
  AudioGenerationResponse,
  AudioGenerationStatus,
} from "@/features/audio-generation/model/audio-generation-types";
import {
  fetchAudioGenerationStatus,
  requestAudioGeneration,
} from "@/features/audio-generation/api/audio-generation-api";
import {
  type GenerationPollingState,
  useGenerationPolling,
} from "@/shared/lib/hooks/use-generation-polling";

const POLL_INTERVAL_MS = 1200;
const DEFAULT_TIMEOUT_MS = 300_000;
const EXTRA_TIMEOUT_MS = 30_000;
const configuredTimeoutMs = Number(
  process.env.NEXT_PUBLIC_AUDIO_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
);
const pollTimeoutMs =
  (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : DEFAULT_TIMEOUT_MS) + EXTRA_TIMEOUT_MS;

const terminalStatuses = ["completed", "failed"] as const;

export type AudioGenerationState = GenerationPollingState<
  AudioGenerationStatus,
  AudioGenerationResponse["result"]
>;

export function useAudioGeneration() {
  const tErrors = useTranslations("generation.errors");
  const request = useCallback(
    async (values: AudioGenerationFormValues) => {
      try {
        return await requestAudioGeneration(values);
      } catch {
        throw new Error(tErrors("requestFailed"));
      }
    },
    [tErrors],
  );
  const poll = useCallback(
    async (requestId: string) => {
      try {
        return await fetchAudioGenerationStatus(requestId);
      } catch {
        throw new Error(tErrors("pollFailed"));
      }
    },
    [tErrors],
  );

  return useGenerationPolling<
    AudioGenerationFormValues,
    AudioGenerationStatus,
    AudioGenerationResponse["result"]
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
