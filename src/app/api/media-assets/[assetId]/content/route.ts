import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse } from "@/server/http/response";
import { isAllowedMediaMimeType } from "@/shared/media-assets/media-asset-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  try {
    const { assetId } = await context.params;
    const asset = await mediaAssetService.get(session.adminEmail, assetId);
    if (!isAllowedMediaMimeType(asset.type, asset.mimeType)) {
      return buildErrorResponse("MEDIA_MIME_MISMATCH", 422);
    }

    const upstream = await fetch(asset.url, {
      cache: "no-store",
      redirect: "follow",
      signal: request.signal,
    });
    if (!upstream.ok || !upstream.body) {
      return buildErrorResponse("MEDIA_ASSET_CONTENT_FETCH_FAILED", 502);
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Type": asset.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    if (request.signal.aborted) return buildErrorResponse("REQUEST_ABORTED", 499);
    console.error("[media-assets] content fetch failed", error);
    return buildMediaAssetKnownErrorResponse(error)
      ?? buildErrorResponse("MEDIA_ASSET_CONTENT_FETCH_FAILED", 502);
  }
}
