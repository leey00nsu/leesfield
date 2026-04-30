export type GenerationHistoryType = "image" | "video" | "audio" | "all";
export type GenerationHistorySort = "date_desc" | "date_asc";
export type GenerationHistoryStatus = "pending" | "processing" | "completed" | "failed";

export interface GenerationHistoryItem {
  id: string;
  type: "image" | "video" | "audio";
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
}
