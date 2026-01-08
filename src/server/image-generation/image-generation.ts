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

function mapProviderError(error: unknown) {
  if (!(error instanceof Error)) {
    return "이미지 생성에 실패했습니다.";
  }
  const message = error.message;
  if (message.startsWith("HF_SPACE_NOT_READY")) {
    return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
  }
  if (message === "HF_SPACE_STATUS_FETCH_FAILED") {
    return "HF Space 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
  return message || "이미지 생성에 실패했습니다.";
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
      errorMessage: mapProviderError(error),
    };
  }
}
