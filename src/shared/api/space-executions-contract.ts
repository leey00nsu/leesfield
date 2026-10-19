import { z } from "zod";
import { externalAssetSchema } from "./assets-contract";
import { assistantSelectionSchema } from "@/shared/generation-graph/assistant-output";

export { assistantSelectionSchema as externalAssistantSelectionSchema };
export const externalExecutionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(2000).optional(),
}).strict();
export const externalIdempotencyKeySchema = z.string().trim().min(1).max(128).regex(/^[\x21-\x7e]+$/);
export const externalNodeExecutionSchema = z.object({
  executionId: z.string(), executionKind: z.enum(["generation", "media_operation", "assistant"]),
  mediaType: z.enum(["image", "video", "audio", "text"]), graphNodeId: z.string(),
  status: z.enum(["pending", "processing", "uploading", "completed", "failed", "cancelled"]),
  progress: z.number(), errorCode: z.string().nullable(), modelKey: z.string().nullable(),
  outputAssetIds: z.array(z.string()),
  outputBindings: z.array(z.object({ portId: z.string(), sortOrder: z.number(), assetId: z.string().nullable() })).optional(),
  selectedOutputAssetId: z.string().nullable().optional(),
  outputText: z.string().nullable().optional(), outputMode: z.enum(["text", "list"]).optional(),
  outputItems: z.array(z.object({ id: z.string(), text: z.string() })).nullable().optional(),
  selectedItemId: z.string().nullable().optional(), selectionVersion: z.number().int().optional(),
  createdAt: z.string(), finishedAt: z.string().nullable().optional(),
});
export const externalExecutionResponseSchema = z.object({ execution: externalNodeExecutionSchema });
export const externalExecutionsResponseSchema = z.object({ items: z.array(externalNodeExecutionSchema), nextCursor: z.string().nullable() });
export const externalNodeOutputResponseSchema = z.object({ output: z.object({
  nodeId: z.string(), kind: z.enum(["output.single", "output.gallery", "inspect.imageCompare"]),
  mediaType: z.enum(["image", "video", "audio"]).nullable(),
  groups: z.array(z.object({ portId: z.string(), assets: z.array(externalAssetSchema) })),
}) });
