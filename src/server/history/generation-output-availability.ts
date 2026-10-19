type OutputAsset = {
  assetId?: string | null;
  url?: string | null;
  asset?: { status?: string; storageUrl?: string | null; legacyUrl?: string | null; durationMs?: number | null } | null;
};
export function generationOutputUrl(output: OutputAsset | null | undefined): string | null {
  if (!output) return null;
  if (!output.assetId) return output.url || null;
  if (!output.asset || output.asset.status !== "completed") return null;
  return output.asset.storageUrl ?? output.asset.legacyUrl ?? output.url ?? null;
}
export const generationOutputAssetSelect = {
  status: true, storageUrl: true, legacyUrl: true, imageVariants: true, durationMs: true,
} as const;

export function generationOutputDuration(output: OutputAsset & { durationSec?: number | null }): number | null {
  const ms = output.asset?.durationMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms / 1_000 : output.durationSec ?? null;
}
