import { z } from "zod";

export const GENERATION_EVENT_CHANNEL = "leesfield_generation_events_v1";
export const GENERATION_EVENT_SCHEMA_VERSION = 1 as const;

export const generationUpdatedEventSchema = z
  .object({
    version: z.literal(GENERATION_EVENT_SCHEMA_VERSION),
    type: z.literal("generation.updated"),
    graphId: z.string().min(1),
    graphNodeId: z.string().min(1),
    requestId: z.string().min(1),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    progress: z.number().int().min(0).max(100),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type GenerationUpdatedEvent = z.infer<
  typeof generationUpdatedEventSchema
>;

export function parseGenerationEvent(payload: string) {
  try {
    const parsed = generationUpdatedEventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function generationEventId(event: GenerationUpdatedEvent) {
  return `${event.requestId}:${event.updatedAt}`;
}
