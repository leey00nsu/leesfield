import { z } from "zod";
import { mediaAssetIdSchema, mediaTypeSchema } from "./media-asset-contract";

export const assetNameSchema = z.string().trim().transform((value) => value.normalize("NFC"))
  .pipe(z.string().min(1).max(255).refine((value) => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value), "INVALID_ASSET_NAME"));

export function normalizeAssetOrganizationName(value: string) {
  return assetNameSchema.parse(value).toLowerCase();
}
const versionSchema = z.number().int().positive();
export const assetClassificationSchema = z.enum(["character", "location", "prop"]);
export const assetManagementStatusSchema = z.enum(["draft", "active", "archived"]);
const assetDescriptionSchema = z.string().trim().max(2000).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value),
  "INVALID_ASSET_DESCRIPTION",
);
const tagIdsSchema = z.array(mediaAssetIdSchema).max(100).refine((ids) => new Set(ids).size === ids.length, "DUPLICATE_TAG_IDS");

export const createAssetFolderSchema = z.object({
  name: assetNameSchema,
  parentId: mediaAssetIdSchema.nullable().default(null),
}).strict();
export const updateAssetFolderSchema = z.object({
  expectedVersion: versionSchema,
  name: assetNameSchema.optional(),
  parentId: mediaAssetIdSchema.nullable().optional(),
}).strict().refine((value) => value.name !== undefined || value.parentId !== undefined, "EMPTY_ASSET_UPDATE");
export const deleteAssetOrganizationSchema = z.object({ expectedVersion: versionSchema }).strict();
export const createAssetTagSchema = z.object({ name: assetNameSchema }).strict();
export const updateAssetTagSchema = z.object({ name: assetNameSchema, expectedVersion: versionSchema }).strict();
export const updateAssetMetadataSchema = z.object({
  expectedVersion: versionSchema,
  referenceId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/).nullable().optional(),
  displayName: assetNameSchema.nullable().optional(),
  classification: assetClassificationSchema.nullable().optional(),
  displayVersion: assetNameSchema.pipe(z.string().max(64)).nullable().optional(),
  description: assetDescriptionSchema.nullable().optional(),
  managementStatus: assetManagementStatusSchema.nullable().optional(),
  starred: z.boolean().optional(),
  folderId: mediaAssetIdSchema.nullable().optional(),
  tagIds: tagIdsSchema.optional(),
  projectIds: z.array(mediaAssetIdSchema).max(100).refine((ids) => new Set(ids).size === ids.length, "DUPLICATE_PROJECT_IDS").optional(),
}).strict().refine((value) => ["referenceId", "displayName", "classification", "displayVersion", "description", "managementStatus", "starred", "folderId", "tagIds", "projectIds"].some((key) => key in value), "EMPTY_ASSET_UPDATE");
export const batchAssetMetadataSchema = z.object({
  assets: z.array(z.object({ id: mediaAssetIdSchema, expectedVersion: versionSchema }).strict()).min(1).max(100)
    .refine((assets) => new Set(assets.map((asset) => asset.id)).size === assets.length, "DUPLICATE_ASSET_IDS"),
  starred: z.boolean().optional(),
  folderId: mediaAssetIdSchema.nullable().optional(),
  addTagIds: tagIdsSchema.optional(),
  removeTagIds: tagIdsSchema.optional(),
}).strict().superRefine((value, context) => {
  if (!["starred", "folderId", "addTagIds", "removeTagIds"].some((key) => key in value)) {
    context.addIssue({ code: "custom", message: "EMPTY_ASSET_UPDATE" });
  }
  if (value.addTagIds?.some((id) => value.removeTagIds?.includes(id))) {
    context.addIssue({ code: "custom", message: "CONFLICTING_TAG_IDS", path: ["removeTagIds"] });
  }
});

export type AssetFolderDto = { id: string; name: string; parentId: string | null; version: number; createdAt: string; updatedAt: string };
export type AssetTagDto = { id: string; name: string; version: number };
export type AssetOrganizationDto = { folders: AssetFolderDto[]; tags: AssetTagDto[] };
export type AssetUsageDto = {
  assistantExecutionIds?: string[];
  projectCoverIds?: string[];
  graphIds: string[];
  operationIds: string[];
  generationRequestIds: string[];
  generations: Array<{ requestId: string; generationType: "image" | "video" | "audio" }>;
  provenance: Array<{ type: "image" | "video" | "audio" | "edit"; requestId: string; graphId?: string | null }>;
  inUse: boolean;
};
export type UpdateAssetMetadataInput = z.infer<typeof updateAssetMetadataSchema>;
export type BatchAssetMetadataInput = z.infer<typeof batchAssetMetadataSchema>;
export type CreateAssetFolderInput = z.infer<typeof createAssetFolderSchema>;
export type UpdateAssetFolderInput = z.infer<typeof updateAssetFolderSchema>;

export const historyVisibilitySchema = z.object({
  type: mediaTypeSchema,
  origin: z.enum(["generation", "edit"]).default("generation"),
  hidden: z.boolean(),
}).strict();
