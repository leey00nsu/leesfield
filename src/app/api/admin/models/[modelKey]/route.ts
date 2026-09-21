import { NextResponse } from "next/server";
import {
  JSON_BODY_LIMIT_BYTES,
  readValidatedJsonBody,
} from "@/server/http/bounded-body";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { deleteModelCatalogHandler } from "@/server/model-catalog/handlers/delete-model-catalog";
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
    logSafeError("admin_model.update_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { modelKey } = await context.params;
    const result = await deleteModelCatalogHandler(modelKey);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "MODEL_NOT_FOUND") {
      return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
    }
    logSafeError("admin_model.delete_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
import { logSafeError } from "@/server/observability/request-observability";
