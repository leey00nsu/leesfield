import { getSession } from "@/server/auth/session";
import { nodeOutputService } from "@/server/generation-graph/node-output-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { nodeExecutionErrorResponse } from "@/server/node-executions/node-execution-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ graphId: string; nodeId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  try {
    const { graphId, nodeId } = await context.params;
    const output = await nodeOutputService.resolve(session.adminEmail, graphId, nodeId);
    return jsonWithNoStore({ output });
  } catch (error) {
    console.error("[generation-graph] output resolution failed", error);
    return nodeExecutionErrorResponse(error) ?? buildErrorResponse("DB_READ_FAILED", 500);
  }
}
