import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSearchParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ?? "";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = getSearchParam(searchParams, "type");
  const query = getSearchParam(searchParams, "q").toLowerCase();

  try {
    const catalog = await getModelCatalog();
    const items = catalog.filter((item) => {
      if (type && item.type !== type) return false;
      if (!query) return true;
      const target = `${item.label} ${item.key}`.toLowerCase();
      return target.includes(query);
    });

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[models] list failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

