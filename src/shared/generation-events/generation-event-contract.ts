import { z } from "zod";

export const GENERATION_EVENT_CHANNEL = "leesfield_node_execution_events_v2";
export const NODE_EXECUTION_EVENT_SCHEMA_VERSION = 2 as const;

export const nodeExecutionUpdatedEventSchema = z
  .object({
    version: z.literal(NODE_EXECUTION_EVENT_SCHEMA_VERSION),
    type: z.literal("node-execution.updated"),
    executionKind: z.enum(["generation", "media_operation"]),
    mediaType: z.enum(["image", "audio", "video"]),
    graphId: z.string().min(1),
    graphNodeId: z.string().min(1),
    executionId: z.string().min(1),
    status: z.enum(["pending", "processing", "uploading", "completed", "failed", "cancelled"]),
    progress: z.number().int().min(0).max(100),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type NodeExecutionUpdatedEvent = z.infer<
  typeof nodeExecutionUpdatedEventSchema
>;

export const generationEventSchema = nodeExecutionUpdatedEventSchema;

export type GenerationEvent = z.infer<typeof generationEventSchema>;

export function parseGenerationEvent(payload: string) {
  try {
    const parsed = generationEventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function generationEventId(event: GenerationEvent) {
  return `${event.executionId}:${event.updatedAt}`;
}
