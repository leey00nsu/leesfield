import { withSpaceApi } from "@/server/external-api/spaces-http";
import { getSpaceModelInput } from "@/server/external-api/spaces-discovery";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ modelId: string }> }) {
  return withSpaceApi(request, async () => {
    const { modelId } = await context.params;
    const model = (await getModelCatalog()).find(m => m.id === modelId && m.isActive);
    return model ? jsonWithNoStore(getSpaceModelInput(model)) : buildErrorResponse("MODEL_NOT_FOUND", 404);
  });
}
