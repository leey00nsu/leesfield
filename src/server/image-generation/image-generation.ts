import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import { getImageModelConfig } from "@/features/image-generation/model/image-models";
import { hfSpaceImageAdapter } from "@/server/image-generation/adapters/hf-space-adapter";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import { leemageStorageAdapter } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import type {
  ImageStorageAdapter,
  ImageStorageProvider,
} from "@/server/image-generation/storage/storage-adapter";
import { resolveImageStorageProvider } from "@/server/image-generation/storage/storage-selector";

type ImageProvider = "hf_space";

function resolveImageProvider(modelKey: ImageGenerationFormValues["model"]): ImageProvider {
  const provider = getImageModelConfig(modelKey).provider;
  if (provider === "hf_space") return "hf_space";
  throw new Error(`IMAGE_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getAdapter(modelKey: ImageGenerationFormValues["model"]): ImageGenerationAdapter {
  const provider = resolveImageProvider(modelKey);
  if (provider === "hf_space") return hfSpaceImageAdapter;
  throw new Error(`IMAGE_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getStorageAdapter(): ImageStorageAdapter {
  const provider: ImageStorageProvider = resolveImageStorageProvider();
  if (provider === "leemage") return leemageStorageAdapter;
  throw new Error(`IMAGE_STORAGE_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function mapProviderError(error: unknown) {
  if (!(error instanceof Error)) {
    return "이미지 생성에 실패했습니다.";
  }
  const message = error.message || "";
  const lower = message.toLowerCase();
  if (lower.startsWith("hf_space_not_ready")) {
    return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
  }
  if (lower === "hf_space_status_fetch_failed") {
    return "HF Space 상태 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
  let code: string | null = null;
  if (
    lower.includes("quota") ||
    lower.includes("exceed") ||
    lower.includes("limit") ||
    lower.includes("daily") ||
    lower.includes("zero gpu") ||
    lower.includes("zerogpu")
  ) {
    code = "HF_SPACE_QUOTA_EXCEEDED";
  } else if (lower.includes("queue") || lower.includes("queued")) {
    code = "HF_SPACE_QUEUE_FULL";
  } else if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    code = "HF_SPACE_RATE_LIMITED";
  } else if (
    lower.includes("sleep") ||
    lower.includes("paused") ||
    lower.includes("building") ||
    lower.includes("loading")
  ) {
    code = "HF_SPACE_NOT_READY";
  }

  switch (code) {
    case "HF_SPACE_QUOTA_EXCEEDED":
      return "ZeroGPU 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 다른 제공자를 사용해주세요.";
    case "HF_SPACE_QUEUE_FULL":
      return "현재 대기열이 가득합니다. 잠시 후 다시 시도해주세요.";
    case "HF_SPACE_RATE_LIMITED":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case "HF_SPACE_NOT_READY":
      return "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요.";
    default:
      return message || "이미지 생성에 실패했습니다.";
  }
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
    const adapter = getAdapter(payload.model);
    const result = await adapter.generate(payload);
    const storageAdapter = getStorageAdapter();
    return storageAdapter.uploadImages(payload, requestId, result.images);
  } catch (error) {
    return {
      status: "failed",
      errorMessage: mapProviderError(error),
    };
  }
}
