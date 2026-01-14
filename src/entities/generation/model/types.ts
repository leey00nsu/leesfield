export type GenerationHistoryType = "image" | "video" | "all";
export type GenerationHistorySort = "date_desc" | "date_asc";
export type GenerationHistoryStatus = "pending" | "processing" | "completed" | "failed";

export interface GenerationHistoryItem {
  id: string;
  type: "image" | "video";
  status: GenerationHistoryStatus;
  prompt: string;
  model: string | null;
  createdAt: string;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
}

export interface GenerationHistoryResponse {
  items: GenerationHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}
