import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }
  try {
    const { uploadId } = await context.params;
    const target = new URL(request.url).searchParams.get("target") ?? "";
    await mediaAssetService.relayUpload(
      session.adminEmail,
      uploadId,
      target,
      request.body,
      request.headers.get("content-type"),
      request.headers.get("content-length"),
    );
    return Response.json({ uploaded: true }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[media-assets] relay upload failed", error);
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse("MEDIA_STORAGE_UNAVAILABLE", 503);
  }
}
