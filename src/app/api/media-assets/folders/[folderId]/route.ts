import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ folderId: string }> };
export const PATCH = withRequestObservability("/api/media-assets/folders/[folderId]", async (request: Request, context: Context) => {
  const { folderId } = await context.params;
  return handleAssetOrganizationRequest(request, async (owner, body) => ({ folder: await assetOrganizationService.updateFolder(owner, folderId, body) }));
});
export const DELETE = withRequestObservability("/api/media-assets/folders/[folderId]", async (request: Request, context: Context) => {
  const { folderId } = await context.params;
  return handleAssetOrganizationRequest(request, (owner, body) => assetOrganizationService.deleteFolder(owner, folderId, body), 204);
});
