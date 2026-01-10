import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { revokeApiKeyHandler } from "@/server/api-key/handlers/revoke-api-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: {
    apiKeyId: string;
  };
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const record = await revokeApiKeyHandler({
      id: context.params.apiKeyId,
      ownerEmail: session.adminEmail,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error && error.message === "API_KEY_NOT_FOUND") {
      return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[api-keys] revoke failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
