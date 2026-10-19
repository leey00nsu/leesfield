import { z } from "zod";
import { externalPageQuerySchema } from "./spaces-contract";
import { mediaTypeSchema } from "@/shared/media-assets/media-asset-contract";

export const externalAssetsQuerySchema = externalPageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20), type: mediaTypeSchema.optional(),
});
export const externalAssetUploadSchema = z.object({
  intendedType: mediaTypeSchema, fileName: z.string().trim().min(1).max(255).refine(v => !/[\\/\0]/.test(v), "INVALID_FILE_NAME"),
  declaredMimeType: z.string().trim().toLowerCase().max(120), declaredBytes: z.number().int().positive(),
}).strict();
export const externalAssetSchema = z.object({
  id: z.string(), version: z.number(), name: z.string().optional(), displayName: z.string().nullable().optional(), originalFileName: z.string().nullable().optional(),
  type: mediaTypeSchema, status: z.literal("completed"), origin: z.enum(["upload", "generation", "media_operation", "legacy_generation"]),
  mimeType: z.string(), bytes: z.string().nullable(), width: z.number().nullable(), height: z.number().nullable(), durationMs: z.number().nullable(),
  url: z.string(), createdAt: z.string(), updatedAt: z.string(),
});
export const externalAssetsResponseSchema = z.object({ items: z.array(externalAssetSchema), nextCursor: z.string().nullable() });
export const externalAssetResponseSchema = z.object({ asset: externalAssetSchema });
export const externalUploadResponseSchema = z.object({ upload: z.object({
  id: z.string(), intendedType: mediaTypeSchema, status: z.string(), expiresAt: z.string(),
  upload: z.object({ method: z.literal("PUT"), url: z.string(), headers: z.object({ "Content-Type": z.string() }) }),
}) });
export const externalUploadConfirmSchema = z.object({}).strict();
export const externalUploadedResponseSchema = z.object({ uploaded: z.literal(true) });
