import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { revokeApiKeyHandler } from "@/server/api-key/handlers/revoke-api-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    apiKeyId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { apiKeyId } = await context.params;
    const record = await revokeApiKeyHandler({
      id: apiKeyId,
      ownerEmail: session.adminEmail,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error && error.message === "API_KEY_NOT_FOUND") {
      return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
    }
    logSafeError("api_key.revoke_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
import { logSafeError } from "@/server/observability/request-observability";
