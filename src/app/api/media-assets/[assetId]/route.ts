import { getSession } from "@/server/auth/session";
import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { logSafeError } from "@/server/observability/request-observability";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ assetId: string }> };

async function getObservedHandler(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  try {
    const { assetId } = await context.params;
    const asset = await mediaAssetService.get(session.adminEmail, assetId);
    return jsonWithNoStore({ asset });
  } catch (error) {
    logSafeError("media_asset.get_failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_READ_FAILED", 500);
  }
}

async function deleteObservedHandler(request: Request, context: RouteContext) {
   const session = await getSession();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  try {
    const { assetId } = await context.params;
    await mediaAssetService.remove(session.adminEmail, assetId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logSafeError("media_asset.delete_failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/media-assets/[assetId]", getObservedHandler);
export const DELETE = withRequestObservability("/api/media-assets/[assetId]", deleteObservedHandler);
export const PATCH = withRequestObservability("/api/media-assets/[assetId]", async (request: Request, context: RouteContext) => {
  const { assetId } = await context.params;
  return handleAssetOrganizationRequest(request, async (owner, body) => ({ asset: await assetOrganizationService.patch(owner, assetId, body) }));
});
