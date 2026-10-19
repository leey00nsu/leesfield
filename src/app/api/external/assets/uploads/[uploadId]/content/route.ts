import { withSpaceApi } from "@/server/external-api/spaces-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ uploadId: string }> }) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    await mediaAssetService.relayUpload(ownerEmail, (await context.params).uploadId,
      new URL(request.url).searchParams.get("target") ?? "", request.body,
      request.headers.get("content-type"), request.headers.get("content-length"), request.signal);
    return jsonWithNoStore({ uploaded: true });
  }, "write");
}
