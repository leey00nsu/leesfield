import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type {
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import {
  fetchHistoryStatus,
  type HistoryStatusResponse,
} from "@/features/generation-history/api/history-status-api";

export interface UseHistoryStatusQueryParams {
  type: GenerationHistoryType;
  query: string;
}

const HISTORY_STATUS_QUERY_KEY = "history-status";
const HISTORY_STATUS_POLL_INTERVAL_MS = 2000;

export function useHistoryStatusQuery(params: UseHistoryStatusQueryParams) {
  const t = useTranslations("history");
  const { type, query } = params;
  const queryResult = useQuery({
    queryKey: [HISTORY_STATUS_QUERY_KEY, type, query],
    queryFn: ({ signal }) =>
      fetchHistoryStatus({ type, query }, { signal }),
    staleTime: 0,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchInterval: (currentQuery) => {
      const data = currentQuery.state.data as HistoryStatusResponse | undefined;
      return data?.hasActive ? HISTORY_STATUS_POLL_INTERVAL_MS : false;
    },
    refetchIntervalInBackground: true,
  });

  return {
    data: queryResult.data ?? null,
    isLoading: queryResult.isLoading,
    error: queryResult.error ? t("error") : null,
  };
}
