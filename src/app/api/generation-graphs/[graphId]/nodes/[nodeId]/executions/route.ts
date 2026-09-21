import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  GRAPH_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";
import { nodeExecutionErrorResponse } from "@/server/node-executions/node-execution-http";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";
import { readIdempotencyKey } from "@/server/generation-admission/admitted-submission";
import { logSafeError } from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ graphId: string; nodeId: string }>;
};

async function ownerEmail() {
  const session = await getSession();
  return session.isLoggedIn ? session.adminEmail ?? null : null;
}

function unexpected(operation: string, error: unknown) {
  logSafeError("node_execution.request_failed", error, { operation });
  return buildErrorResponse("DB_SAVE_FAILED", 500);
}

export async function GET(_request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const { graphId, nodeId } = await context.params;
    return jsonWithNoStore({
      executions: await nodeExecutionService.list(owner, graphId, nodeId),
    });
  } catch (error) {
    return nodeExecutionErrorResponse(error) ?? unexpected("list", error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  const bounded = await readRouteJsonBody(request, GRAPH_BODY_LIMIT_BYTES);
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  try {
    const { graphId, nodeId } = await context.params;
    const result = await nodeExecutionService.execute(
      owner,
      graphId,
      nodeId,
      body,
      readIdempotencyKey(request),
    );
    const execution = "operation" in result && result.operation
      ? {
          executionId: result.operation.id,
          executionKind: "media_operation" as const,
          mediaType: result.mediaType,
          graphNodeId: nodeId,
          status: result.operation.status,
          progress: result.operation.progress,
          ...(result.plan ? { plan: result.plan } : {}),
        }
      : {
          executionId: result.record.id,
          executionKind: "generation" as const,
          mediaType: result.mediaType,
          graphNodeId: nodeId,
          status: result.record.status,
          progress: result.record.progress,
        };
    return jsonWithNoStore(
      { execution },
      { status: 202 },
    );
  } catch (error) {
    return nodeExecutionErrorResponse(error) ?? unexpected("execute", error);
  }
}
