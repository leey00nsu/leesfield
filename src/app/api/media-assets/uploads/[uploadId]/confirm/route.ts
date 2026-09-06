import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  const body = await request.json().catch(() => null);
  try {
    const { uploadId } = await context.params;
    const asset = await mediaAssetService.confirmUpload(session.adminEmail, uploadId, body);
    return jsonWithNoStore({ asset });
  } catch (error) {
    console.error("[media-assets] confirm upload failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
