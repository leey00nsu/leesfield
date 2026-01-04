import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import { requestModalGeneration } from "@/server/image-generation/modal-client";
import { uploadGeneratedImages } from "@/server/image-generation/leemage-storage";

export async function resolveModalGenerationResult(
  payload: ImageGenerationFormValues,
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
}> {
  try {
    const modalResult = await requestModalGeneration(payload);
    return uploadGeneratedImages(payload, requestId, modalResult.images);
  } catch (error) {
    return {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Modal 요청에 실패했습니다.",
    };
  }
}
