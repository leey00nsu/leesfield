import { NextResponse } from "next/server";
import {
  GRAPH_BODY_LIMIT_BYTES,
  readValidatedJsonBody,
} from "@/server/http/bounded-body";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { importModelDraftFromSpace } from "@/server/model-catalog/space-importer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

 export async function POST(request: Request) {
   const session = await getSession();
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const bounded = await readValidatedJsonBody(
    request,
    GRAPH_BODY_LIMIT_BYTES,
    "INVALID_JSON",
  );
  if (!bounded.ok) {
    return NextResponse.json(
      { message: bounded.message },
      { status: bounded.status },
    );
  }
  const payload: unknown = bounded.body;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { spaceUrl, apiName } = payload as {
    spaceUrl?: string;
    apiName?: string;
  };

  if (!spaceUrl || typeof spaceUrl !== "string") {
    return NextResponse.json({ message: "INVALID_SPACE_URL" }, { status: 400 });
  }

  try {
    const result = await importModelDraftFromSpace({
      spaceUrl,
      apiName: typeof apiName === "string" ? apiName : undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMPORT_FAILED";
    return NextResponse.json({ message }, { status: 400 });
  }
}
