"use client";

import { useEffect, useState } from "react";

type ProfileMetricsState = {
  generationTotal: number | null;
  isLoading: boolean;
  error: string | null;
};

type HistoryResponse = {
  total?: number;
};

export function useProfileMetrics() {
  const [state, setState] = useState<ProfileMetricsState>({
    generationTotal: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    setState((prev) => ({
      generationTotal: prev.generationTotal,
      isLoading: true,
      error: null,
    }));

    void (async () => {
      try {
        const response = await fetch(
          "/api/history?type=all&limit=1&offset=0&sort=date_desc",
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
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

        if (!isActive) return;
        setState({
          generationTotal:
            typeof payload.total === "number" ? payload.total : null,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (
          (error instanceof Error && error.name === "AbortError") ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        if (!isActive) return;
        setState({
          generationTotal: null,
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
  }, []);

  return state;
}
