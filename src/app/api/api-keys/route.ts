import { NextResponse } from "next/server";
import {
  JSON_BODY_LIMIT_BYTES,
  readValidatedJsonBody,
} from "@/server/http/bounded-body";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
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
    logSafeError("api_key.list_failed", error);
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
      { error: bounded.message },
      { status: bounded.status },
    );
  }
  const payload: unknown = bounded.body;

  try {
    const result = await issueApiKeyHandler({
      ownerEmail: session.adminEmail,
      payload,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json({ message: "INVALID_PAYLOAD" }, { status: 400 });
    }
    logSafeError("api_key.issue_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
import { logSafeError } from "@/server/observability/request-observability";
