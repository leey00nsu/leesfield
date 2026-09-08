import type { z } from "zod";
import type {
  generationStatusSchema,
  statusResponseSchemas,
} from "@/shared/api/external-contract";

export type ImageGenerationStatus = z.infer<typeof generationStatusSchema>;
export type ImageGenerationResponse = z.infer<
  typeof statusResponseSchemas.image
>;
export type ImageGenerationResult = NonNullable<
  ImageGenerationResponse["result"]
>;
