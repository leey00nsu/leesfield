import { NextResponse } from "next/server";
import {
  JSON_BODY_LIMIT_BYTES,
  readValidatedJsonBody,
} from "@/server/http/bounded-body";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { createModelCatalogHandler } from "@/server/model-catalog/handlers/create-model-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSearchParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ?? "";
}

function parseIncludeInactive(value: string) {
  if (!value) return true;
  return value !== "false" && value !== "0";
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = getSearchParam(searchParams, "type");
  const query = getSearchParam(searchParams, "q");
  const includeInactive = parseIncludeInactive(
    getSearchParam(searchParams, "includeInactive"),
  );

  try {
    const catalog = await getModelCatalog({
      includeInactive,
      bypassCache: true,
    });
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
  } catch (error) {
    logSafeError("admin_model.list_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

 export async function POST(request: Request) {
   const session = await getSession();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const bounded = await readValidatedJsonBody(
    request,
    JSON_BODY_LIMIT_BYTES,
  );
  if (!bounded.ok) {
    return NextResponse.json(
      { message: bounded.message },
      { status: bounded.status },
    );
  }
  const payload: unknown = bounded.body;

  try {
    const result = await createModelCatalogHandler(payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json({ message: "INVALID_PAYLOAD" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "MODEL_KEY_EXISTS") {
      return NextResponse.json({ message: "CONFLICT" }, { status: 409 });
    }
    logSafeError("admin_model.create_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
import { logSafeError } from "@/server/observability/request-observability";
