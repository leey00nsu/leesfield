import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const POST = withRequestObservability("/api/media-assets/folders", (request: Request) => handleAssetOrganizationRequest(request, async (owner, body) => ({ folder: await assetOrganizationService.createFolder(owner, body) }), 201));
