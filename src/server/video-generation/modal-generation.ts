import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import { requestModalVideoGeneration } from "@/server/video-generation/modal-client";
import { uploadGeneratedVideos } from "@/server/video-generation/leemage-storage";

export async function resolveModalVideoGenerationResult(
  payload: VideoGenerationFormValues,
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
}> {
  try {
    const modalResult = await requestModalVideoGeneration(payload);
    return uploadGeneratedVideos(payload, requestId, modalResult.videos);
  } catch (error) {
    return {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Modal 요청에 실패했습니다.",
    };
  }
}
