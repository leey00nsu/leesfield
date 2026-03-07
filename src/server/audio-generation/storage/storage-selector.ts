import type {
  AudioStorageAdapter,
  AudioStorageProvider,
} from "@/server/audio-generation/storage/storage-adapter";
import { leemageAudioStorageAdapter } from "@/server/audio-generation/storage/adapters/leemage-storage-adapter";

interface AudioStorageResolution {
  provider: AudioStorageProvider | null;
  warningMessage?: string;
}

const MISSING_PROVIDER_MESSAGE =
  "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.";

const storageAdapters: Record<AudioStorageProvider, AudioStorageAdapter> = {
  leemage: leemageAudioStorageAdapter,
};

export function resolveAudioStorageProvider(): AudioStorageResolution {
  const raw = process.env.AUDIO_STORAGE_PROVIDER?.toLowerCase().trim();

  if (!raw) {
    return { provider: null, warningMessage: MISSING_PROVIDER_MESSAGE };
  }

  if (raw in storageAdapters) {
    const provider = raw as AudioStorageProvider;
    const adapter = storageAdapters[provider];
    const availability = adapter.checkAvailability?.();
    if (availability && !availability.isAvailable) {
      return {
        provider: null,
        warningMessage: availability.warningMessage ?? MISSING_PROVIDER_MESSAGE,
      };
    }
    return { provider: adapter.name };
  }

  return {
    provider: null,
    warningMessage: `지원하지 않는 오디오 저장소(${raw})로 인해 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.`,
  };
}
