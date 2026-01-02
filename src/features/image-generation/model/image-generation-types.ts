export type ImageGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type ImageGenerationResult = {
  images: Array<{
    url: string;
    width?: number;
    height?: number;
  }>;
};

export type ImageGenerationResponse = {
  requestId: string;
  status: ImageGenerationStatus;
  progress: number;
  result?: ImageGenerationResult;
  errorMessage?: string;
};
