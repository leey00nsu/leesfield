import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import { hfSpaceImageAdapter } from "@/server/image-generation/adapters/hf-space-adapter";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import { uploadGeneratedImages } from "@/server/image-generation/leemage-storage";

type ImageProvider = "hf_space";

function resolveImageProvider(): ImageProvider {
  const raw = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === "hf_space") return "hf_space";
  throw new Error(`IMAGE_PROVIDER 설정이 올바르지 않습니다: ${raw}`);
}

function getAdapter(): ImageGenerationAdapter {
  resolveImageProvider();
  return hfSpaceImageAdapter;
}

export async function resolveImageGenerationResult(
  payload: ImageGenerationFormValues,
  requestId: string
): Promise<{
  status: "completed" | "failed";
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
}> {
  try {
    const adapter = getAdapter();
    const result = await adapter.generate(payload);
    return uploadGeneratedImages(payload, requestId, result.images);
  } catch (error) {
    return {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "이미지 생성에 실패했습니다.",
    };
  }
}
