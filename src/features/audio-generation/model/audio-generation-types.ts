export type AudioGenerationStatus =
  | "pending"
  | "processing"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface AudioGenerationResult {
  audios: Array<{
    url: string;
    durationSec?: number;
  }>;
}

export interface AudioGenerationResponse {
  requestId: string;
  status: AudioGenerationStatus;
  progress: number;
  result?: AudioGenerationResult;
  errorMessage?: string;
}
