import { mediaUploadLimits } from "@/shared/media-assets/media-upload-limits.mjs";
import { getSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { buildErrorResponse } from "@/server/http/response";
import { requestRemoteStream } from "@/server/http/safe-remote";
import { GENERATION_OUTPUT_LIMITS } from "@/server/http/bounded-io";
import { getMediaAssetDownloadName } from "@/shared/media-assets/media-asset-name";
import { withRequestObservability, logSafeError } from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const GET = withRequestObservability("/api/media-assets/[assetId]/download", async (request: Request, context: { params: Promise<{ assetId: string }> }) => {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  const limited = await enforceRateLimit(RATE_LIMITS.readOwner, session.adminEmail);
  if (limited) return limited;
  try {
    const { assetId } = await context.params;
    const asset = await mediaAssetService.get(session.adminEmail, assetId);
    if (asset.status !== "completed" || !asset.url) return buildErrorResponse("MEDIA_ASSET_NOT_FOUND", 404);
    const upstream = await requestRemoteStream(asset.url, { timeoutMs: 60_000, maxBytes: Math.max(GENERATION_OUTPUT_LIMITS[asset.type], mediaUploadLimits()[asset.type]), signal: request.signal });
    if (upstream.status < 200 || upstream.status >= 300) { await upstream.body.cancel().catch(() => undefined); return buildErrorResponse("MEDIA_ASSET_FETCH_FAILED", 502); }
    const name = encodeURIComponent(getMediaAssetDownloadName(asset)).replace(/['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());
    return new Response(upstream.body, { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename="${asset.id}"; filename*=UTF-8''${name}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    logSafeError("media_asset.download_failed", error, { phase: "asset.download" });
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("MEDIA_ASSET_FETCH_FAILED", 502);
  }
});
