import { z } from "zod";

const graphIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const optionalHandleSchema = z.string().trim().min(1).max(128).nullable().default(null);

export const imageGenerationConfigV1Schema = z
  .object({
    prompt: z.string().max(20_000),
    modelKey: z.string().trim().min(1).max(200).nullable(),
    parameters: z.record(z.string(), z.json()),
  })
  .strict();

export const createGenerationGraphSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export const generationGraphNodeSchema = z
  .object({
    id: graphIdSchema,
    type: z.literal("imageGeneration"),
    position: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
      })
      .strict(),
    configVersion: z.literal(1),
    config: imageGenerationConfigV1Schema,
    selectedOutputImageId: graphIdSchema.nullable().default(null),
  })
  .strict();

export const generationGraphEdgeSchema = z
  .object({
    id: graphIdSchema,
    sourceNodeId: graphIdSchema,
    targetNodeId: graphIdSchema,
    kind: z.enum(["primary", "reference"]),
    sourceHandle: optionalHandleSchema,
    targetHandle: optionalHandleSchema,
  })
  .strict();

export const updateGenerationGraphSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    nodes: z.array(generationGraphNodeSchema).max(500),
    edges: z.array(generationGraphEdgeSchema).max(2_000),
  })
  .strict();

export type CreateGenerationGraphInput = z.infer<typeof createGenerationGraphSchema>;
export type GenerationGraphNodeInput = z.infer<typeof generationGraphNodeSchema>;
export type GenerationGraphEdgeInput = z.infer<typeof generationGraphEdgeSchema>;
export type UpdateGenerationGraphInput = z.infer<typeof updateGenerationGraphSchema>;
export type ImageGenerationConfigV1 = z.infer<typeof imageGenerationConfigV1Schema>;
