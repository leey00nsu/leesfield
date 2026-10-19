import { z } from "zod";
import { canonicalEdgeSchema, canonicalGroupSchema, canonicalNodeSchema, graphDocumentV3Schema } from "@/shared/generation-graph/canonical-graph";

export const externalPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(2000).optional(),
  q: z.string().trim().max(200).default(""),
}).strict();
export const externalSpaceListQuerySchema = externalPageQuerySchema.extend({
  sort: z.enum(["updated-desc", "created-desc", "title-asc"]).default("updated-desc"),
});
export const externalSpaceCreateSchema = z.object({ title: z.string().trim().min(1).max(120) }).strict();
export const externalSpaceUpdateSchema = z.object({
  schemaVersion: z.literal(3), expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  nodes: z.array(canonicalNodeSchema).max(500), edges: z.array(canonicalEdgeSchema).max(2000),
  groups: z.array(canonicalGroupSchema).max(500), selectionChanges: z.array(z.string()).max(500).default([]),
}).strict();
export const externalExecuteNodeSchema = z.object({ expectedGraphVersion: z.number().int().positive() }).strict();
export const externalSpaceSummarySchema = z.object({
  id: z.string(), title: z.string(), version: z.number().int(), schemaVersion: z.number().int(),
  minimumWriterVersion: z.number().int(), createdAt: z.string(), updatedAt: z.string(),
});
export const externalSpaceSchema = graphDocumentV3Schema.extend({
  createdAt: z.string(), updatedAt: z.string(), writable: z.boolean(), readOnlyReason: z.string().nullable(),
  outputBindings: z.array(z.object({ graphNodeId: z.string(), portId: z.string(), sortOrder: z.number(), assetId: z.string() })).default([]),
});
export const externalSpacesResponseSchema = z.object({ items: z.array(externalSpaceSummarySchema), nextCursor: z.string().nullable() });
export const externalSpaceResponseSchema = z.object({ space: externalSpaceSchema });
export const externalSpaceModelsQuerySchema = z.object({
  type: z.enum(["image", "video", "audio", "llm"]).optional(),
  q: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z.string().max(2000).optional(),
}).strict();
export const spaceModelSummarySchema = z.object({
  id: z.string(), key: z.string(), label: z.string(), type: z.enum(["image", "video", "audio", "llm"]),
});
export const spaceModelsResponseSchema = z.object({ items: z.array(spaceModelSummarySchema), nextCursor: z.string().nullable() });
export const spaceModelInputResponseSchema = z.object({
  model: spaceModelSummarySchema,
  inputSchema: z.record(z.string(), z.unknown()),
  files: z.array(z.object({ name: z.string(), multiple: z.boolean(), maxBytes: z.number(), maxItems: z.number().optional(), portId: z.string().nullable() })),
  capabilities: z.object({ supportsImages: z.boolean().optional(), maxVideoDurationMs: z.number().optional() }),
});
export const nodeCapabilitySchema = z.object({
  kind: z.string(), configVersion: z.number(), configSchema: z.record(z.string(), z.unknown()),
  defaultConfig: z.record(z.string(), z.unknown()), ports: z.array(z.object({
    id: z.string(), direction: z.enum(["input", "output"]), valueType: z.string(), required: z.boolean(),
    edgeCardinality: z.enum(["one", "many"]), valueShape: z.enum(["single", "ordered-list"]),
    ordered: z.boolean(), minConnections: z.number(), maxConnections: z.number().nullable(),
    acceptedMimeTypes: z.array(z.string()).optional(), requiredCapabilities: z.array(z.string()).optional(), homogeneous: z.boolean().optional(),
  })),
  authorable: z.boolean(), apiExecutable: z.boolean(),
  reason: z.enum(["BROWSER_ONLY", "RETIRED", "NOT_EXECUTABLE", "PROCESSOR_UNAVAILABLE"]).nullable(),
});
export const spaceCapabilitiesResponseSchema = z.object({
  schemaVersion: z.literal(3), limits: z.object({ nodes: z.literal(500), edges: z.literal(2000), groups: z.literal(500) }),
  graphSchema: z.record(z.string(), z.unknown()), nodes: z.array(nodeCapabilitySchema),
});
