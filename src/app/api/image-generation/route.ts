import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { submitImageGeneration } from "@/server/image-generation/image-generation-submission";
import { getGeneration } from "@/server/image-generation/image-generation-store";
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
  buildQueueFullResponse,
  jsonWithNoStore,
} from "@/server/http/response";
import { validateImageGenerationPayload } from "@/server/model-catalog/generation-validation";
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
  const parsed = await validateImageGenerationPayload(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  const admitted = await admitSubmission({
    request,
    ownerEmail,
    payload: { type: "image", payload: parsed.data },
    providerKey: parsed.data.model ?? null,
    modelKey: parsed.data.model ?? null,
    modelType: "image",
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
    const existing = await getGeneration(admitted.requestId, ownerEmail);
    return existing
      ? buildGenerationSuccessResponse(existing)
      : jsonWithNoStore({
          requestId: admitted.requestId,
          status: "pending",
          progress: 0,
        });
  }

  try {
    const { record } = await submitImageGeneration({
      payload: parsed.data,
      ownerEmail,
      requestId: admitted.requestId,
    });
    await finalizeSubmission(admitted.requestId, "submitted");

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    await finalizeSubmission(admitted.requestId, "failed");
    logStructured("generation.create.failure", {
      requestId: admitted.requestId,
      kind: "image",
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
  "/api/image-generation",
  guardedPostHandler,
);
