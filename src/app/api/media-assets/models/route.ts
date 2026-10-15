import { getSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { findAssetModelOptions } from "@/server/media-assets/asset-library-search";
import { logSafeError, withRequestObservability } from "@/server/observability/request-observability";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = withRequestObservability("/api/media-assets/models", async () => {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  const limited = await enforceRateLimit(RATE_LIMITS.readOwner, session.adminEmail);
  if (limited) return limited;
  try { return jsonWithNoStore({ models: await findAssetModelOptions(session.adminEmail) }); }
  catch (error) {
    logSafeError("media_asset.models_failed", error);
    return buildErrorResponse("DB_READ_FAILED", 500);
  }
});
