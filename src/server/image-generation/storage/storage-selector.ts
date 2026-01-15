import type { ImageStorageProvider } from "@/server/image-generation/storage/storage-adapter";

interface ImageStorageResolution {
  provider: ImageStorageProvider | null;
  warningMessage?: string;
}

const MISSING_PROVIDER_MESSAGE =
  "이미지 저장소가 지정되지 않아 결과가 히스토리에 저장되지 않습니다.";
const MISSING_LEEMAGE_MESSAGE =
  "Leemage 저장소 설정이 없어 결과가 히스토리에 저장되지 않습니다.";

function hasLeemageEnv() {
  return Boolean(
    process.env.LEEMAGE_API_KEY &&
      process.env.LEEMAGE_PROJECT_ID &&
      process.env.LEEMAGE_STORAGE_PROVIDER,
  );
}

export function resolveImageStorageProvider(): ImageStorageResolution {
  const raw = process.env.IMAGE_STORAGE_PROVIDER?.toLowerCase().trim();

  if (!raw) {
    return { provider: null, warningMessage: MISSING_PROVIDER_MESSAGE };
  }

  if (raw === "leemage") {
    if (!hasLeemageEnv()) {
      return { provider: null, warningMessage: MISSING_LEEMAGE_MESSAGE };
    }
    return { provider: "leemage" };
  }

  return {
    provider: null,
    warningMessage: `지원하지 않는 이미지 저장소(${raw})로 인해 결과가 히스토리에 저장되지 않습니다.`,
  };
}
