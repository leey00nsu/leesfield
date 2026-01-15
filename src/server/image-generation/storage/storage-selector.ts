import type {
  ImageStorageAdapter,
  ImageStorageProvider,
} from "@/server/image-generation/storage/storage-adapter";
import { leemageStorageAdapter } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";

interface ImageStorageResolution {
  provider: ImageStorageProvider | null;
  warningMessage?: string;
}

const MISSING_PROVIDER_MESSAGE =
  "이미지 저장소가 지정되지 않아 결과가 히스토리에 저장되지 않습니다.";
const storageAdapters: Record<ImageStorageProvider, ImageStorageAdapter> = {
  leemage: leemageStorageAdapter,
};

export function resolveImageStorageProvider(): ImageStorageResolution {
  const raw = process.env.IMAGE_STORAGE_PROVIDER?.toLowerCase().trim();

  if (!raw) {
    return { provider: null, warningMessage: MISSING_PROVIDER_MESSAGE };
  }

  if (raw in storageAdapters) {
    const provider = raw as ImageStorageProvider;
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
    warningMessage: `지원하지 않는 이미지 저장소(${raw})로 인해 결과가 히스토리에 저장되지 않습니다.`,
  };
}
