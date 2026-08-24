import { getSession } from "@/server/auth/session";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { buildGenerationGraphKnownErrorResponse } from "@/server/generation-graph/generation-graph-http";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

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
    console.error("[generation-graphs] list failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const body = await request.json().catch(() => null);
  try {
    const graph = await generationGraphService.create(session.adminEmail, body);
    return jsonWithNoStore({ graph }, { status: 201 });
  } catch (error) {
    const knownResponse = buildGenerationGraphKnownErrorResponse(error);
    if (knownResponse) return knownResponse;
    console.error("[generation-graphs] create failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
