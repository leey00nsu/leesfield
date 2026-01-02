import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";
import {
  fetchImageGenerationStatus,
  requestImageGeneration,
} from "@/features/image-generation/api/image-generation-api";

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 60_000;

export type ImageGenerationState = {
  status: ImageGenerationStatus | "idle";
  progress: number;
  requestId?: string;
  errorMessage?: string;
  result?: ImageGenerationResponse["result"];
};

const initialState: ImageGenerationState = {
  status: "idle",
  progress: 0,
};

export function useImageGeneration() {
  const [state, setState] = useState<ImageGenerationState>(initialState);
  const startedAtRef = useRef<number | null>(null);

  const startGeneration = useCallback(
    async (values: ImageGenerationFormValues) => {
      setState({ status: "pending", progress: 0 });
      startedAtRef.current = Date.now();

      try {
        const response = await requestImageGeneration(values);
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
    if (!state.requestId) {
      return undefined;
    }

    if (state.status === "completed" || state.status === "failed") {
      return undefined;
    }

    let isActive = true;

    const poll = async () => {
      const startedAt = startedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
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
        const response = await fetchImageGenerationStatus(state.requestId);
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
