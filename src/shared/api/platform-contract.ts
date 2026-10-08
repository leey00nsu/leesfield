import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const externalHistorySelectorSchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  origin: z.enum(["generation", "edit"]).default("generation"),
});
export type ExternalHistorySelector = z.infer<typeof externalHistorySelectorSchema>;

export const externalHistoryQuerySchema = z.object({
  type: z.enum(["image", "video", "audio", "all"]).optional(),
  query: z.string().optional(), model: z.string().optional(), prompt: z.string().optional(),
  sort: z.enum(["date_desc", "date_asc"]).optional(), limit: z.string().optional(), offset: z.string().optional(),
  includeTotal: z.string().optional(), cursor: z.string().optional(),
});
export const externalHistoryItemSchema = z.object({
  id: z.string(), type: z.enum(["image", "video", "audio"]), origin: z.enum(["generation", "edit"]).optional(),
  status: z.enum(["pending", "processing", "uploading", "completed", "failed", "cancelled"]),
  prompt: z.string(), model: z.string().nullable(), createdAt: z.string(), updatedAt: z.string().nullable().optional(),
  resultUrl: z.string().nullable(), thumbnailUrl: z.string().nullable(), errorMessage: z.string().nullable(),
  durationMs: z.number().nullable().optional(), progress: z.number().nullable().optional(),
  inputImages: z.array(z.string()).optional(), inputAudios: z.array(z.string()).optional(), referenceText: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(), graphId: z.string().nullable().optional(), graphNodeId: z.string().nullable().optional(),
  sourceAssetIds: z.array(z.string()).optional(), imageVariants: z.unknown().optional(),
  operation: z.object({ id: z.string(), type: z.string(), configVersion: z.number(), parameters: z.unknown() }).nullable().optional(),
});
export const externalHistoryResponseSchema = z.object({
  items: z.array(externalHistoryItemSchema), total: z.number().nullable(),
  limit: z.number(), offset: z.number(), nextCursor: z.string().nullable().optional(),
});
export const externalHistoryStatusSchema = z.object({
  hasActive: z.boolean(), activeCount: z.number(), latestUpdatedAt: z.string().nullable(),
});

export const externalHistoryDetailSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "video", "audio"]),
  origin: z.enum(["generation", "edit"]),
  status: z.string(),
  model: z.string().nullable(),
  prompt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  durationMs: z.number().nullable(),
  progress: z.number().nullable(),
  errorMessage: z.string().nullable(),
  warningMessage: z.string().nullable(),
  requestParameters: z.record(z.string(), z.unknown()).nullable().optional(),
  inputImages: z.array(z.string()),
  inputAudios: z.array(z.string()),
  inputVideos: z.array(z.string()).default([]),
  referenceText: z.string().nullable(),
  assets: z.array(z.object({
    url: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    durationSec: z.number().nullable(),
    imageVariants: z.unknown().optional(),
  })),
});
