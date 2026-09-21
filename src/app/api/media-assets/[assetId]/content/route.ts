import { getSession } from "@/server/auth/session";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { buildErrorResponse } from "@/server/http/response";
import { isAllowedMediaMimeType } from "@/shared/media-assets/media-asset-contract";
import {
  GENERATION_OUTPUT_LIMITS,
  limitReadableStream,
  OUTBOUND_FILE_TIMEOUT_MS,
} from "@/server/http/bounded-io";
import { requestRemoteStream } from "@/server/http/safe-remote";
import { logSafeError } from "@/server/observability/request-observability";

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

    const maxBytes = GENERATION_OUTPUT_LIMITS[asset.type];
    const declaredBytes = asset.bytes === null ? null : Number(asset.bytes);
    if (declaredBytes !== null && (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0 || declaredBytes > maxBytes)) {
      return buildErrorResponse("MEDIA_ASSET_CONTENT_FETCH_FAILED", 502);
    }
    const upstream = await requestRemoteStream(asset.url, {
      timeoutMs: OUTBOUND_FILE_TIMEOUT_MS,
      maxRedirects: 3,
      maxBytes,
      signal: request.signal,
      allowInsecureHttp: process.env.NODE_ENV !== "production",
    });
    if (upstream.status < 200 || upstream.status >= 300) {
      await upstream.body.cancel().catch(() => undefined);
      return buildErrorResponse("MEDIA_ASSET_CONTENT_FETCH_FAILED", 502);
    }
    const rawUpstreamLength = upstream.headers["content-length"] ?? null;
    const upstreamLength = rawUpstreamLength === null ? null : Number(rawUpstreamLength);
    if (upstreamLength !== null && Number.isSafeInteger(upstreamLength) && upstreamLength > maxBytes) {
      await upstream.body.cancel().catch(() => undefined);
      return buildErrorResponse("MEDIA_ASSET_CONTENT_FETCH_FAILED", 502);
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Type": asset.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    if (upstreamLength !== null && Number.isSafeInteger(upstreamLength) && upstreamLength >= 0) {
      headers.set("Content-Length", String(upstreamLength));
    }
    return new Response(limitReadableStream(upstream.body, {
      maxBytes,
      signal: request.signal,
    }), { status: 200, headers });
  } catch (error) {
    if (request.signal.aborted) return buildErrorResponse("REQUEST_ABORTED", 499);
    logSafeError("media_asset.content_fetch_failed", error);
    return buildMediaAssetKnownErrorResponse(error)
      ?? buildErrorResponse("MEDIA_ASSET_CONTENT_FETCH_FAILED", 502);
  }
}
