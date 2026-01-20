import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type {
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

const HISTORY_QUERY_KEY = "history";

export function useHistoryQuery(params: UseHistoryQueryParams) {
  const t = useTranslations("history");
  const { type, query, sort, limit, offset } = params;
  const queryResult = useQuery({
    queryKey: [HISTORY_QUERY_KEY, type, query, sort, limit, offset],
    queryFn: ({ signal }) =>
      fetchHistory({ type, query, sort, limit, offset }, { signal }),
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  return {
    data: queryResult.data ?? null,
    isLoading: queryResult.isLoading,
    refetch: queryResult.refetch,
    error: queryResult.error ? t("error") : null,
  };
}
