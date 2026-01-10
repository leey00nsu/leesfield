import type {
  GenerationHistoryResponse,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";

export type HistoryQueryParams = {
  type: GenerationHistoryType;
  query: string;
  sort: GenerationHistorySort;
  limit: number;
  offset: number;
};

function buildHistoryUrl(params: HistoryQueryParams) {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set("type", params.type);
  if (params.query) searchParams.set("query", params.query);
  if (params.sort) searchParams.set("sort", params.sort);
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));

  return `/api/history?${searchParams.toString()}`;
}

export async function fetchHistory(
  params: HistoryQueryParams,
  options?: { signal?: AbortSignal },
): Promise<GenerationHistoryResponse> {
  const response = await fetch(buildHistoryUrl(params), {
    method: "GET",
    cache: "no-store",
    signal: options?.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "히스토리 조회에 실패했습니다.";
    throw new Error(message);
  }

  const result = await response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });

  return result as GenerationHistoryResponse;
}
