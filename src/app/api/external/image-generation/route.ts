import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { getImageModelConcurrentLimit } from "@/features/image-generation/model/image-models";
import { createMockGenerationWithLimit } from "@/server/image-generation/image-generation-store";
import { requireApiKey } from "@/server/auth/api-key-guard";
import {
  buildConcurrentLimitResponse,
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";
import {
  FILE_TOO_LARGE_ERROR,
  getDataUrlList,
  getNumber,
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

  let initImages: string[] = [];
  try {
    initImages = await getDataUrlList(formData, [
      "initImages",
      "initImages[]",
    ], MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === FILE_TOO_LARGE_ERROR) {
      return buildErrorResponse("FILE_TOO_LARGE", 413);
    }
    console.error("[image-generation] file parse failed", error);
    return buildErrorResponse("INVALID_FORM_DATA", 400);
  }

  const body = {
    prompt: getString(formData, "prompt"),
    width: getNumber(formData, "width"),
    height: getNumber(formData, "height"),
    initImages: initImages.length > 0 ? initImages : undefined,
    model: getString(formData, "model"),
    imageCount: getNumber(formData, "imageCount"),
    steps: getNumber(formData, "steps"),
    seed: getString(formData, "seed"),
  };

  const parsed = imageGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  try {
    const limit = getImageModelConcurrentLimit(parsed.data.model);
    const { record, latest } = await createMockGenerationWithLimit(
      parsed.data,
      auth.ownerEmail,
      limit,
    );
    if (!record) {
      return buildConcurrentLimitResponse(latest?.id);
    }

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[image-generation] create failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
