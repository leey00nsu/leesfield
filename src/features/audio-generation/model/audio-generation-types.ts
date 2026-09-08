import type { z } from "zod";
import type {
  generationStatusSchema,
  statusResponseSchemas,
} from "@/shared/api/external-contract";

export type AudioGenerationStatus = z.infer<typeof generationStatusSchema>;
export type AudioGenerationResponse = z.infer<
  typeof statusResponseSchemas.audio
>;
export type AudioGenerationResult = NonNullable<
  AudioGenerationResponse["result"]
>;
