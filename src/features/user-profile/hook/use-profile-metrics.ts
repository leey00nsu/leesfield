"use client";

import { useQuery } from "@tanstack/react-query";

interface ProfileMetricsState {
  generationTotal: number | null;
  isLoading: boolean;
  error: string | null;
}

interface HistoryResponse {
  total?: number;
}

export function useProfileMetrics() {
  const queryResult = useQuery({
    queryKey: ["profile-metrics", "generation-total"],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        "/api/history?type=all&limit=1&offset=0&sort=date_desc",
        {
          method: "GET",
          cache: "no-store",
          signal,
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.message ?? "히스토리 조회에 실패했습니다.";
        throw new Error(message);
      }

      const payload = (await response.json().catch(() => {
        throw new Error("응답 파싱에 실패했습니다.");
      })) as HistoryResponse;

      return typeof payload.total === "number" ? payload.total : null;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  return {
    generationTotal: queryResult.data ?? null,
    isLoading: queryResult.isLoading,
    error:
      queryResult.error instanceof Error
        ? queryResult.error.message
        : queryResult.error
          ? "히스토리 조회에 실패했습니다."
          : null,
  } satisfies ProfileMetricsState;
}
