import { assetProjectService } from "@/server/media-assets/asset-project-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ projectId: string }> };
export const PATCH = withRequestObservability("/api/media-assets/projects/[projectId]", async (request: Request, context: Context) => {
  const { projectId } = await context.params;
  return handleAssetOrganizationRequest(request, async (owner, body) => ({ project: await assetProjectService.update(owner, projectId, body) }));
});
export const DELETE = withRequestObservability("/api/media-assets/projects/[projectId]", async (request: Request, context: Context) => {
  const { projectId } = await context.params;
  return handleAssetOrganizationRequest(request, (owner, body) => assetProjectService.delete(owner, projectId, body), 204);
});
