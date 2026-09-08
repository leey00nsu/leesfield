import { modelQuerySchema } from "@/shared/api/external-contract";
import { externalModelsResponseSchema } from "@/shared/api/external-contract";
import { buildInvalidRequestResponse } from "@/server/http/response";
import { NextResponse } from "next/server";
import { withExternalApi } from "@/server/external-api/route-handler";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSearchParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ?? "";
}

export async function GET(request: Request) {
  return withExternalApi(request, async () => {
    const { searchParams } = new URL(request.url);
    const queryResult = modelQuerySchema.safeParse({
      type: getSearchParam(searchParams, "type") || undefined,
      q: getSearchParam(searchParams, "q"),
    });
    if (!queryResult.success)
      return buildInvalidRequestResponse(queryResult.error.flatten());
    const { type, q: query = "" } = queryResult.data;

    const catalog = await getModelCatalog();
    const normalizedQuery = query.toLowerCase();
    const items = catalog.filter((item) => {
      if (!item.isActive || (type && item.type !== type)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const target = `${item.label} ${item.key}`.toLowerCase();
      return target.includes(normalizedQuery);
    });

    return NextResponse.json(
      externalModelsResponseSchema.parse({
        items: items.map((item) => ({
          id: item.id,
          label: item.label,
          type: item.type,
        })),
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
