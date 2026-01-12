import { NextResponse } from "next/server";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import { getSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const document = getOpenApiDocument();

  return NextResponse.json(document, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
