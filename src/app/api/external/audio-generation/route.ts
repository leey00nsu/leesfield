import { requireApiKey } from "@/server/auth/api-key-guard";
import { createMockAudioGenerationWithLimit } from "@/server/audio-generation/audio-generation-store";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { validateAudioGenerationPayload } from "@/server/model-catalog/generation-validation";
import {
  getNumber,
  getString,
} from "@/server/http/form-data-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof Response) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return buildErrorResponse("INVALID_FORM_DATA", 400);
  }

  const body = {
    prompt: getString(formData, "prompt"),
    model: getString(formData, "model"),
    voice: getString(formData, "voice") || undefined,
    speed: getNumber(formData, "speed"),
    seed: getString(formData, "seed") || undefined,
  };

  const parsed = await validateAudioGenerationPayload(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  try {
    startGenerationWorker();
    const { record } = await createMockAudioGenerationWithLimit(
      parsed.data,
      auth.ownerEmail,
      auth.apiKeyId,
    );

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[audio-generation] create failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
