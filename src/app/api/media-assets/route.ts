import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
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
    console.error("[media-assets] list failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_READ_FAILED", 500);
  }
}
