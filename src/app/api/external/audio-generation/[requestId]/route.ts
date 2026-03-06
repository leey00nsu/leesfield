import { NextResponse } from "next/server";
import { requireApiKey } from "@/server/auth/api-key-guard";
import { getAudioGeneration } from "@/server/audio-generation/audio-generation-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { requestId } = await params;
  const record = await getAudioGeneration(requestId, auth.ownerEmail);

  if (!record) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
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
