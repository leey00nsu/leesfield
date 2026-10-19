import {
  requireApiKey,
  type ApiKeyAuthContext,
} from "@/server/auth/api-key-guard";
import { buildErrorResponse } from "@/server/http/response";
import { externalOperationAdditionalPermissions, getExternalOperationPermission, matchExternalOperation, hasPlatformPermission, type PlatformPermission } from "@/shared/api/platform-permissions";
import {
  logSafeError,
  withRequestObservability,
} from "@/server/observability/request-observability";

/** Keep authentication first and unexpected failures in the public JSON error contract. */
export async function withExternalApi(
  request: Request,
  handler: (auth: ApiKeyAuthContext) => Promise<Response>,
  requiredPermission?: PlatformPermission,
) {
  const observed = withRequestObservability("/api/external", async (observedRequest: Request) => {
    try {
      const auth = await requireApiKey(observedRequest);
      if (auth instanceof Response) return auth;
      const permission = getExternalOperationPermission(observedRequest.method, new URL(observedRequest.url).pathname) ?? requiredPermission;
      if (permission && !hasPlatformPermission(auth.permissions, permission)) {
        return buildErrorResponse("PLATFORM_PERMISSION_REQUIRED", 403);
      }
      const operation = matchExternalOperation(observedRequest.method, new URL(observedRequest.url).pathname);
      if (operation && externalOperationAdditionalPermissions[operation]?.some(p => !hasPlatformPermission(auth.permissions, p))) {
        return buildErrorResponse("PLATFORM_PERMISSION_REQUIRED", 403);
      }
      return await handler(auth);
    } catch (error) {
      logSafeError("external_api.failure", error, {

      });
      return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
    }
  });
  return observed(request);
}
