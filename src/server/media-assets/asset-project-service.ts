import { createAssetProjectSchema, updateAssetProjectSchema } from "@/shared/media-assets/asset-project-contract";
import { deleteAssetOrganizationSchema } from "@/shared/media-assets/asset-organization-contract";
import { MediaAssetInputError } from "./media-asset-errors";
import { assetProjectRepository } from "./asset-project-repository";
function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new MediaAssetInputError(result.error.flatten());
  return result.data;
}
export const assetProjectService = {
  list: assetProjectRepository.list,
  create(owner: string, body: unknown) { return assetProjectRepository.create(owner, parse(createAssetProjectSchema, body)); },
  update(owner: string, id: string, body: unknown) { return assetProjectRepository.update(owner, id, parse(updateAssetProjectSchema, body)); },
  delete(owner: string, id: string, body: unknown) { return assetProjectRepository.delete(owner, id, parse(deleteAssetOrganizationSchema, body).expectedVersion); },
};
