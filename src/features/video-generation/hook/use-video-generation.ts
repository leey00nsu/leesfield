import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import {
  fetchVideoGenerationStatus,
  requestVideoGeneration,
} from "@/features/video-generation/api/video-generation-api";

const POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 300_000;
const EXTRA_TIMEOUT_MS = 30_000;
const envTimeoutMs = Number(process.env.NEXT_PUBLIC_VIDEO_TIMEOUT_MS);
const configuredTimeoutMs =
  Number.isFinite(envTimeoutMs) && envTimeoutMs > 0
    ? envTimeoutMs
    : DEFAULT_TIMEOUT_MS;
const pollTimeoutMs = configuredTimeoutMs + EXTRA_TIMEOUT_MS;

export type VideoGenerationState = {
  status: VideoGenerationStatus | "idle";
  progress: number;
  requestId?: string;
  errorMessage?: string;
  result?: VideoGenerationResponse["result"];
};

const initialState: VideoGenerationState = {
  status: "idle",
  progress: 0,
};

export function useVideoGeneration() {
  const [state, setState] = useState<VideoGenerationState>(initialState);
  const startedAtRef = useRef<number | null>(null);

  const startGeneration = useCallback(
    async (values: VideoGenerationFormValues) => {
      setState({ status: "pending", progress: 0, errorMessage: undefined });
      startedAtRef.current = Date.now();

      try {
        const response = await requestVideoGeneration(values);
        setState({
          status: response.status,
          progress: response.progress,
          requestId: response.requestId,
          errorMessage: response.errorMessage,
          result: response.result,
        });
      } catch (error) {
        setState({
          status: "failed",
          progress: 0,
          errorMessage:
            error instanceof Error ? error.message : "요청에 실패했습니다.",
        });
      }
    },
    [],
  );

  useEffect(() => {
    const requestId = state.requestId;
    if (!requestId) {
      return undefined;
    }

    if (state.status === "completed" || state.status === "failed") {
      return undefined;
    }

    let isActive = true;

    const poll = async () => {
      const startedAt = startedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > pollTimeoutMs) {
        if (isActive) {
          setState((prev) => ({
            ...prev,
            status: "failed",
            errorMessage: "응답 시간이 초과되었습니다.",
          }));
        }
        return;
      }

      try {
        const response = await fetchVideoGenerationStatus(requestId);
        if (!isActive) return;
        setState((prev) => ({
          ...prev,
          status: response.status,
          progress: response.progress,
          errorMessage: response.errorMessage,
          result: response.result,
        }));
      } catch (error) {
        if (!isActive) return;
        setState((prev) => ({
          ...prev,
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "상태 조회에 실패했습니다.",
        }));
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    void poll();

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [state.requestId, state.status]);

  const reset = useCallback(() => {
    startedAtRef.current = null;
    setState(initialState);
  }, []);

  return {
    state,
    startGeneration,
    reset,
  };
}
