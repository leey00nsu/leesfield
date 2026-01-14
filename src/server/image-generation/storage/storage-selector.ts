import type { ImageStorageProvider } from "@/server/image-generation/storage/storage-adapter";

const DEFAULT_PROVIDER: ImageStorageProvider = "leemage";

export function resolveImageStorageProvider(): ImageStorageProvider {
  const raw = process.env.IMAGE_STORAGE_PROVIDER?.toLowerCase().trim();
  if (raw === "leemage") return "leemage";
  return DEFAULT_PROVIDER;
}
