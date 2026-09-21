import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { createMockVideoGenerationWithLimit } from "@/server/video-generation/video-generation-store";
import { getVideoGeneration } from "@/server/video-generation/video-generation-store";
import { admitSubmission } from "@/server/generation-admission/admitted-submission";
import { finalizeSubmission } from "@/server/generation-admission/submission-ledger";
import {
  BodyLimitError,
  GENERATION_BODY_LIMIT_BYTES,
  readRouteJsonBody,
  withHeavyBodyPermit,
} from "@/server/http/bounded-body";
import {
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import { buildQueueFullResponse, jsonWithNoStore } from "@/server/http/response";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { validateVideoGenerationPayload } from "@/server/model-catalog/generation-validation";
import {
  INPUT_IMAGE_INVALID,
  INPUT_IMAGE_STORAGE_REQUIRED,
  resolveInputImageErrorCode,
} from "@/server/shared/input-image-uploader";
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

  const bounded = await readRouteJsonBody(
    request,
    GENERATION_BODY_LIMIT_BYTES,
    false,
  );
  if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
  const body = bounded.body;
  const parsed = await validateVideoGenerationPayload(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  const admitted = await admitSubmission({
    request,
    ownerEmail,
    payload: { type: "video", payload: parsed.data },
    providerKey: parsed.data.model ?? null,
    modelKey: parsed.data.model ?? null,
    modelType: "video",
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
    const existing = await getVideoGeneration(admitted.requestId, ownerEmail);
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
    const { record } = await createMockVideoGenerationWithLimit(
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
      kind: "video",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    const code = resolveInputImageErrorCode(error);
    if (code === INPUT_IMAGE_STORAGE_REQUIRED || code === INPUT_IMAGE_INVALID) {
      return buildErrorResponse(code, 400);
    }
    const mediaCode = resolveInputMediaErrorCode(error);
    if ([INPUT_MEDIA_FETCH_FAILED, INPUT_MEDIA_INVALID, INPUT_MEDIA_STORAGE_REQUIRED].includes(mediaCode ?? "")) {
      return buildErrorResponse(mediaCode as string, 400);
    }
    if (mediaCode === INPUT_MEDIA_TOO_LARGE) {
      return buildErrorResponse(mediaCode, 413);
    }
    return buildErrorResponse("INTERNAL_SERVER_ERROR", 500);
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
  "/api/video-generation",
  guardedPostHandler,
);
