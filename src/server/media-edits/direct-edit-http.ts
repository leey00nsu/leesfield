import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { JSON_BODY_LIMIT_BYTES, readRouteJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { logSafeError } from "@/server/observability/request-observability";
import { startMediaOperationWorker } from "@/server/media-operations/media-operation-worker";
import { hasFfmpegVideoProcessor } from "@/server/media-operations/ffmpeg-video-processor";
import { startDirectEdit, getDirectEdit, cancelDirectEdit, DirectEditError } from "./direct-edit-service";

export async function directEditHttp(request: Request, ids: { graphId: string; nodeId: string; operationId?: string }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  if (request.method !== "GET") { const denied = assertSessionMutationOrigin(request); if (denied) return denied; }
  try {
    if (request.method === "POST") {
      const body = await readRouteJsonBody(request, JSON_BODY_LIMIT_BYTES);
      if (!body.ok) return buildErrorResponse(body.code, body.status);
      if (!await hasFfmpegVideoProcessor()) return buildErrorResponse("PROCESSOR_UNAVAILABLE", 503);
      const operation = await startDirectEdit(session.adminEmail, ids.graphId, ids.nodeId, body.body);
      startMediaOperationWorker();
      return jsonWithNoStore({ operation }, { status: 201 });
    }
    if (!ids.operationId) return buildErrorResponse("NOT_FOUND", 404);
    const operation = request.method === "DELETE"
      ? await cancelDirectEdit(session.adminEmail, ids.graphId, ids.nodeId, ids.operationId)
      : await getDirectEdit(session.adminEmail, ids.graphId, ids.nodeId, ids.operationId);
    return jsonWithNoStore({ operation });
  } catch (error) {
    if (error instanceof DirectEditError) return buildErrorResponse(error.code, error.status);
    logSafeError("media_edit.request_failed", error);
    return buildErrorResponse("EDIT_REQUEST_FAILED", 500);
  }
}
