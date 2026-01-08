import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";

export type VideoGenerationAdapterResult = {
  videos: string[];
  meta?: {
    width?: number;
    height?: number;
    duration_sec?: number;
    fps?: number;
  };
};

export type VideoGenerationAdapter = {
  generate: (
    payload: VideoGenerationFormValues,
  ) => Promise<VideoGenerationAdapterResult>;
};
