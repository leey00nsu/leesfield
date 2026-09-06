import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  try {
    const { assetId } = await context.params;
    const asset = await mediaAssetService.get(session.adminEmail, assetId);
    return jsonWithNoStore({ asset });
  } catch (error) {
    console.error("[media-assets] get failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_READ_FAILED", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  try {
    const { assetId } = await context.params;
    await mediaAssetService.remove(session.adminEmail, assetId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[media-assets] delete failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
