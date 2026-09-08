import {
  requireApiKey,
  type ApiKeyAuthContext,
} from "@/server/auth/api-key-guard";
import { buildErrorResponse } from "@/server/http/response";

/** Keep authentication first and unexpected failures in the public JSON error contract. */
export async function withExternalApi(
  request: Request,
  handler: (auth: ApiKeyAuthContext) => Promise<Response>,
) {
  try {
    const auth = await requireApiKey(request);
    if (auth instanceof Response) return auth;
    return await handler(auth);
  } catch (error) {
    console.error("[external-api] request failed", error);
    return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
  }
}
