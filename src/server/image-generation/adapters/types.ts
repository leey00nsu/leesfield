import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";

export type ImageGenerationAdapterResult = {
  images: string[];
  meta?: { width: number; height: number };
};

export type ImageGenerationAdapter = {
  generate: (
    payload: ImageGenerationFormValues,
    context?: { requestId: string; executionModel?: import("@/server/model-catalog/catalog-schema").ModelCatalogItem },
  ) => Promise<ImageGenerationAdapterResult>;
  mapError?: (error: unknown) => string;
};
