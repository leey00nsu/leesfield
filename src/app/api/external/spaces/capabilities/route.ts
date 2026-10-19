import { withSpaceApi } from "@/server/external-api/spaces-http";
import { getSpaceCapabilities } from "@/server/external-api/spaces-discovery";
import { jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withSpaceApi(request, async () => jsonWithNoStore(await getSpaceCapabilities()));
}
