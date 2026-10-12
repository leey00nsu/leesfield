import type { Instrumentation } from "next";
import { logger } from "@/shared/logging/logger.mjs";
import { REQUEST_ID_HEADER, requestIdFromValue } from "@/shared/http/request-id";

// Include server rendering, actions and proxy failures that never reach an API
// route wrapper. Use the matched route template, never the incoming URL/path.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const header = request.headers[REQUEST_ID_HEADER];
  logger.error("server.request.failed", error, {
    requestId: requestIdFromValue(typeof header === "string" ? header : undefined),
    method: request.method,
    route: context.routePath,
    operation: context.routeType,
    phase: "request.framework",
  });
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { getServerEnv } = await import("@/server/runtime/env");
  getServerEnv();

  const { startWorkerSupervisor } = await import(
    "@/server/runtime/worker-supervisor"
  );
  startWorkerSupervisor();
}
