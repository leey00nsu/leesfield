import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import { getSession } from "@/server/auth/session";
import { createMockVideoGenerationWithLimit } from "@/server/video-generation/video-generation-store";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import {
  INPUT_IMAGE_INVALID,
  INPUT_IMAGE_STORAGE_REQUIRED,
  resolveInputImageErrorCode,
} from "@/server/shared/input-image-uploader";

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
    startGenerationWorker();
    const { record } = await createMockVideoGenerationWithLimit(
      parsed.data,
      session.adminEmail,
    );

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[video-generation] create failed", error);
    const code = resolveInputImageErrorCode(error);
    if (code === INPUT_IMAGE_STORAGE_REQUIRED || code === INPUT_IMAGE_INVALID) {
      return buildErrorResponse(code, 400);
    }
    return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
  }
}
