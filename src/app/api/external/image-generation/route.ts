import { NextResponse } from "next/server";
import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { createMockGeneration } from "@/server/image-generation/image-generation-store";
import { requireApiKey } from "@/server/auth/api-key-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = imageGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "INVALID_REQUEST", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const record = await createMockGeneration(parsed.data, auth.ownerEmail);

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
    return NextResponse.json(
      { message: "DB_SAVE_FAILED" },
      { status: 500 },
    );
  }
}
