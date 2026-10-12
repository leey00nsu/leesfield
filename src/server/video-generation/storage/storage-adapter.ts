import type { MediaOutput } from "@/server/media-assets/binary-media-output";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";

export type VideoStorageProvider = "leemage";

export type VideoStorageMeta = {
  width?: number;
  height?: number;
  duration_sec?: number;
  fps?: number;
  outputs?: Array<{width:number;height:number;duration_sec?:number}>;
};

export interface VideoStorageResult {
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
  skipDbSave?: boolean;
  artifacts?: GeneratedMediaArtifact[];
  failure?: { error: unknown; phase: string };
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
    outputs: MediaOutput[],
    meta?: VideoStorageMeta
  ) => Promise<VideoStorageResult>;
  checkAvailability?: () => VideoStorageAvailability;
}
