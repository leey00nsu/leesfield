import { z } from "zod";

import { canonicalEdgeSchema, canonicalNodeSchema, canonicalGroupSchema, graphDocumentV3Schema } from "@/shared/generation-graph/canonical-graph";

export const createGenerationGraphSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export const updateGenerationGraphSchema = z
  .object({
    schemaVersion: z.literal(3),
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    nodes: z.array(canonicalNodeSchema).max(500),
    edges: z.array(canonicalEdgeSchema).max(2_000),
    groups: z.array(canonicalGroupSchema).max(500),
  })
  .strict()
  .superRefine((input, ctx) => {
    const result = graphDocumentV3Schema.safeParse({
      schemaVersion: input.schemaVersion, minimumWriterVersion: 3,
      id: "validation", version: input.expectedVersion, title: input.title,
      nodes: input.nodes, edges: input.edges, groups: input.groups,
    });
    if (!result.success) for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateGenerationGraphInput = z.infer<typeof createGenerationGraphSchema>;
export type UpdateGenerationGraphInput = z.infer<typeof updateGenerationGraphSchema>;
