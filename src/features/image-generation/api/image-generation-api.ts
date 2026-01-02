import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
} from "@/features/image-generation/model/image-generation-types";

async function requestJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "요청에 실패했습니다.";
    throw new Error(message);
  }
  return response.json();
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
