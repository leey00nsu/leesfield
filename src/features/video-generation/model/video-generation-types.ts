import type { z } from "zod";
import type {
  generationStatusSchema,
  statusResponseSchemas,
} from "@/shared/api/external-contract";

export type VideoGenerationStatus = z.infer<typeof generationStatusSchema>;
export type VideoGenerationResponse = z.infer<
  typeof statusResponseSchemas.video
>;
export type VideoGenerationResult = NonNullable<
  VideoGenerationResponse["result"]
>;
