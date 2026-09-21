import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { buildGenerationGraphKnownErrorResponse } from "@/server/generation-graph/generation-graph-http";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  GRAPH_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  try {
    const graphs = await generationGraphService.list(session.adminEmail);
    return jsonWithNoStore({ graphs });
  } catch (error) {
    logSafeError("generation_graph.list_failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}

 export async function POST(request: Request) {
   const session = await getSession();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const bounded = await readRouteJsonBody(request, GRAPH_BODY_LIMIT_BYTES);
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  try {
    const graph = await generationGraphService.create(session.adminEmail, body);
    return jsonWithNoStore({ graph }, { status: 201 });
  } catch (error) {
    const knownResponse = buildGenerationGraphKnownErrorResponse(error);
    if (knownResponse) return knownResponse;
    logSafeError("generation_graph.create_failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
import { logSafeError } from "@/server/observability/request-observability";
