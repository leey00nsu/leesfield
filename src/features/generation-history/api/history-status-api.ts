export interface HistoryStatusQueryParams {
  type: string;
  query: string;
}

export interface HistoryStatusResponse {
  hasActive: boolean;
  activeCount: number;
  latestUpdatedAt: string | null;
}

function buildHistoryStatusUrl(params: HistoryStatusQueryParams) {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set("type", params.type);
  if (params.query) searchParams.set("query", params.query);

  return `/api/history/status?${searchParams.toString()}`;
}

export async function fetchHistoryStatus(
  params: HistoryStatusQueryParams,
  options?: { signal?: AbortSignal },
): Promise<HistoryStatusResponse> {
  const response = await fetch(buildHistoryStatusUrl(params), {
    method: "GET",
    cache: "no-store",
    signal: options?.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "히스토리 상태 조회에 실패했습니다.";
    throw new Error(message);
  }

  const result = await response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });

  return result as HistoryStatusResponse;
}
