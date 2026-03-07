import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationResponse } from "@/features/audio-generation/model/audio-generation-types";

export type AudioStorageProvider = "leemage";

export type AudioStorageMeta = {
  duration_sec?: number;
};

export interface AudioStorageResult {
  status: "completed" | "failed";
  result?: AudioGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
}

export interface AudioStorageAvailability {
  isAvailable: boolean;
  warningMessage?: string;
}

export interface AudioStorageAdapter {
  name: AudioStorageProvider;
  uploadAudios: (
    payload: AudioGenerationFormValues,
    requestId: string,
    dataUrls: string[],
    meta?: AudioStorageMeta,
  ) => Promise<AudioStorageResult>;
  checkAvailability?: () => AudioStorageAvailability;
}
