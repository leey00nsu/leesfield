import { z } from "zod";

export const executeNodeGenerationSchema = z
  .object({
    expectedGraphVersion: z.number().int().positive(),
  })
  .strict();

export type ExecuteNodeGenerationInput = z.infer<
  typeof executeNodeGenerationSchema
>;

export type NodeGenerationDto = {
  requestId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  errorMessage: string | null;
  createdAt: string;
  modelKey: string | null;
  images: Array<{
    id: string;
    url: string;
    width: number | null;
    height: number | null;
  }>;
};
