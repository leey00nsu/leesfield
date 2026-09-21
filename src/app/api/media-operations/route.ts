import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { logSafeError } from "@/server/observability/request-observability";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  JSON_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";
import { startMediaOperationWorker } from "@/server/media-operations/media-operation-worker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

 export async function POST(request: Request) {
   const session = await getSession();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  const bounded = await readRouteJsonBody(request, JSON_BODY_LIMIT_BYTES);
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  try {
    const operation = await mediaAssetService.createOperation(session.adminEmail, body);
    if (operation.type === "edit.image.removeBackground") startMediaOperationWorker();
    return jsonWithNoStore({ operation }, { status: 201 });
  } catch (error) {
    logSafeError("media_operation.create_failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
