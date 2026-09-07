import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { fetchHistory, type HistoryQueryParams } from "../api/history-api";

export type UseHistoryQueryParams = Omit<HistoryQueryParams, "offset" | "cursor">;
export const historyKeys = { all: ["history"] as const, list: (params: UseHistoryQueryParams) => ["history", params] as const };
export function useHistoryQuery(params: UseHistoryQueryParams) {
  const t = useTranslations("history");
  const result = useInfiniteQuery({
    queryKey: historyKeys.list(params),
    queryFn: ({ signal, pageParam }) => fetchHistory({ ...params, cursor: pageParam }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
  return { ...result, error: result.error ? t("error") : null };
}
