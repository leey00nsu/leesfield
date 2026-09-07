import { useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { GenerationHistoryItem, GenerationHistoryResponse, GenerationHistorySort, GenerationHistoryType } from "@/entities/generation/model/types";
import { historyKeys, useHistoryQuery } from "./use-history-query";
import { useHistoryStatusQuery } from "./use-history-status-query";

export interface UseGenerationHistoryListOptions {
  type: GenerationHistoryType;
  sort: GenerationHistorySort;
  query: string;
  status?: string;
  limit?: number;
}
export function useGenerationHistoryList({ type, sort, query, status = "all", limit = 24 }: UseGenerationHistoryListOptions) {
  const client = useQueryClient();
  const result = useHistoryQuery({ type, sort, query, status, limit });
  const { data, refetch, fetchNextPage, isFetching, hasNextPage, error } = result;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastStatus = useRef<string | null>(null);
  const { data: statusData } = useHistoryStatusQuery({ type, query });
  const seen = new Set<string>();
  const items = (data?.pages.flatMap(page => page.items) ?? []).filter(item => {
    const key = [item.origin ?? "generation", item.type, item.id].join(":");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  useEffect(() => { lastStatus.current = null; }, [type, query, sort, status]);
  useEffect(() => {
    if (!statusData) return;
    const token = JSON.stringify([statusData.activeCount, statusData.latestUpdatedAt]);
    // Keep a pending change until the current page fetch finishes.
    if (isFetching) return;
    if (lastStatus.current !== null && lastStatus.current !== token) void refetch();
    lastStatus.current = token;
  }, [statusData, isFetching, refetch]);
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasNextPage || isFetching || error) return;
    let requested = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting || requested) return;
      requested = true;
      void fetchNextPage({ cancelRefetch: false });
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, error, fetchNextPage, items.length]);
  const removeItem = async (item: Pick<GenerationHistoryItem, "id" | "type">) => {
    await client.cancelQueries({ queryKey: historyKeys.all });
    client.setQueriesData<InfiniteData<GenerationHistoryResponse>>({ queryKey: historyKeys.all }, old => {
      if (!old) return old;
      const found = old.pages.some(page => page.items.some(row => row.id === item.id && row.type === item.type));
      if (!found) return old;
      return { ...old, pages: old.pages.map(page => ({ ...page, total: Math.max(0, page.total - 1), items: page.items.filter(row => row.id !== item.id || row.type !== item.type) })) };
    });
    void client.invalidateQueries({ queryKey: historyKeys.all });
    void client.invalidateQueries({ queryKey: ["media-assets"] });
  };
  return { items, total: data?.pages[0]?.total ?? 0, isLoading: result.isLoading, isFetchingNextPage: result.isFetchingNextPage, isRefreshing: result.isRefetching, hasNextPage, error, sentinelRef, removeItem, retry: () => result.isFetchNextPageError ? fetchNextPage() : refetch() };
}
