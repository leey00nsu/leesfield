import { getSession } from "@/server/auth/session";
import { buildGenerationGraphKnownErrorResponse } from "@/server/generation-graph/generation-graph-http";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export async function POST(_request: Request, context: { params: Promise<{ graphId: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const { graphId } = await context.params;
    const graph = await generationGraphService.copy(session.adminEmail, graphId);
    return jsonWithNoStore({ graph }, { status: 201 });
  } catch (error) {
    return buildGenerationGraphKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
