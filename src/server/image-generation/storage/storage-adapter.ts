import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";

export type ImageStorageProvider = "leemage";

export interface ImageStorageResult {
  status: "completed" | "failed";
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
}

export interface ImageStorageAvailability {
  isAvailable: boolean;
  warningMessage?: string;
}

export interface ImageStorageAdapter {
  name: ImageStorageProvider;
  uploadImages: (
    payload: ImageGenerationFormValues,
    requestId: string,
    dataUrls: string[],
  ) => Promise<ImageStorageResult>;
  checkAvailability?: () => ImageStorageAvailability;
}
