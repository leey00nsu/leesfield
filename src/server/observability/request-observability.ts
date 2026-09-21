import { AsyncLocalStorage } from "node:async_hooks";

import {
  REQUEST_ID_HEADER,
  requestIdFromValue,
} from "@/shared/http/request-id";

import {
  recordHttpRequest,
  recordDatabaseQuery,
  recordProviderRequest,
  type MetricProvider,
} from "./metrics";

export type RequestContext = {
  requestId: string;
  route: string;
  method: string;
  startedAt: number;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

function requestFromArgs(args: readonly unknown[]): Request | undefined {
  for (const value of args) {
    if (
      typeof value === "object" &&
      value !== null &&
      "headers" in value &&
      "method" in value &&
      "url" in value
    ) {
      return value as Request;
    }
  }
  return undefined;
}

function safeErrorType(error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z0-9_$.-]{1,64}$/.test(name) ? name : "UnknownError";
}

function safeStructuredValue(
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value === undefined || value === null || typeof value !== "string") {
    return value;
  }
  if (value.length > 96 || /[\r\n]/.test(value)) return "redacted";
  if (key === "requestId") {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value)
      ? value
      : "redacted";
  }
  if (key === "jobId") {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value)
      ? value
      : "redacted";
  }
  if (key === "method") {
    return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|UNKNOWN|OTHER)$/.test(value)
      ? value
      : "OTHER";
  }
  if (key === "route") {
    return /^\/api\/[A-Za-z0-9_./:[\]-]{1,96}$/.test(value)
      ? value
      : "unknown";
  }
  return /^[A-Za-z0-9_$./:-]{1,96}$/.test(value) ? value : "redacted";
}

function structuredLog(
  level: "info" | "error",
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
) {
  const allowedFields = new Set([
    "requestId",
    "jobId",
    "method",
    "route",
    "status",
    "durationMs",
    "errorType",
    "provider",
    "operation",
    "phase",
    "kind",
    "outcome",
    "worker",
    "state",
    "pending",
    "processing",
    "oldestPendingAgeSeconds",
    "failedCleanup",
  ]);
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => allowedFields.has(key) && value !== undefined,
    ).map(([key, value]) => [key, safeStructuredValue(key, value)]),
  );
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event: /^[A-Za-z0-9_.-]{1,64}$/.test(event) ? event : "unknown",
    ...safeFields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

function attachRequestId(response: Response, requestId: string) {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
  } catch {
    // The response may use immutable headers; the request is still logged.
  }
  return response;
}

export function getRequestContext() {
  return requestContextStorage.getStore();
}

export function withRequestObservability<T extends (...args: never[]) => Response | Promise<Response>>(
  route: string,
  handler: T,
): (...args: Parameters<T>) => Promise<Response> {
  return async (...args: Parameters<T>) => {
    const request = requestFromArgs(args);
    const method = request?.method ?? "UNKNOWN";
    const requestId = requestIdFromValue(
      request?.headers.get(REQUEST_ID_HEADER),
    );
    const startedAt = Date.now();
    const context: RequestContext = { requestId, route, method, startedAt };

    return requestContextStorage.run(context, async () => {
      try {
        const response = await handler(...args);
        const durationMs = Date.now() - startedAt;
        recordHttpRequest({
          method,
          route,
          status: response.status,
          durationMs,
        });
        structuredLog("info", "http.request", {
          requestId,
          method,
          route,
          status: response.status,
          durationMs,
        });
        return attachRequestId(response, requestId);
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        recordHttpRequest({ method, route, status: 500, durationMs });
        structuredLog("error", "http.request.error", {
          requestId,
          method,
          route,
          status: 500,
          durationMs,
          errorType: safeErrorType(error),
        });
        throw error;
      }
    });
  };
}

export async function measureDatabase<T>(
  operation: string,
  work: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await work();
    recordDatabaseQuery({
      operation,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return result;
  } catch (error) {
    recordDatabaseQuery({
      operation,
      durationMs: Date.now() - startedAt,
      success: false,
    });
    throw error;
  }
}

export async function measureProvider<T>(
  provider: MetricProvider,
  work: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await work();
    recordProviderRequest({
      provider,
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    recordProviderRequest({
      provider,
      status: "error",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export function logStructured(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
  level: "info" | "error" = "info",
) {
  structuredLog(level, event, fields);
}

/** Logs only an allowlisted error classification, never message, stack, or cause. */
export function logSafeError(
  event: string,
  error: unknown,
  fields: Record<string, string | number | boolean | null | undefined> = {},
) {
  structuredLog("error", event, {
    ...fields,
    errorType: error instanceof Error ? error.name : typeof error,
  });
}
