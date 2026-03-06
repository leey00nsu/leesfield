import { getSession } from "@/server/auth/session";
import { createMockAudioGenerationWithLimit } from "@/server/audio-generation/audio-generation-store";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { validateAudioGenerationPayload } from "@/server/model-catalog/generation-validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const body = await request.json().catch(() => null);
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
