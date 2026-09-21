import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { MediaStorageUnavailableError } from "@/server/media-assets/media-asset-errors";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  JSON_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";
import { logSafeError } from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

 export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const ownerEmail = session.adminEmail;
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;

  const rateLimited = await enforceRateLimit(
    RATE_LIMITS.uploadOwner,
    ownerEmail,
  );
  if (rateLimited) return rateLimited;
  const bounded = await readRouteJsonBody(request, JSON_BODY_LIMIT_BYTES);
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  try {
    const upload = await mediaAssetService.createUpload(session.adminEmail, body);
    return jsonWithNoStore({ upload }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      // Next's Error formatter collapses nested properties to [Object]. Keep
      // the sanitized diagnostic readable, without logging SDK payloads.
      logSafeError("media_asset.create_upload_failed", error, {
        phase: error.diagnostic?.stage ?? "unknown",
        status: error.diagnostic?.upstreamStatus ?? undefined,
      });
    } else {
      logSafeError("media_asset.create_upload_failed", error);
    }
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
