import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationResponse } from "@/features/audio-generation/model/audio-generation-types";

async function requestJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "REQUEST_FAILED";
    const error = new Error(message);
    (error as Error & { code?: string }).code = payload?.message;
    throw error;
  }
  const result = await response.json().catch(() => {
    throw new Error("응답 파싱에 실패했습니다.");
  });
  return result;
}

export async function requestAudioGeneration(
  payload: AudioGenerationFormValues,
): Promise<AudioGenerationResponse> {
  return requestJson("/api/audio-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchAudioGenerationStatus(
  requestId: string,
): Promise<AudioGenerationResponse> {
  return requestJson(`/api/audio-generation/${requestId}`, {
    method: "GET",
    cache: "no-store",
  });
}
