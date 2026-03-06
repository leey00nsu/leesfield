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

function appendIfPresent(formData: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (typeof value === "string") {
    if (!value.length) return;
    formData.append(key, value);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    formData.append(key, String(value));
    return;
  }
  if (typeof value === "boolean") {
    formData.append(key, String(value));
  }
}

export async function requestAudioGeneration(
  payload: AudioGenerationFormValues,
): Promise<AudioGenerationResponse> {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    appendIfPresent(formData, key, value);
  });

  return requestJson("/api/audio-generation", {
    method: "POST",
    body: formData,
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
