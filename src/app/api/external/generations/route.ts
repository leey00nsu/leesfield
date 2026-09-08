import { z } from "zod";
import { withExternalApi } from "@/server/external-api/route-handler";
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
import {
  resolveInputImageErrorCode,
  INPUT_IMAGE_INVALID,
  INPUT_IMAGE_STORAGE_REQUIRED,
} from "@/server/shared/input-image-uploader";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export async function POST(request: Request) {
  return withExternalApi(request, async (auth) => {
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
    try {
      let record;
      if (body.type === "image")
        ({ record } = await submitImageGeneration({
          payload: payload as ImageGenerationFormValues,
          ownerEmail: auth.ownerEmail,
          apiKeyId: auth.apiKeyId,
        }));
      else {
        startGenerationWorker();
        ({ record } =
          body.type === "video"
            ? await createMockVideoGenerationWithLimit(
                payload as VideoGenerationFormValues,
                auth.ownerEmail,
                auth.apiKeyId,
              )
            : await createMockAudioGenerationWithLimit(
                payload as AudioGenerationFormValues,
                auth.ownerEmail,
                auth.apiKeyId,
              ));
      }
      return jsonWithNoStore(
        externalGenerationResponseSchema.parse({
          type: body.type,
          requestId: record.id,
          status: record.status,
          progress: record.progress,
        }),
      );
    } catch (error) {
      const code = resolveInputImageErrorCode(error);
      if (code === INPUT_IMAGE_INVALID || code === INPUT_IMAGE_STORAGE_REQUIRED)
        return buildErrorResponse(code, 400);
      console.error("[external-generations] create failed", error);
      return buildErrorResponse("GENERATION_CREATE_FAILED", 500);
    }
  });
}
