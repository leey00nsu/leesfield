import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
} from "@/features/video-generation/model/video-generation-types";
import { createSubmissionIntent } from "@/shared/api/submission-intent";

async function requestJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "REQUEST_FAILED";
    const error = new Error(message);
    (error as Error & { code?: string }).code = payload?.message;
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const result = await response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });
  return result;
}

export async function requestVideoGeneration(
  payload: VideoGenerationFormValues,
): Promise<VideoGenerationResponse> {
  const key = videoSubmissionIntent.take(JSON.stringify(payload));
  try {
    const result = await requestJson("/api/video-generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    videoSubmissionIntent.settle(key);
    return result;
  } catch (error) {
    videoSubmissionIntent.settle(key, error);
    throw error;
  }
}

const videoSubmissionIntent = createSubmissionIntent();

export async function fetchVideoGenerationStatus(
  requestId: string,
): Promise<VideoGenerationResponse> {
  return requestJson(`/api/video-generation/${requestId}`, {
    method: "GET",
    cache: "no-store",
  });
}
