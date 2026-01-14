export type ImageGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface ImageGenerationResult {
  images: Array<{
    url: string;
    width?: number;
    height?: number;
  }>;
}

export interface ImageGenerationResponse {
  requestId: string;
  status: ImageGenerationStatus;
  progress: number;
  result?: ImageGenerationResult;
  errorMessage?: string;
}
