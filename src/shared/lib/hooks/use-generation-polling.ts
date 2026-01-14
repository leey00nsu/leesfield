import { useCallback, useEffect, useRef, useState } from "react";

export interface GenerationPollingResponse<TStatus extends string, TResult> {
  requestId: string;
  status: TStatus;
  progress: number;
  result?: TResult;
  errorMessage?: string;
}

export interface GenerationPollingState<TStatus extends string, TResult> {
  status: TStatus | "idle";
  progress: number;
  requestId?: string;
  result?: TResult;
  errorMessage?: string;
}

export interface UseGenerationPollingOptions<
  TValues,
  TStatus extends string,
  TResult,
> {
  request: (values: TValues) => Promise<GenerationPollingResponse<TStatus, TResult>>;
  poll: (requestId: string) => Promise<GenerationPollingResponse<TStatus, TResult>>;
  pollIntervalMs: number;
  timeoutMs: number;
  startStatus: TStatus;
  errorStatus: TStatus;
  timeoutStatus: TStatus;
  terminalStatuses: ReadonlyArray<TStatus>;
  requestErrorMessage: string;
  pollErrorMessage: string;
  timeoutMessage: string;
}

export interface GenerationPollingHandlers<TStatus extends string, TResult, TValues> {
  state: GenerationPollingState<TStatus, TResult>;
  startGeneration: (values: TValues) => Promise<void>;
  reset: () => void;
}

export function useGenerationPolling<
  TValues,
  TStatus extends string,
  TResult,
>({
  request,
  poll,
  pollIntervalMs,
  timeoutMs,
  startStatus,
  errorStatus,
  timeoutStatus,
  terminalStatuses,
  requestErrorMessage,
  pollErrorMessage,
  timeoutMessage,
}: UseGenerationPollingOptions<TValues, TStatus, TResult>): GenerationPollingHandlers<
  TStatus,
  TResult,
  TValues
> {
  const [state, setState] = useState<GenerationPollingState<TStatus, TResult>>({
    status: "idle",
    progress: 0,
  });
  const startedAtRef = useRef<number | null>(null);

  const startGeneration = useCallback(
    async (values: TValues) => {
      setState({
        status: startStatus,
        progress: 0,
        requestId: undefined,
        errorMessage: undefined,
        result: undefined,
      });
      startedAtRef.current = Date.now();

      try {
        const response = await request(values);
        setState({
          status: response.status,
          progress: response.progress,
          requestId: response.requestId,
          errorMessage: response.errorMessage,
          result: response.result,
        });
      } catch (error) {
        setState({
          status: errorStatus,
          progress: 0,
          errorMessage:
            error instanceof Error ? error.message : requestErrorMessage,
        });
      }
    },
    [errorStatus, request, requestErrorMessage, startStatus],
  );

  useEffect(() => {
    const requestId = state.requestId;
    if (!requestId) {
      return undefined;
    }

    if (terminalStatuses.includes(state.status as TStatus)) {
      return undefined;
    }

    let isActive = true;

    const pollOnce = async () => {
      const startedAt = startedAtRef.current ?? Date.now();
      // 무한 폴링 방지를 위해 시작 시점 기준으로 타임아웃을 강제한다.
      if (Date.now() - startedAt > timeoutMs) {
        if (isActive) {
          setState((prev) => ({
            ...prev,
            status: timeoutStatus,
            errorMessage: timeoutMessage,
          }));
        }
        return;
      }

      try {
        const response = await poll(requestId);
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
          status: errorStatus,
          errorMessage:
            error instanceof Error ? error.message : pollErrorMessage,
        }));
      }
    };

    const interval = setInterval(pollOnce, pollIntervalMs);
    void pollOnce();

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [
    errorStatus,
    poll,
    pollErrorMessage,
    pollIntervalMs,
    state.requestId,
    state.status,
    terminalStatuses,
    timeoutMessage,
    timeoutMs,
    timeoutStatus,
  ]);

  const reset = useCallback(() => {
    startedAtRef.current = null;
    setState({ status: "idle", progress: 0 });
  }, []);

  return {
    state,
    startGeneration,
    reset,
  };
}
