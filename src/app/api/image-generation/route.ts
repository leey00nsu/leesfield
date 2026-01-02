import { NextResponse } from "next/server";
import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { getSession } from "@/server/auth/session";
import { createMockGeneration } from "@/server/image-generation/image-generation-store";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json(
      { message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = imageGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "INVALID_REQUEST", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const record = createMockGeneration(parsed.data);

  return NextResponse.json({
    requestId: record.id,
    status: record.status,
    progress: record.progress,
  });
}
