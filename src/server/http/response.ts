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

export function buildConcurrentLimitResponse(requestId?: string, status = 429) {
  return jsonWithNoStore(
    errorResponseSchema.parse({ message: "IN_PROGRESS_ALREADY", requestId }),
    { status },
  );
}
