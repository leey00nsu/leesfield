import type { ImageVariants } from "@/shared/media-assets/image-variants";
export type GenerationHistoryType = "image" | "video" | "audio" | "all";
export type GenerationHistorySort = "date_desc" | "date_asc";
export type GenerationHistoryStatus =
  | "pending"
  | "processing"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface GenerationHistoryItem {
  imageVariants?: ImageVariants | null;
  id: string;
  type: "image" | "video" | "audio";
  origin?: "generation" | "edit";
  assetId?: string | null;
  graphId?: string | null;
  graphNodeId?: string | null;
  sourceAssetIds?: string[];
  operation?: {
    id: string;
    type: string;
    configVersion: number;
    parameters: unknown;
  } | null;
  status: GenerationHistoryStatus;
  prompt: string;
  model: string | null;
  createdAt: string;
  updatedAt?: string | null;
  durationMs?: number | null;
  progress?: number | null;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  inputImages?: string[];
  inputAudios?: string[];
  referenceText?: string | null;
  errorMessage: string | null;
}

export interface GenerationHistoryResponse {
  items: GenerationHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string | null;
}
