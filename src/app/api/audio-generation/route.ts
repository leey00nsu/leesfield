import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { createMockAudioGenerationWithLimit } from "@/server/audio-generation/audio-generation-store";
import { getAudioGeneration } from "@/server/audio-generation/audio-generation-store";
import { admitSubmission } from "@/server/generation-admission/admitted-submission";
import { finalizeSubmission } from "@/server/generation-admission/submission-ledger";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import { buildQueueFullResponse, jsonWithNoStore } from "@/server/http/response";
import {
  getBoolean,
  getNumber,
  getOptionalDataUrl,
  getString,
} from "@/server/http/form-data-utils";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import {
  BodyLimitError,
  GENERATION_BODY_LIMIT_BYTES,
  readRouteFormDataBody,
  readRouteJsonBody,
  withHeavyBodyPermit,
} from "@/server/http/bounded-body";
import { validateAudioGenerationPayload } from "@/server/model-catalog/generation-validation";
import {
  INPUT_MEDIA_FETCH_FAILED,
  INPUT_MEDIA_INVALID,
  INPUT_MEDIA_STORAGE_REQUIRED,
  INPUT_MEDIA_TOO_LARGE,
  resolveInputMediaErrorCode,
} from "@/server/shared/input-media-uploader";
import {
  logStructured,
  withRequestObservability,
} from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getDynamicParams(formData: FormData) {
  const value = getString(formData, "dynamicParams");
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

async function postHandler(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const ownerEmail = session.adminEmail;
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;

  const rateLimited = await enforceRateLimit(
    RATE_LIMITS.generationOwner,
    ownerEmail,
  );
  if (rateLimited) return rateLimited;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  let body: unknown = null;
  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await readRouteFormDataBody(
        request,
        {
          maxBytes: GENERATION_BODY_LIMIT_BYTES,
          maxFiles: 4,
          maxFileBytes: 32 * 1024 * 1024,
          maxTotalFileBytes: 64 * 1024 * 1024,
        },
        false,
      );
      body = formData
        ? {
          prompt: getString(formData, "prompt"),
          model: getString(formData, "model"),
          voice: getString(formData, "voice") || undefined,
          speed: getNumber(formData, "speed"),
          seed: getString(formData, "seed") || undefined,
          inputAudio: await getOptionalDataUrl(formData, "inputAudio"),
          referenceText: getString(formData, "referenceText") || undefined,
          modeChoice: getString(formData, "modeChoice") || undefined,
          language: getString(formData, "language") || undefined,
          speaker: getString(formData, "speaker") || undefined,
          streamMode: getBoolean(formData, "streamMode"),
          referencePreset: getString(formData, "referencePreset") || undefined,
          customInstruction:
            getString(formData, "customInstruction") || undefined,
          voiceInstruction:
            getString(formData, "voiceInstruction") || undefined,
          xvecOnly: getBoolean(formData, "xvecOnly"),
          chunkSize: getNumber(formData, "chunkSize"),
          temperature: getNumber(formData, "temperature"),
          topK: getNumber(formData, "topK"),
          repetitionPenalty: getNumber(formData, "repetitionPenalty"),
          dynamicParams: getDynamicParams(formData),
          }
        : null;
    } else {
      const bounded = await readRouteJsonBody(
        request,
        GENERATION_BODY_LIMIT_BYTES,
        false,
      );
      if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
      body = bounded.body;
    }
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return buildErrorResponse(error.code, error.status);
    }
    body = null;
  }
  const parsed = await validateAudioGenerationPayload(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  const admitted = await admitSubmission({
    request,
    ownerEmail,
    payload: { type: "audio", payload: parsed.data },
    providerKey: parsed.data.model ?? null,
    modelKey: parsed.data.model ?? null,
    modelType: "audio",
  });
  if (admitted.kind === "model-unavailable") {
    return buildErrorResponse("MODEL_NOT_FOUND", 404);
  }
  if (admitted.kind === "conflict") {
    return buildErrorResponse("IDEMPOTENCY_CONFLICT", 409);
  }
  if (admitted.kind === "rejected") {
    return buildQueueFullResponse(admitted.reason);
  }
  if (admitted.kind === "reuse") {
    const existing = await getAudioGeneration(admitted.requestId, ownerEmail);
    return existing
      ? buildGenerationSuccessResponse(existing)
      : jsonWithNoStore({
          requestId: admitted.requestId,
          status: "pending",
          progress: 0,
        });
  }

  try {
    startGenerationWorker();
    const { record } = await createMockAudioGenerationWithLimit(
      parsed.data,
      ownerEmail,
      null,
      admitted.requestId,
    );
    await finalizeSubmission(admitted.requestId, "submitted");

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    await finalizeSubmission(admitted.requestId, "failed");
    logStructured("generation.create.failure", {
      requestId: admitted.requestId,
      kind: "audio",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    const mediaCode = resolveInputMediaErrorCode(error);
    if ([INPUT_MEDIA_FETCH_FAILED, INPUT_MEDIA_INVALID, INPUT_MEDIA_STORAGE_REQUIRED].includes(mediaCode ?? "")) {
      return buildErrorResponse(mediaCode as string, 400);
    }
    if (mediaCode === INPUT_MEDIA_TOO_LARGE) {
      return buildErrorResponse(mediaCode, 413);
    }
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}

async function guardedPostHandler(request: Request) {
  try {
    return await withHeavyBodyPermit(() => postHandler(request));
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return buildErrorResponse(error.code, error.status);
    }
    throw error;
  }
}

export const POST = withRequestObservability(
  "/api/audio-generation",
  guardedPostHandler,
);
