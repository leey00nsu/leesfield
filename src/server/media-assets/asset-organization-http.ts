import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { readValidatedJsonBody, JSON_BODY_LIMIT_BYTES } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { logSafeError } from "@/server/observability/request-observability";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { buildMediaAssetKnownErrorResponse } from "./media-asset-http";

export async function handleAssetOrganizationRequest(
  request: Request, action: (owner: string, body: unknown) => Promise<unknown>, status = 200,
) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  const mutation = request.method !== "GET";
  if (mutation) { const originError = assertSessionMutationOrigin(request); if (originError) return originError; }
  const rateLimited = await enforceRateLimit(mutation ? RATE_LIMITS.assetWriteOwner : RATE_LIMITS.readOwner, session.adminEmail);
  if (rateLimited) return rateLimited;
  let body: unknown = undefined;
  if (mutation) {
    const bounded = await readValidatedJsonBody(request, JSON_BODY_LIMIT_BYTES, "INVALID_REQUEST");
    if (!bounded.ok) return buildErrorResponse(bounded.message, bounded.status);
    body = bounded.body;
  }
  try {
    const result = await action(session.adminEmail, body);
    return status === 204 ? new Response(null, { status, headers: { "Cache-Control": "no-store" } }) : jsonWithNoStore(result, { status });
  } catch (error) {
    logSafeError("asset_organization.request_failed", error, { phase: mutation ? "metadata.write" : "metadata.read" });
    return buildMediaAssetKnownErrorResponse(error) ?? buildErrorResponse(mutation ? "DB_SAVE_FAILED" : "DB_READ_FAILED", 500);
  }
}
