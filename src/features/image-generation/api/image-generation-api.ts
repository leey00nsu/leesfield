import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
} from "@/features/image-generation/model/image-generation-types";

async function requestJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (payload?.message === "IN_PROGRESS_ALREADY") {
      const error = new Error("이미 동일한 모델 요청이 진행 중입니다.");
      (error as Error & { requestId?: string }).requestId = payload?.requestId;
      throw error;
    }
    const message = payload?.message ?? "요청에 실패했습니다.";
    throw new Error(message);
  }
  const result = await response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });
  return result;
}

export async function requestImageGeneration(
  payload: ImageGenerationFormValues,
): Promise<ImageGenerationResponse> {
  return requestJson("/api/image-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchImageGenerationStatus(
  requestId: string,
): Promise<ImageGenerationResponse> {
  return requestJson(`/api/image-generation/${requestId}`, {
    method: "GET",
    cache: "no-store",
  });
}
