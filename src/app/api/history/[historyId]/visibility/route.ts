import { setHistoryVisibility } from "@/server/history/history-visibility";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const PATCH = withRequestObservability("/api/history/[historyId]/visibility", async (request: Request, context: { params: Promise<{ historyId: string }> }) => {
  const { historyId } = await context.params;
  return handleAssetOrganizationRequest(request, (owner, body) => setHistoryVisibility(owner, historyId, body));
});
