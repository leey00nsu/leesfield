"use client";

import { useEffect, useState } from "react";
import type { OpenApiDocument } from "./openapi-types";

type OpenApiState = {
  document: OpenApiDocument | null;
  isLoading: boolean;
  error: string | null;
};

export function useOpenApiDocument() {
  const [state, setState] = useState<OpenApiState>({
    document: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    setState((prev) => ({
      document: prev.document,
      isLoading: true,
      error: null,
    }));

    void (async () => {
      try {
        const response = await fetch("/api/openapi", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.message ?? "OpenAPI 스키마를 불러오지 못했습니다.";
          throw new Error(message);
        }

        const payload = (await response.json().catch(() => {
          throw new Error("OpenAPI 스키마 파싱에 실패했습니다.");
        })) as OpenApiDocument;

        if (!isActive) return;
        setState({
          document: payload,
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
          document: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "OpenAPI 스키마를 불러오지 못했습니다.",
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
