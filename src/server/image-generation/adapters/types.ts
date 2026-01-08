import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";

export type ImageGenerationAdapterResult = {
  images: string[];
};

export type ImageGenerationAdapter = {
  generate: (
    payload: ImageGenerationFormValues,
  ) => Promise<ImageGenerationAdapterResult>;
};
