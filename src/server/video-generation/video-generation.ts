import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import { hfSpaceVideoAdapter } from "@/server/video-generation/adapters/hf-space-adapter";
import type { VideoGenerationAdapter } from "@/server/video-generation/adapters/types";
import { uploadGeneratedVideos } from "@/server/video-generation/leemage-storage";

type VideoProvider = "hf_space";

function resolveVideoProvider(): VideoProvider {
  const raw = process.env.VIDEO_PROVIDER?.trim().toLowerCase();
  if (raw === "hf_space") return "hf_space";
  if (!raw) return "hf_space";
  throw new Error(`VIDEO_PROVIDER 설정이 올바르지 않습니다: ${raw}`);
}

function getAdapter(): VideoGenerationAdapter {
  resolveVideoProvider();
  return hfSpaceVideoAdapter;
}

export async function resolveVideoGenerationResult(
  payload: VideoGenerationFormValues,
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
}> {
  try {
    const adapter = getAdapter();
    const result = await adapter.generate(payload);
    return uploadGeneratedVideos(payload, requestId, result.videos, result.meta);
  } catch (error) {
    return {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "비디오 생성에 실패했습니다.",
    };
  }
}
