import {
  createAssetFolderSchema, updateAssetFolderSchema, createAssetTagSchema, updateAssetTagSchema,
  deleteAssetOrganizationSchema, updateAssetMetadataSchema, batchAssetMetadataSchema,
} from "@/shared/media-assets/asset-organization-contract";
import { MediaAssetInputError } from "./media-asset-errors";
import { assetOrganizationRepository } from "./asset-organization-repository";
import { mediaAssetService } from "./media-asset-service";

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new MediaAssetInputError(result.error.flatten());
  return result.data;
}
export const assetOrganizationService = {
  list: assetOrganizationRepository.listOrganization,
  createFolder(owner: string, body: unknown) { return assetOrganizationRepository.createFolder(owner, parse(createAssetFolderSchema, body)); },
  updateFolder(owner: string, id: string, body: unknown) { return assetOrganizationRepository.updateFolder(owner, id, parse(updateAssetFolderSchema, body)); },
  deleteFolder(owner: string, id: string, body: unknown) { return assetOrganizationRepository.deleteFolder(owner, id, parse(deleteAssetOrganizationSchema, body).expectedVersion); },
  createTag(owner: string, body: unknown) { return assetOrganizationRepository.createTag(owner, parse(createAssetTagSchema, body).name); },
  updateTag(owner: string, id: string, body: unknown) { const input = parse(updateAssetTagSchema, body); return assetOrganizationRepository.changeTag(owner, id, input.expectedVersion, input.name); },
  deleteTag(owner: string, id: string, body: unknown) { return assetOrganizationRepository.changeTag(owner, id, parse(deleteAssetOrganizationSchema, body).expectedVersion); },
  async patch(owner: string, id: string, body: unknown) {
    await assetOrganizationRepository.patchAsset(owner, id, parse(updateAssetMetadataSchema, body));
    return mediaAssetService.get(owner, id);
  },
  async batch(owner: string, body: unknown) {
    const input = parse(batchAssetMetadataSchema, body);
    await assetOrganizationRepository.patchBatch(owner, input);
    return { assetIds: input.assets.map(({ id }) => id) };
  },
};
