import { assetProjectService } from "@/server/media-assets/asset-project-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const GET = withRequestObservability("/api/media-assets/projects", (request: Request) => handleAssetOrganizationRequest(request, async (owner) => ({ projects: await assetProjectService.list(owner) })));
export const POST = withRequestObservability("/api/media-assets/projects", (request: Request) => handleAssetOrganizationRequest(request, async (owner, body) => ({ project: await assetProjectService.create(owner, body) }), 201));
