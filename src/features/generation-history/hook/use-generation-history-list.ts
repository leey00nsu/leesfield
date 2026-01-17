import { useEffect, useReducer, useRef, type RefObject } from "react";
import type {
  GenerationHistoryItem,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { useHistoryQuery } from "@/features/generation-history/hook/use-history-query";
import { useHistoryStatusQuery } from "@/features/generation-history/hook/use-history-status-query";

const DEFAULT_LIMIT = 24;

interface GenerationHistoryListState {
  offset: number;
  items: GenerationHistoryItem[];
  total: number;
}

type GenerationHistoryListAction =
  | { type: "reset" }
  | { type: "advance"; amount: number }
  | { type: "replace"; items: GenerationHistoryItem[]; total: number }
  | { type: "append"; items: GenerationHistoryItem[]; total: number };

const initialState: GenerationHistoryListState = {
  offset: 0,
  items: [],
  total: 0,
};

function reducer(
  state: GenerationHistoryListState,
  action: GenerationHistoryListAction,
): GenerationHistoryListState {
  switch (action.type) {
    case "reset":
      return { offset: 0, items: [], total: 0 };
    case "advance":
      return { ...state, offset: state.offset + action.amount };
    case "replace":
      return { ...state, items: action.items, total: action.total };
    case "append": {
      // API 페이지가 겹치는 경우를 대비해 동일 항목을 제거한다.
      const merged = [...state.items];
      const seen = new Set(
        state.items.map((item) => `${item.type}-${item.id}`),
      );
      for (const item of action.items) {
        const key = `${item.type}-${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      return { ...state, items: merged, total: action.total };
    }
    default:
      return state;
  }
}

export interface UseGenerationHistoryListOptions {
  type: GenerationHistoryType;
  sort: GenerationHistorySort;
  query: string;
  limit?: number;
}

export interface UseGenerationHistoryListResult {
  items: GenerationHistoryItem[];
  total: number;
  isLoading: boolean;
  error: string | null;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

export function useGenerationHistoryList({
  type,
  sort,
  query,
  limit = DEFAULT_LIMIT,
}: UseGenerationHistoryListOptions): UseGenerationHistoryListResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 옵저버가 연속으로 트리거되는 상황을 막기 위한 플래그.
  const isFetchingNextRef = useRef(false);
  const lastStatusTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // 검색 조건이 바뀌면 페이지네이션 상태를 초기화한다.
    dispatch({ type: "reset" });
    isFetchingNextRef.current = false;
    lastStatusTokenRef.current = null;
  }, [type, sort, query]);

  const { data, isLoading, error, refetch } = useHistoryQuery({
    type,
    query,
    sort,
    limit,
    offset: state.offset,
  });
  const { data: statusData } = useHistoryStatusQuery({
    type,
    query,
  });

  useEffect(() => {
    if (!data) return;
    dispatch({
      type: state.offset === 0 ? "replace" : "append",
      items: data.items,
      total: data.total,
    });
    isFetchingNextRef.current = false;
  }, [data, state.offset]);

  useEffect(() => {
    if (error) {
      isFetchingNextRef.current = false;
    }
  }, [error]);

  useEffect(() => {
    if (!statusData) return;
    const token = `${statusData.activeCount}:${statusData.latestUpdatedAt ?? "none"}`;
    if (lastStatusTokenRef.current && lastStatusTokenRef.current !== token) {
      void refetch();
    }
    lastStatusTokenRef.current = token;
  }, [statusData, refetch]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (error) return;
        if (isLoading) return;
        if (state.total === 0 || state.items.length >= state.total) return;
        if (isFetchingNextRef.current) return;
        isFetchingNextRef.current = true;
        dispatch({ type: "advance", amount: limit });
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [error, isLoading, limit, state.items.length, state.total]);

  return {
    items: state.items,
    total: state.total,
    isLoading,
    error,
    sentinelRef,
  };
}
