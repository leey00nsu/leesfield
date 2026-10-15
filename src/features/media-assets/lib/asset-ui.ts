import type { AssetFolderDto } from "@/shared/media-assets/asset-organization-contract";
import { MediaAssetApiError } from "../api/media-asset-api";

export function folderPath(id: string, folders: readonly Pick<AssetFolderDto, "id" | "name" | "parentId">[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = folders.find(folder => folder.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id); names.unshift(current.name);
    current = folders.find(folder => folder.id === current?.parentId);
  }
  return names.join(" / ");
}
export function assetErrorKey(error: unknown): "idConflict" | "conflict" | "inUse" | "invalid" | "error" {
  if (!(error instanceof MediaAssetApiError)) return "error";
  if (error.code === "MEDIA_ASSET_IN_USE") return "inUse";
  if (error.code === "ASSET_ID_CONFLICT") return "idConflict";
  if (error.status === 409) return "conflict";
  return error.status === 400 ? "invalid" : "error";
}
