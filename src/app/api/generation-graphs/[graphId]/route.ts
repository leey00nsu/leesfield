import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { buildGenerationGraphKnownErrorResponse } from "@/server/generation-graph/generation-graph-http";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { logSafeError } from "@/server/observability/request-observability";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  GRAPH_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ graphId: string }> };

async function authenticatedOwnerEmail() {
  const session = await getSession();
  return session.isLoggedIn ? session.adminEmail ?? null : null;
}

function unexpectedError(operation: string, error: unknown) {
  logSafeError("generation_graph.request_failed", error, { operation });
  return buildErrorResponse("DB_SAVE_FAILED", 500);
}

async function getObservedHandler(_request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  try {
    const { graphId } = await context.params;
    const graph = await generationGraphService.get(ownerEmail, graphId);
    return jsonWithNoStore({ graph });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"});
    return buildGenerationGraphKnownErrorResponse(error) ?? unexpectedError("get", error);
  }
}

async function putObservedHandler(request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  const bounded = await readRouteJsonBody(request, GRAPH_BODY_LIMIT_BYTES);
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  try {
    const { graphId } = await context.params;
    const graph = await generationGraphService.update(ownerEmail, graphId, body);
    return jsonWithNoStore({ graph });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"});
    return buildGenerationGraphKnownErrorResponse(error) ?? unexpectedError("update", error);
  }
}

async function deleteObservedHandler(request: Request, context: RouteContext) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  try {
    const { graphId } = await context.params;
    await generationGraphService.remove(ownerEmail, graphId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"});
    return buildGenerationGraphKnownErrorResponse(error) ?? unexpectedError("delete", error);
  }
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/generation-graphs/[graphId]", getObservedHandler);
export const PUT = withRequestObservability("/api/generation-graphs/[graphId]", putObservedHandler);
export const DELETE = withRequestObservability("/api/generation-graphs/[graphId]", deleteObservedHandler);
