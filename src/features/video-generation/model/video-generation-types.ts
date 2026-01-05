export type VideoGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type VideoGenerationResult = {
  videos: Array<{
    url: string;
    width?: number;
    height?: number;
    durationSec?: number;
  }>;
};

export type VideoGenerationResponse = {
  requestId: string;
  status: VideoGenerationStatus;
  progress: number;
  result?: VideoGenerationResult;
  errorMessage?: string;
};
