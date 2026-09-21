import { NextResponse } from "next/server";
import {
  JSON_BODY_LIMIT_BYTES,
  readValidatedJsonBody,
} from "@/server/http/bounded-body";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { updateApiKeyLabelHandler } from "@/server/api-key/handlers/update-api-key-label";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    apiKeyId: string;
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
      { error: bounded.message },
      { status: bounded.status },
    );
  }
  const payload: unknown = bounded.body;

  try {
    const { apiKeyId } = await context.params;
    const result = await updateApiKeyLabelHandler({
      id: apiKeyId,
      ownerEmail: session.adminEmail,
      payload,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json({ message: "INVALID_PAYLOAD" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "API_KEY_NOT_FOUND") {
      return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
    }
    logSafeError("api_key.update_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
import { logSafeError } from "@/server/observability/request-observability";
