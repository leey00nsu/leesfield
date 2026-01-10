import { useEffect, useMemo, useState } from "react";
import type {
  GenerationHistoryResponse,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { fetchHistory } from "@/features/generation-history/api/history-api";

export type UseHistoryQueryParams = {
  type: GenerationHistoryType;
  query: string;
  sort: GenerationHistorySort;
  limit: number;
  offset: number;
};

export type HistoryQueryState = {
  data: GenerationHistoryResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function useHistoryQuery(params: UseHistoryQueryParams) {
  const [state, setState] = useState<HistoryQueryState>({
    data: null,
    isLoading: true,
    error: null,
  });

  const key = useMemo(() => JSON.stringify(params), [params]);
  const memoParams = useMemo(() => params, [key]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    setState((prev) => ({
      data: prev.data,
      isLoading: true,
      error: null,
    }));

    void (async () => {
      try {
        const data = await fetchHistory(memoParams, { signal: controller.signal });
        if (!isActive) return;
        setState({ data, isLoading: false, error: null });
      } catch (error) {
        if (
          (error instanceof Error && error.name === "AbortError") ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        if (!isActive) return;
        setState({
          data: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "히스토리 조회에 실패했습니다.",
        });
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [key, memoParams]);

  return state;
}
