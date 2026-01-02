import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getGeneration } from "@/server/image-generation/image-generation-store";

type RouteContext = {
  params: {
    requestId: string;
  };
};

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json(
      { message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const record = getGeneration(params.requestId);

  if (!record) {
    return NextResponse.json(
      { message: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    requestId: record.id,
    status: record.status,
    progress: record.progress,
    result: record.result,
    errorMessage: record.errorMessage,
  });
}
