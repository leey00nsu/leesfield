import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getVideoGeneration } from "@/server/video-generation/video-generation-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json(
      { message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { requestId } = await params;
  let record = null;

  try {
    record = await getVideoGeneration(requestId, session.adminEmail);
  } catch (error) {
    console.error("[video-generation] status failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }

  if (!record) {
    return NextResponse.json(
      { message: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      requestId: record.id,
      status: record.status,
      progress: record.progress,
      result: record.result,
      errorMessage: record.errorMessage,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
