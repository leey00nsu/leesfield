import {
  requireApiKey,
  type ApiKeyAuthContext,
} from "@/server/auth/api-key-guard";
import { buildErrorResponse } from "@/server/http/response";
import {
  logStructured,
  withRequestObservability,
} from "@/server/observability/request-observability";

/** Keep authentication first and unexpected failures in the public JSON error contract. */
export async function withExternalApi(
  request: Request,
  handler: (auth: ApiKeyAuthContext) => Promise<Response>,
) {
  const observed = withRequestObservability("/api/external", async (observedRequest: Request) => {
    try {
      const auth = await requireApiKey(observedRequest);
      if (auth instanceof Response) return auth;
      return await handler(auth);
    } catch (error) {
      logStructured("external_api.failure", {
        errorType: error instanceof Error ? error.name : typeof error,
      }, "error");
      return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
    }
  });
  return observed(request);
}
