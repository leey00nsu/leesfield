import type {
  VideoStorageAdapter,
  VideoStorageProvider,
} from "@/server/video-generation/storage/storage-adapter";
import { leemageVideoStorageAdapter } from "@/server/video-generation/storage/adapters/leemage-storage-adapter";

interface VideoStorageResolution {
  provider: VideoStorageProvider | null;
  warningMessage?: string;
}

const MISSING_PROVIDER_MESSAGE =
  "비디오 저장소가 지정되지 않아 결과가 히스토리에 저장되지 않습니다.";

const storageAdapters: Record<VideoStorageProvider, VideoStorageAdapter> = {
  leemage: leemageVideoStorageAdapter,
};

export function resolveVideoStorageProvider(): VideoStorageResolution {
  const raw = process.env.VIDEO_STORAGE_PROVIDER?.toLowerCase().trim();

  if (!raw) {
    return { provider: null, warningMessage: MISSING_PROVIDER_MESSAGE };
  }

  if (raw in storageAdapters) {
    const provider = raw as VideoStorageProvider;
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
    warningMessage: `지원하지 않는 비디오 저장소(${raw})로 인해 결과가 히스토리에 저장되지 않습니다.`,
  };
}
