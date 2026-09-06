export function getMediaAssetContentUrl(assetId: string) {
  return `/api/media-assets/${encodeURIComponent(assetId)}/content`;
}
