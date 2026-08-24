import { getSession } from "@/server/auth/session";
import {
  NodeGenerationConfigError,
  NodeGenerationInputError,
  NodeGenerationNotFoundError,
  NodeGenerationVersionConflictError,
} from "@/server/generation-graph/node-generation-errors";
import { nodeGenerationService } from "@/server/generation-graph/node-generation-service";
import { ImageGenerationActiveNodeError } from "@/server/image-generation/image-generation-submission";
import {
  buildErrorResponse,
  buildInvalidRequestResponse,
  jsonWithNoStore,
} from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ graphId: string; nodeId: string }>;
};

async function authenticatedOwnerEmail() {
  const session = await getSession();
  return session.isLoggedIn ? session.adminEmail ?? null : null;
}

function knownErrorResponse(error: unknown) {
  if (error instanceof NodeGenerationInputError) {
    return buildInvalidRequestResponse(error.details);
  }
  if (error instanceof NodeGenerationConfigError) {
    return jsonWithNoStore(
      { message: "NODE_CONFIG_INVALID", errors: error.details },
      { status: 400 },
    );
  }
  if (error instanceof NodeGenerationNotFoundError) {
    return buildErrorResponse("GRAPH_NODE_NOT_FOUND", 404);
  }
  if (error instanceof NodeGenerationVersionConflictError) {
    return buildErrorResponse("GRAPH_VERSION_CONFLICT", 409);
  }
  if (error instanceof ImageGenerationActiveNodeError) {
    return buildErrorResponse("NODE_GENERATION_ACTIVE", 409);
  }
  return null;
}

function unexpectedError(operation: string, error: unknown) {
  console.error(`[node-generations] ${operation} failed`, error);
  return buildErrorResponse("DB_SAVE_FAILED", 500);
}

export async function GET(_request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  try {
    const { graphId, nodeId } = await context.params;
    const generations = await nodeGenerationService.list(
      ownerEmail,
      graphId,
      nodeId,
    );
    return jsonWithNoStore({ generations });
  } catch (error) {
    return knownErrorResponse(error) ?? unexpectedError("list", error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  const body = await request.json().catch(() => null);
  try {
    const { graphId, nodeId } = await context.params;
    const { record } = await nodeGenerationService.execute(
      ownerEmail,
      graphId,
      nodeId,
      body,
    );
    return jsonWithNoStore(
      {
        generation: {
          requestId: record.id,
          status: record.status,
          progress: record.progress,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return knownErrorResponse(error) ?? unexpectedError("execute", error);
  }
}
