import type { ImageVariants } from "@/shared/media-assets/image-variants";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";

export type GeneratedMediaArtifact = {
  imageVariants?: ImageVariants | null;
  type: MediaType;
  storageProvider: "leemage";
  storageObjectId: string;
  storageUrl: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export type GenerationUploadLifecycle = {
  executionModel?: import("@/server/model-catalog/catalog-schema").ModelCatalogItem;
  onUploading?: () => Promise<void>;
};
