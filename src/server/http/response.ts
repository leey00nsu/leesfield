import {
  errorResponseSchema,
  generationResponseSchema,
} from "@/shared/api/external-contract";
import { NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type GenerationRecord = {
  id: string;
  status: string;
  progress: number;
};

export function jsonWithNoStore<T>(body: T, init: ResponseInit = {}) {
  const headers = {
    ...NO_STORE_HEADERS,
    ...(init.headers ?? {}),
  };
  return NextResponse.json(body, { ...init, headers });
}

export function buildGenerationSuccessResponse(record: GenerationRecord) {
  return jsonWithNoStore(
    generationResponseSchema.parse({
      requestId: record.id,
      status: record.status,
      progress: record.progress,
    }),
  );
}

export function buildInvalidRequestResponse(errors: unknown) {
  return jsonWithNoStore(
    errorResponseSchema.parse({ message: "INVALID_REQUEST", errors }),
    { status: 400 },
  );
}

export function buildErrorResponse(message: string, status = 500) {
  return jsonWithNoStore(errorResponseSchema.parse({ message }), { status });
}

export function buildRateLimitedResponse(retryAfterSeconds: number) {
  return jsonWithNoStore(errorResponseSchema.parse({ message: "RATE_LIMITED" }), {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });
}

/** The shared budget could not be read; ask the caller to retry shortly. */
export function buildRateLimitUnavailableResponse() {
  return jsonWithNoStore(
    errorResponseSchema.parse({ message: "RATE_LIMIT_UNAVAILABLE" }),
    { status: 503, headers: { "Retry-After": "5" } },
  );
}

/** Queue capacity is exhausted; the caller may retry after the hint. */
export function buildQueueFullResponse(
  reason: "OWNER_LIMIT" | "PROVIDER_LIMIT" | "GLOBAL_LIMIT",
) {
  const status = reason === "GLOBAL_LIMIT" ? 503 : 429;
  return jsonWithNoStore(
    errorResponseSchema.parse({ message: "GENERATION_QUEUE_FULL", reason }),
    { status, headers: { "Retry-After": "30" } },
  );
}

export function buildConcurrentLimitResponse(requestId?: string, status = 429) {
  return jsonWithNoStore(
    errorResponseSchema.parse({ message: "IN_PROGRESS_ALREADY", requestId }),
    { status },
  );
}
