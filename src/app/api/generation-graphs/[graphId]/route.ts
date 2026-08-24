import { getSession } from "@/server/auth/session";
import { buildGenerationGraphKnownErrorResponse } from "@/server/generation-graph/generation-graph-http";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ graphId: string }> };

async function authenticatedOwnerEmail() {
  const session = await getSession();
  return session.isLoggedIn ? session.adminEmail ?? null : null;
}

function unexpectedError(operation: string, error: unknown) {
  console.error(`[generation-graphs] ${operation} failed`, error);
  return buildErrorResponse("DB_SAVE_FAILED", 500);
}

export async function GET(_request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  try {
    const { graphId } = await context.params;
    const graph = await generationGraphService.get(ownerEmail, graphId);
    return jsonWithNoStore({ graph });
  } catch (error) {
    return buildGenerationGraphKnownErrorResponse(error) ?? unexpectedError("get", error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  const body = await request.json().catch(() => null);
  try {
    const { graphId } = await context.params;
    const graph = await generationGraphService.update(ownerEmail, graphId, body);
    return jsonWithNoStore({ graph });
  } catch (error) {
    return buildGenerationGraphKnownErrorResponse(error) ?? unexpectedError("update", error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  try {
    const { graphId } = await context.params;
    await generationGraphService.remove(ownerEmail, graphId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return buildGenerationGraphKnownErrorResponse(error) ?? unexpectedError("delete", error);
  }
}
