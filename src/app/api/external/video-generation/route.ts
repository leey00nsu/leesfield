import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import { createMockVideoGenerationWithLimit } from "@/server/video-generation/video-generation-store";
import { requireApiKey } from "@/server/auth/api-key-guard";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import {
  FILE_TOO_LARGE_ERROR,
  getNumber,
  getOptionalDataUrl,
  getString,
} from "@/server/http/form-data-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof Response) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return buildErrorResponse("INVALID_FORM_DATA", 400);
  }

  let initImage: string | undefined;
  try {
    initImage = await getOptionalDataUrl(
      formData,
      "initImage",
      MAX_UPLOAD_BYTES,
    );
  } catch (error) {
    if (error instanceof Error && error.message === FILE_TOO_LARGE_ERROR) {
      return buildErrorResponse("FILE_TOO_LARGE", 413);
    }
    console.error("[video-generation] file parse failed", error);
    return buildErrorResponse("INVALID_FORM_DATA", 400);
  }

  const body = {
    prompt: getString(formData, "prompt"),
    initImage,
    model: getString(formData, "model"),
    aspectRatio: getString(formData, "aspectRatio"),
    resolution: getNumber(formData, "resolution"),
    durationSec: getNumber(formData, "durationSec"),
    fps: getNumber(formData, "fps"),
    steps: getNumber(formData, "steps"),
    guidanceScale: getNumber(formData, "guidanceScale"),
    seed: getString(formData, "seed"),
  };

  const parsed = videoGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  try {
    startGenerationWorker();
    const { record } = await createMockVideoGenerationWithLimit(
      parsed.data,
      auth.ownerEmail,
    );

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[video-generation] create failed", error);
    return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
  }
}
