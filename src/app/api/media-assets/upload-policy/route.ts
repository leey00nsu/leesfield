import { getSession } from "@/server/auth/session";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { mediaUploadLimits } from "@/shared/media-assets/media-upload-limits.mjs";
import { withRequestObservability } from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const GET = withRequestObservability("/api/media-assets/upload-policy", async () => {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  return jsonWithNoStore({ limits: mediaUploadLimits() });
});
