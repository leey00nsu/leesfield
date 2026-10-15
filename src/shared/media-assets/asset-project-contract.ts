import { z } from "zod";
import { assetNameSchema } from "./asset-organization-contract";
import { mediaAssetIdSchema } from "./media-asset-contract";
import type { ImageVariants } from "./image-variants";

const fields = {
  name: assetNameSchema,
  description: z.string().trim().max(2000),
  parentId: mediaAssetIdSchema.nullable(),
  coverAssetId: mediaAssetIdSchema.nullable(),
};
export const createAssetProjectSchema = z.object({
  ...fields,
  description: fields.description.default(""),
  parentId: fields.parentId.default(null),
  coverAssetId: fields.coverAssetId.default(null),
}).strict();
export const updateAssetProjectSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: fields.name.optional(),
  description: fields.description.optional(),
  parentId: fields.parentId.optional(),
  coverAssetId: fields.coverAssetId.optional(),
}).strict().refine((value) => Object.keys(fields).some((key) => key in value), "EMPTY_ASSET_UPDATE");
export type CreateAssetProjectInput = z.infer<typeof createAssetProjectSchema>;
export type UpdateAssetProjectInput = z.infer<typeof updateAssetProjectSchema>;
export type AssetProjectDto = {
  id: string; name: string; description: string; parentId: string | null;
  version: number; coverAssetId: string | null;
  cover: { id: string; url: string; imageVariants: ImageVariants | null } | null;
  createdAt: string; updatedAt: string;
};
