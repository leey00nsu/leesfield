import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  GRAPH_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";
import { nodeExecutionErrorResponse } from "@/server/node-executions/node-execution-http";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";
import { logSafeError } from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ graphId: string; nodeId: string; executionId: string }>;
};

async function ownerEmail() {
  const session = await getSession();
  return session.isLoggedIn ? session.adminEmail ?? null : null;
}

function unexpected(operation: string, error: unknown) {
  logSafeError("node_execution.request_failed", error, { operation });
  return buildErrorResponse("DB_SAVE_FAILED", 500);
}

async function getObservedHandler(_request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const { graphId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({
      execution: await nodeExecutionService.get(owner, graphId, nodeId, executionId),
    });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"});
    return nodeExecutionErrorResponse(error) ?? unexpected("get", error);
  }
}

async function deleteObservedHandler(request: Request, context: RouteContext) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const owner = await ownerEmail();
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const { graphId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({
      execution: await nodeExecutionService.cancel(owner, graphId, nodeId, executionId),
    });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"});
    return nodeExecutionErrorResponse(error) ?? unexpected("cancel", error);
  }
}

async function patchObservedHandler(request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  const bounded = await readRouteJsonBody(request, GRAPH_BODY_LIMIT_BYTES);
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  try {
    const { graphId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({
      execution: await nodeExecutionService.update(owner, graphId, nodeId, executionId, body),
    });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"});
    return nodeExecutionErrorResponse(error) ?? unexpected("update", error);
  }
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/generation-graphs/[graphId]/nodes/[nodeId]/executions/[executionId]", getObservedHandler);
export const DELETE = withRequestObservability("/api/generation-graphs/[graphId]/nodes/[nodeId]/executions/[executionId]", deleteObservedHandler);
export const PATCH = withRequestObservability("/api/generation-graphs/[graphId]/nodes/[nodeId]/executions/[executionId]", patchObservedHandler);
