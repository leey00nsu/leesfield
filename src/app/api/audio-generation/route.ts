import { getSession } from "@/server/auth/session";
import { createMockAudioGenerationWithLimit } from "@/server/audio-generation/audio-generation-store";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import {
  getNumber,
  getOptionalDataUrl,
  getString,
} from "@/server/http/form-data-utils";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { validateAudioGenerationPayload } from "@/server/model-catalog/generation-validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const body = contentType.includes("multipart/form-data")
    ? await request
        .formData()
        .then(async (formData) => ({
          prompt: getString(formData, "prompt"),
          model: getString(formData, "model"),
          voice: getString(formData, "voice") || undefined,
          speed: getNumber(formData, "speed"),
          seed: getString(formData, "seed") || undefined,
          inputAudio: await getOptionalDataUrl(formData, "inputAudio"),
          referenceText: getString(formData, "referenceText") || undefined,
        }))
        .catch(() => null)
    : await request.json().catch(() => null);
  const parsed = await validateAudioGenerationPayload(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  try {
    startGenerationWorker();
    const { record } = await createMockAudioGenerationWithLimit(
      parsed.data,
      session.adminEmail,
    );

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[audio-generation] create failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
