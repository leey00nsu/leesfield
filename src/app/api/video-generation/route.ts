import { getSession } from "@/server/auth/session";
import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import { getVideoModelConcurrentLimit } from "@/features/video-generation/model/video-models";
import { createMockVideoGenerationWithLimit } from "@/server/video-generation/video-generation-store";
import {
  buildConcurrentLimitResponse,
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = videoGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  try {
    const limit = getVideoModelConcurrentLimit(parsed.data.model);
    const { record, latest } = await createMockVideoGenerationWithLimit(
      parsed.data,
      session.adminEmail,
      limit,
    );
    if (!record) {
      return buildConcurrentLimitResponse(latest?.id);
    }

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[video-generation] create failed", error);
    return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
  }
}
