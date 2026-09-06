import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { startMediaOperationWorker } from "@/server/media-operations/media-operation-worker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  const body = await request.json().catch(() => null);
  try {
    const operation = await mediaAssetService.createOperation(session.adminEmail, body);
    if (operation.type === "edit.image.removeBackground") startMediaOperationWorker();
    return jsonWithNoStore({ operation }, { status: 201 });
  } catch (error) {
    console.error("[media-operations] create failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
