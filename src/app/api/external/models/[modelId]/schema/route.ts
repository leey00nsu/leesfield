import { withExternalApi } from "@/server/external-api/route-handler";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getExternalModelInput } from "@/server/external-api/model-input";
import { externalModelInputResponseSchema } from "@/shared/api/external-contract";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ modelId: string }> },
) {
  return withExternalApi(request, async () => {
    const { modelId } = await params;
    const model = (await getModelCatalog()).find(
      (model) => model.id === modelId && model.isActive,
    );
    if (!model) return buildErrorResponse("MODEL_NOT_FOUND", 404);
    const contract = getExternalModelInput(model);
    return jsonWithNoStore(
      externalModelInputResponseSchema.parse({
        model: { id: model.id, label: model.label, type: model.type },
        inputSchema: contract.inputSchema,
        files: contract.files,
      }),
    );
  });
}
