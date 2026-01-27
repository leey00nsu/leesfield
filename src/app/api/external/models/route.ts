import { NextResponse } from "next/server";
import { requireApiKey } from "@/server/auth/api-key-guard";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSearchParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ?? "";
}

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { searchParams } = new URL(request.url);
  const type = getSearchParam(searchParams, "type");
  const query = getSearchParam(searchParams, "q");

  const catalog = await getModelCatalog();
  const normalizedQuery = query.toLowerCase();
  const items = catalog.filter((item) => {
    if (type && item.type !== type) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const target = `${item.label} ${item.key}`.toLowerCase();
    return target.includes(normalizedQuery);
  });

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
