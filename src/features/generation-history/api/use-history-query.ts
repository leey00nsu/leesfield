import { useEffect, useState } from "react";
import type {
  GenerationHistoryResponse,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { fetchHistory } from "@/features/generation-history/api/history-api";

export interface UseHistoryQueryParams {
  type: GenerationHistoryType;
  query: string;
  sort: GenerationHistorySort;
  limit: number;
  offset: number;
}

export interface HistoryQueryState {
  data: GenerationHistoryResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useHistoryQuery(params: UseHistoryQueryParams) {
  const { type, query, sort, limit, offset } = params;
  const [state, setState] = useState<HistoryQueryState>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    // params 변경 시 로딩 상태를 초기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({
      data: prev.data,
      isLoading: true,
      error: null,
    }));

    void (async () => {
      try {
        const data = await fetchHistory(
          { type, query, sort, limit, offset },
          { signal: controller.signal },
        );
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
  }, [limit, offset, query, sort, type]);

  return state;
}
