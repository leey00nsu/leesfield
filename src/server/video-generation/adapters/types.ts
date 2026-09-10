import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";

export type VideoGenerationAdapterResult = {
  videos: string[];
  meta?: {
    width?: number;
    height?: number;
    duration_sec?: number;
    fps?: number;
    outputs?: Array<{width:number;height:number;duration_sec?:number}>;
  };
};

export type VideoGenerationAdapter = {
  generate: (
    payload: VideoGenerationFormValues,
    context?: { requestId: string; executionModel?: import("@/server/model-catalog/catalog-schema").ModelCatalogItem },
  ) => Promise<VideoGenerationAdapterResult>;
  mapError?: (error: unknown) => string;
};
