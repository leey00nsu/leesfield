import { getSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { logSafeError } from "@/server/observability/request-observability";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  const rateLimited = await enforceRateLimit(RATE_LIMITS.readOwner, session.adminEmail);
  if (rateLimited) return rateLimited;
  const searchParams = new URL(request.url).searchParams;
  try {
    const assets = await mediaAssetService.list(session.adminEmail, {
      ...(searchParams.get("category") ? { category: searchParams.get("category") } : {}),
      ...(searchParams.get("type") ? { type: searchParams.get("type") } : {}),
      ...(searchParams.get("cursor") ? { cursor: searchParams.get("cursor") } : {}),
      ...(searchParams.get("limit") ? { limit: searchParams.get("limit") } : {}),
    });
    return jsonWithNoStore(assets);
  } catch (error) {
    logSafeError("media_asset.list_failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_READ_FAILED", 500);
  }
}
