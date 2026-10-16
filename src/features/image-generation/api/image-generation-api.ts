import { generationResponseError } from "@/shared/api/generation-response-error";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
type CinemaAuthoringValues = ImageGenerationFormValues & { cinema?: unknown };
import type {
  ImageGenerationResponse,
} from "@/features/image-generation/model/image-generation-types";
import { createSubmissionIntent } from "@/shared/api/submission-intent";

async function requestJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw await generationResponseError(response);
  }
  const result = await response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });
  return result;
}

export async function requestImageGeneration(
  payload: CinemaAuthoringValues,
  options?: { idempotencyKey: string; signal: AbortSignal },
): Promise<ImageGenerationResponse> {
  const key = options?.idempotencyKey ?? imageSubmissionIntent.take(JSON.stringify(payload));
  try {
    const result = await requestJson("/api/image-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
    if (!options) imageSubmissionIntent.settle(key);
    return result;
  } catch (error) {
    if (!options) imageSubmissionIntent.settle(key, error);
    throw error;
  }
}

const imageSubmissionIntent = createSubmissionIntent();

export async function fetchImageGenerationStatus(
  requestId: string,
  signal?: AbortSignal,
): Promise<ImageGenerationResponse> {
  return requestJson(`/api/image-generation/${requestId}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
}
