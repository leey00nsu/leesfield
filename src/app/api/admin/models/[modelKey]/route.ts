import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { updateModelCatalogHandler } from "@/server/model-catalog/handlers/update-model-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    modelKey: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const { modelKey } = await context.params;
    const result = await updateModelCatalogHandler({
      key: modelKey,
      payload,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json({ message: "INVALID_PAYLOAD" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "MODEL_NOT_FOUND") {
      return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
    }
    if (
      error instanceof Error &&
      (error.message === "TYPE_IMMUTABLE" || error.message === "KEY_IMMUTABLE")
    ) {
      return NextResponse.json({ message: "IMMUTABLE_FIELD" }, { status: 400 });
    }
    console.error("[admin-models] update failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
