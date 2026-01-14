"use client";

import { useQuery } from "@tanstack/react-query";
import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";

const OPEN_API_QUERY_KEY = "openapi-document";

async function fetchOpenApiDocument(signal?: AbortSignal) {
  const response = await fetch("/api/openapi", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "OpenAPI 스키마를 불러오지 못했습니다.";
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => {
    throw new Error("OpenAPI 스키마 파싱에 실패했습니다.");
  })) as OpenApiDocument;

  return payload;
}

export function useOpenApiDocument() {
  const queryResult = useQuery({
    queryKey: [OPEN_API_QUERY_KEY],
    queryFn: ({ signal }) => fetchOpenApiDocument(signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  return {
    document: queryResult.data ?? null,
    isLoading: queryResult.isLoading,
    error:
      queryResult.error instanceof Error
        ? queryResult.error.message
        : queryResult.error
          ? "OpenAPI 스키마를 불러오지 못했습니다."
          : null,
  };
}
