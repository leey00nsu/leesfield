import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";

export type VideoStorageProvider = "leemage";

export type VideoStorageMeta = {
  width?: number;
  height?: number;
  duration_sec?: number;
  fps?: number;
};

export interface VideoStorageResult {
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
}

export interface VideoStorageAvailability {
  isAvailable: boolean;
  warningMessage?: string;
}

export interface VideoStorageAdapter {
  name: VideoStorageProvider;
  uploadVideos: (
    payload: VideoGenerationFormValues,
    requestId: string,
    dataUrls: string[],
    meta?: VideoStorageMeta
  ) => Promise<VideoStorageResult>;
  checkAvailability?: () => VideoStorageAvailability;
}
