import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { issueApiKeyHandler } from "@/server/api-key/handlers/issue-api-key";
import { listApiKeysHandler } from "@/server/api-key/handlers/list-api-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const payload = await listApiKeysHandler(session.adminEmail);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api-keys] list failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const result = await issueApiKeyHandler({
      ownerEmail: session.adminEmail,
      payload,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json({ message: "INVALID_PAYLOAD" }, { status: 400 });
    }
    console.error("[api-keys] issue failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
