import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { importModelDraftFromSpace } from "@/server/model-catalog/space-importer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "INVALID_JSON" }, { status: 400 });
  }

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
