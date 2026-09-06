export type VideoGenerationStatus =
  | "pending"
  | "processing"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface VideoGenerationResult {
  videos: Array<{
    url: string;
    width?: number;
    height?: number;
    durationSec?: number;
  }>;
}

export interface VideoGenerationResponse {
  requestId: string;
  status: VideoGenerationStatus;
  progress: number;
  result?: VideoGenerationResult;
  errorMessage?: string;
}
