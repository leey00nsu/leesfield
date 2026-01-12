import { NextResponse } from "next/server";
import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import { createMockVideoGeneration } from "@/server/video-generation/video-generation-store";
import { requireApiKey } from "@/server/auth/api-key-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = videoGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "INVALID_REQUEST", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const record = await createMockVideoGeneration(
      parsed.data,
      auth.ownerEmail,
    );

    return NextResponse.json(
      {
        requestId: record.id,
        status: record.status,
        progress: record.progress,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[video-generation] create failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
