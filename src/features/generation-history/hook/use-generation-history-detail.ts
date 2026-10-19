"use client";
import { useQuery } from "@tanstack/react-query";
import type { MonitoringRequestDetail } from "@/features/monitoring-dashboard/model/types";

export function useGenerationHistoryDetail(type: "image" | "video" | "audio", id: string, enabled: boolean, origin: "generation" | "edit") {
  return useQuery({
    queryKey: ["history", "detail", type, origin, id], enabled, staleTime: 30_000, retry: 1,
    queryFn: async (): Promise<MonitoringRequestDetail> => {
      const response = await fetch(`/api/history/${encodeURIComponent(id)}?type=${type}&origin=${origin}&view=detail`, { cache: "no-store" });
      if (!response.ok) throw new Error("HISTORY_DETAIL_UNAVAILABLE");
      return response.json();
    },
  });
}
