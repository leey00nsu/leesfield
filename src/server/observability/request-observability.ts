import { serverLogger, withLogContext } from "./logger";
import type { LogFields } from "@/shared/logging/logger.mjs";
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

function structuredLog(level: "info" | "error", event: string, fields: LogFields) {
  serverLogger.log(level, event, fields);
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
    // External API helpers may be nested inside an observed route. Keep one
    // request identity and completion event rather than starting another request.
    if (getRequestContext()) return await handler(...args);
    const request = requestFromArgs(args);
    const method = request?.method ?? "UNKNOWN";
    const requestId = requestIdFromValue(
      request?.headers.get(REQUEST_ID_HEADER),
    );
    const startedAt = Date.now();
    const context: RequestContext = { requestId, route, method, startedAt };

    return requestContextStorage.run(context, () => withLogContext({ requestId, route, method }, async () => {
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
        serverLogger.error("http.request.error", error, {
          requestId,
          method,
          route,
          status: 500,
          durationMs,
        });
        throw error;
      }
    }));
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
    serverLogger.error("database.failed", error, { operation, phase: "database", durationMs: Date.now() - startedAt });
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
    serverLogger.error("provider.failed", error, { provider, phase: "provider.request", durationMs: Date.now() - startedAt });
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

/** Bounded error diagnostics without arbitrary messages or input values. */
export function logSafeError(event: string, error: unknown, fields: LogFields = {}) {
  serverLogger.error(event, error, fields);
}
