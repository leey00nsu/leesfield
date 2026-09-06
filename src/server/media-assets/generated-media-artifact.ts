import type { MediaType } from "@/shared/media-assets/media-asset-contract";

export type GeneratedMediaArtifact = {
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
  onUploading?: () => Promise<void>;
};
