import type { QueueStatusResponse } from "@/features/monitoring-queue/model/types";

export async function fetchQueueStatus(): Promise<QueueStatusResponse> {
  const response = await fetch("/api/monitoring/queue", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("REQUEST_FAILED");
  }

  return response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });
}
