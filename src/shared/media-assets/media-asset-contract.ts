import type { ImageVariants } from "@/shared/media-assets/image-variants";
import { z } from "zod";

export const mediaTypeSchema = z.enum(["image", "audio", "video"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const allowedMediaMimeTypes = {
  image: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"],
  audio: ["audio/wav", "audio/mpeg", "audio/ogg", "audio/flac", "audio/aac", "audio/mp4"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const satisfies Record<MediaType, readonly string[]>;

export const mediaAssetIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[\\/\0]/.test(value), "INVALID_FILE_NAME");

export const createMediaUploadSchema = z
  .object({
    intendedType: mediaTypeSchema,
    fileName: fileNameSchema,
    declaredMimeType: z.string().trim().toLowerCase().max(120),
    declaredBytes: z.number().int().positive(),
    operationId: mediaAssetIdSchema.optional(),
    outputPortId: mediaAssetIdSchema.optional(),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.operationId) !== Boolean(value.outputPortId)) {
      context.addIssue({
        code: "custom",
        message: "operationId and outputPortId must be provided together",
        path: [value.operationId ? "outputPortId" : "operationId"],
      });
    }
  });

export const confirmMediaUploadSchema = z.object({}).strict();

export type MediaAssetCategory = "uploads" | "generated" | "edited";

export const listMediaAssetsSchema = z
  .object({
    type: mediaTypeSchema.optional(),
    category: z.enum(["uploads", "generated", "edited"]).optional(),
    cursor: mediaAssetIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(24),
  })
  .strict();

const mediaOperationInputSchema = z
  .object({
    assetId: mediaAssetIdSchema,
    portId: mediaAssetIdSchema,
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

export const createMediaOperationSchema = z
  .object({
    graphId: mediaAssetIdSchema,
    graphNodeId: mediaAssetIdSchema,
    type: z.string().trim().min(1).max(128).refine(
      (kind) => kind !== "edit.audio.basic",
      "Audio Edit is no longer supported",
    ),
    configVersion: z.number().int().positive(),
    parameters: z.record(z.string(), z.json()),
    expectedOutputCount: z.number().int().min(1).max(100).default(1),
    inputs: z.array(mediaOperationInputSchema).min(1).max(100),
  })
  .strict();

export const updateMediaOperationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("processing"),
    progress: z.number().min(1).max(89),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    errorCode: z.enum(["PROCESSOR_FAILED", "PROCESSOR_UNAVAILABLE", "MEDIA_UPLOAD_FAILED"]),
  }).strict(),
]);

export type CreateMediaUploadInput = z.infer<typeof createMediaUploadSchema>;
export type CreateMediaOperationInput = z.infer<typeof createMediaOperationSchema>;
export type UpdateMediaOperationInput = z.infer<typeof updateMediaOperationSchema>;
export type ListMediaAssetsInput = z.infer<typeof listMediaAssetsSchema>;

export type MediaAssetDto = {
  imageVariants?: ImageVariants | null;
  id: string;
  version: number;
  type: MediaType;
  status: "completed" | "deleting" | "failed";
  origin: "upload" | "generation" | "media_operation" | "legacy_generation";
  mimeType: string;
  bytes: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sourceOperationId: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type MediaAssetListDto = {
  items: MediaAssetDto[];
  nextCursor: string | null;
};

export type ResolvedNodeAssetGroupDto = {
  portId: string;
  assets: MediaAssetDto[];
};

export type ResolvedNodeAssetsDto = {
  nodeId: string;
  kind: "output.single" | "output.gallery" | "inspect.imageCompare";
  mediaType: MediaType | null;
  groups: ResolvedNodeAssetGroupDto[];
};

export type MediaUploadSessionDto = {
  id: string;
  intendedType: MediaType;
  status: "pending" | "confirming" | "completed" | "expired" | "failed";
  upload: {
    method: "PUT";
    url: string;
    headers: { "Content-Type": string };
  };
  expiresAt: string;
};

export type MediaOperationDto = {
  id: string;
  graphId: string | null;
  graphNodeId: string | null;
  type: string;
  configVersion: number;
  parameters: unknown;
  status: "pending" | "processing" | "uploading" | "completed" | "failed" | "cancelled";
  progress: number;
  expectedOutputCount: number;
  errorCode: string | null;
  outputAssetIds: string[];
  inputs: Array<{
    assetId: string;
    portId: string;
    sortOrder: number;
  }>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export function isAllowedMediaMimeType(type: MediaType, mimeType: string) {
  return (allowedMediaMimeTypes[type] as readonly string[]).includes(mimeType.toLowerCase());
}
