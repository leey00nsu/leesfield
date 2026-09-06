import { getSession } from "@/server/auth/session";
import { MediaStorageUnavailableError } from "@/server/media-assets/media-asset-errors";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  const body = await request.json().catch(() => null);
  try {
    const upload = await mediaAssetService.createUpload(session.adminEmail, body);
    return jsonWithNoStore({ upload }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      // Next's Error formatter collapses nested properties to [Object]. Keep
      // the sanitized diagnostic readable, without logging SDK payloads.
      console.error(`[media-assets] create upload failed ${JSON.stringify({
        code: error.message,
        stage: error.diagnostic?.stage ?? "unknown",
        reason: error.diagnostic?.reason ?? "unknown",
        upstreamStatus: error.diagnostic?.upstreamStatus ?? null,
      })}`);
    } else {
      console.error("[media-assets] create upload failed", error);
    }
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
