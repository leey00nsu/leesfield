import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
} from "@/features/image-generation/model/image-generation-types";

async function requestJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const code = payload?.message;
    if (code === "IN_PROGRESS_ALREADY") {
      const error = new Error(code);
      (error as Error & { code?: string }).code = code;
      (error as Error & { requestId?: string }).requestId = payload?.requestId;
      throw error;
    }
    const message = payload?.message ?? "REQUEST_FAILED";
    const error = new Error(message);
    (error as Error & { code?: string }).code = code;
    throw error;
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
