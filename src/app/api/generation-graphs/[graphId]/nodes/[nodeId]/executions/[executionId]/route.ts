import { getSession } from "@/server/auth/session";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { nodeExecutionErrorResponse } from "@/server/node-executions/node-execution-http";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";

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
  console.error(`[node-executions] ${operation} failed`, error);
  return buildErrorResponse("DB_SAVE_FAILED", 500);
}

export async function GET(_request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const { graphId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({
      execution: await nodeExecutionService.get(owner, graphId, nodeId, executionId),
    });
  } catch (error) {
    return nodeExecutionErrorResponse(error) ?? unexpected("get", error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const { graphId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({
      execution: await nodeExecutionService.cancel(owner, graphId, nodeId, executionId),
    });
  } catch (error) {
    return nodeExecutionErrorResponse(error) ?? unexpected("cancel", error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const owner = await ownerEmail();
  if (!owner) return buildErrorResponse("UNAUTHORIZED", 401);
  const body = await request.json().catch(() => null);
  try {
    const { graphId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({
      execution: await nodeExecutionService.update(owner, graphId, nodeId, executionId, body),
    });
  } catch (error) {
    return nodeExecutionErrorResponse(error) ?? unexpected("update", error);
  }
}
