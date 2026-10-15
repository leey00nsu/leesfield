type OutputAsset = {
  assetId?: string | null;
  url?: string | null;
  asset?: { status?: string; storageUrl?: string | null; legacyUrl?: string | null } | null;
};
export function generationOutputUrl(output: OutputAsset | null | undefined): string | null {
  if (!output) return null;
  if (!output.assetId) return output.url || null;
  if (!output.asset || output.asset.status !== "completed") return null;
  return output.asset.storageUrl ?? output.asset.legacyUrl ?? output.url ?? null;
}
export const generationOutputAssetSelect = {
  status: true, storageUrl: true, legacyUrl: true, imageVariants: true,
} as const;
