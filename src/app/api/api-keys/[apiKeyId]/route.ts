import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
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
    console.error("[api-keys] update failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
