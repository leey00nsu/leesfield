import { withSpaceApi } from "@/server/external-api/spaces-http";
import { spaceModelSummary } from "@/server/external-api/spaces-discovery";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { externalSpaceModelsQuerySchema, spaceModelsResponseSchema } from "@/shared/api/spaces-contract";
import { buildInvalidRequestResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withSpaceApi(request, async () => {
    const parsed = externalSpaceModelsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return buildInvalidRequestResponse(parsed.error.flatten());
    const { type, q, limit, cursor } = parsed.data;
    const catalog = (await getModelCatalog()).filter(m => m.isActive && (!type || m.type === type) && `${m.label} ${m.key}`.toLowerCase().includes(q.toLowerCase())).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const items = catalog.filter(m => !cursor || m.id > cursor).slice(0, limit + 1);
    return jsonWithNoStore(spaceModelsResponseSchema.parse({ items: items.slice(0, limit).map(spaceModelSummary), nextCursor: items.length > limit ? items[limit-1].id : null }));
  });
}
