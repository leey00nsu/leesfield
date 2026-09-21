import { z } from "zod";
import { withExternalApi } from "@/server/external-api/route-handler";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getExternalModelInput } from "@/server/external-api/model-input";
import {
  readExternalGenerationRequest,
  resolveExternalFiles,
  ExternalRequestError,
} from "@/server/external-api/generation-request";
import {
  buildErrorResponse,
  buildInvalidRequestResponse,
  jsonWithNoStore,
} from "@/server/http/response";
import { externalGenerationResponseSchema } from "@/shared/api/external-contract";
import { submitImageGeneration } from "@/server/image-generation/image-generation-submission";
import { createMockVideoGenerationWithLimit } from "@/server/video-generation/video-generation-store";
import { createMockAudioGenerationWithLimit } from "@/server/audio-generation/audio-generation-store";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { admitSubmission } from "@/server/generation-admission/admitted-submission";
import { finalizeSubmission } from "@/server/generation-admission/submission-ledger";
import { getGeneration } from "@/server/image-generation/image-generation-store";
import { getVideoGeneration } from "@/server/video-generation/video-generation-store";
import { getAudioGeneration } from "@/server/audio-generation/audio-generation-store";
import { buildQueueFullResponse } from "@/server/http/response";
import {
  resolveInputImageErrorCode,
  INPUT_IMAGE_INVALID,
  INPUT_IMAGE_STORAGE_REQUIRED,
} from "@/server/shared/input-image-uploader";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import {
  INPUT_MEDIA_FETCH_FAILED,
  INPUT_MEDIA_INVALID,
  INPUT_MEDIA_STORAGE_REQUIRED,
  INPUT_MEDIA_TOO_LARGE,
  resolveInputMediaErrorCode,
} from "@/server/shared/input-media-uploader";
import { logStructured } from "@/server/observability/request-observability";
import {
  BodyLimitError,
  withHeavyBodyPermit,
} from "@/server/http/bounded-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
async function postHandler(request: Request) {
  return await withExternalApi(request, async (auth) => {
    const rateLimited = await enforceRateLimit(
    RATE_LIMITS.generationKey,
    auth.apiKeyId,
    );
    if (rateLimited) return rateLimited;
    let input;
    try {
      input = await readExternalGenerationRequest(request);
    } catch (error) {
      if (error instanceof ExternalRequestError)
        return buildErrorResponse(error.message, error.status);
      if (error instanceof z.ZodError)
        return buildInvalidRequestResponse(error.flatten());
      return buildErrorResponse("INVALID_REQUEST", 400);
    }
    const { body, uploads } = input;
    const catalog = await getModelCatalog();
    const model = catalog.find(
      (model) => model.id === body.model && model.isActive,
    );
    if (!model) return buildErrorResponse("MODEL_NOT_FOUND", 404);
    if (model.type !== body.type)
      return buildErrorResponse("MODEL_TYPE_MISMATCH", 400);
    let payload;
    try {
      const contract = getExternalModelInput(model);
      payload = contract.parse(
        await resolveExternalFiles(body.dynamicParams, uploads, contract.files),
      );
    } catch (error) {
      if (error instanceof ExternalRequestError)
        return buildErrorResponse(error.message, error.status);
      if (error instanceof z.ZodError)
        return buildInvalidRequestResponse(error.flatten());
      return buildInvalidRequestResponse({
        message: error instanceof Error ? error.message : "INVALID_MODEL_INPUT",
      });
    }

    const admitted = await admitSubmission({
      request,
      ownerEmail: auth.ownerEmail,
      apiKeyId: auth.apiKeyId,
      payload: { type: body.type, model: body.model, params: payload },
      providerKey: model.key ?? model.id,
      modelKey: model.key,
      modelType: body.type,
    });
    if (admitted.kind === "model-unavailable")
      return buildErrorResponse("MODEL_NOT_FOUND", 404);
    if (admitted.kind === "conflict")
      return buildErrorResponse("IDEMPOTENCY_CONFLICT", 409);
    if (admitted.kind === "rejected")
      return buildQueueFullResponse(admitted.reason);
    if (admitted.kind === "reuse") {
      const [image, video, audio] = await Promise.all([
        getGeneration(admitted.requestId, auth.ownerEmail, auth.apiKeyId),
        getVideoGeneration(admitted.requestId, auth.ownerEmail, auth.apiKeyId),
        getAudioGeneration(admitted.requestId, auth.ownerEmail, auth.apiKeyId),
      ]);
      const existing = image ?? video ?? audio;
      return jsonWithNoStore(
        externalGenerationResponseSchema.parse({
          type: body.type,
          requestId: admitted.requestId,
          status: existing?.status ?? "pending",
          progress: existing?.progress ?? 0,
        }),
      );
    }
    try {
      let record;
      if (body.type === "image")
        ({ record } = await submitImageGeneration({
          payload: payload as ImageGenerationFormValues,
          ownerEmail: auth.ownerEmail,
          apiKeyId: auth.apiKeyId,
          requestId: admitted.requestId,
        }));
      else {
        startGenerationWorker();
        ({ record } =
          body.type === "video"
            ? await createMockVideoGenerationWithLimit(
                payload as VideoGenerationFormValues,
                auth.ownerEmail,
                auth.apiKeyId,
                admitted.requestId,
              )
              : await createMockAudioGenerationWithLimit(
                payload as AudioGenerationFormValues,
                auth.ownerEmail,
                auth.apiKeyId,
                admitted.requestId,
              ));
    }
    await finalizeSubmission(admitted.requestId, "submitted");
    return jsonWithNoStore(
        externalGenerationResponseSchema.parse({
          type: body.type,
          requestId: record.id,
          status: record.status,
          progress: record.progress,
        }),
      );
    } catch (error) {
      await finalizeSubmission(admitted.requestId, "failed");
      const code = resolveInputImageErrorCode(error);
      if (code === INPUT_IMAGE_INVALID || code === INPUT_IMAGE_STORAGE_REQUIRED)
        return buildErrorResponse(code, 400);
      const mediaCode = resolveInputMediaErrorCode(error);
      if ([INPUT_MEDIA_INVALID, INPUT_MEDIA_FETCH_FAILED, INPUT_MEDIA_STORAGE_REQUIRED].includes(mediaCode ?? ""))
        return buildErrorResponse(mediaCode as string, 400);
      if (mediaCode === INPUT_MEDIA_TOO_LARGE)
        return buildErrorResponse(mediaCode, 413);
      logStructured("generation.create.failure", {
        requestId: admitted.requestId,
        kind: body.type,
        errorType: error instanceof Error ? error.name : typeof error,
      }, "error");
      return buildErrorResponse("GENERATION_CREATE_FAILED", 500);
    }
  });
}

export async function POST(request: Request) {
  try {
    return await withHeavyBodyPermit(() => postHandler(request));
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return buildErrorResponse(error.code, error.status);
    }
    throw error;
  }
}
