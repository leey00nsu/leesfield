import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationResponse } from "@/features/audio-generation/model/audio-generation-types";
import { hfSpaceAudioAdapter } from "@/server/audio-generation/adapters/hf-space-adapter";
import type { AudioGenerationAdapter } from "@/server/audio-generation/adapters/types";
import { leemageAudioStorageAdapter } from "@/server/audio-generation/storage/adapters/leemage-storage-adapter";
import type {
  AudioStorageAdapter,
  AudioStorageMeta,
} from "@/server/audio-generation/storage/storage-adapter";
import { resolveAudioStorageProvider } from "@/server/audio-generation/storage/storage-selector";

type AudioProvider = "hf_space";

function resolveAudioProvider(
  modelKey: AudioGenerationFormValues["model"],
): AudioProvider {
  void modelKey;
  return "hf_space";
}

function getAdapter(
  modelKey: AudioGenerationFormValues["model"],
): AudioGenerationAdapter {
  const provider = resolveAudioProvider(modelKey);
  if (provider === "hf_space") return hfSpaceAudioAdapter;
  throw new Error(`AUDIO_PROVIDER_NOT_SUPPORTED:${provider}`);
}

function getStorageAdapter(): AudioStorageAdapter {
  const { provider } = resolveAudioStorageProvider();
  if (provider === "leemage") return leemageAudioStorageAdapter;
  throw new Error("AUDIO_STORAGE_PROVIDER_NOT_RESOLVED");
}

function resolveDurationSec(payload: AudioGenerationFormValues, meta?: AudioStorageMeta) {
  if (typeof meta?.duration_sec === "number" && Number.isFinite(meta.duration_sec)) {
    return meta.duration_sec;
  }
  const fallback = payload.speed && payload.speed > 0 ? 1 / payload.speed : 1;
  return Number.isFinite(fallback) ? Math.max(0.1, Number(fallback.toFixed(2))) : 1;
}

function buildInlineResult(
  payload: AudioGenerationFormValues,
  dataUrls: string[],
  meta?: AudioStorageMeta,
): NonNullable<AudioGenerationResponse["result"]> {
  const durationSec = resolveDurationSec(payload, meta);
  return {
    audios: dataUrls.map((url) => ({
      url,
      durationSec,
    })),
  };
}

function mapProviderError(adapter: AudioGenerationAdapter | null, error: unknown) {
  if (adapter?.mapError) {
    return adapter.mapError(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "오디오 생성에 실패했습니다.";
}

export async function resolveAudioGenerationResult(
  payload: AudioGenerationFormValues,
  requestId: string,
): Promise<{
  status: "completed" | "failed";
  result?: AudioGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
}> {
  let adapter: AudioGenerationAdapter | null = null;
  try {
    adapter = getAdapter(payload.model);
    const result = await adapter.generate(payload);
    const { provider, warningMessage } = resolveAudioStorageProvider();

    if (!provider) {
      const message =
        warningMessage ??
        "오디오 저장소가 지정되지 않아 결과가 저장되지 않습니다.";
      console.warn("[audio-storage] storage skipped", { requestId, message });
      return {
        status: "completed",
        result: buildInlineResult(payload, result.audios, result.meta),
        errorMessage: message,
        skipDbSave: true,
      };
    }

    const storageAdapter = getStorageAdapter();
    return storageAdapter.uploadAudios(
      payload,
      requestId,
      result.audios,
      result.meta,
    );
  } catch (error) {
    return {
      status: "failed",
      errorMessage: mapProviderError(adapter, error),
    };
  }
}
