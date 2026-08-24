export type NodeGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type NodeGenerationImageDto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export type NodeGenerationDto = {
  requestId: string;
  status: NodeGenerationStatus;
  progress: number;
  errorMessage: string | null;
  createdAt: string;
  modelKey: string | null;
  images: NodeGenerationImageDto[];
};

export type ExecuteNodeGenerationResult = {
  requestId: string;
  status: NodeGenerationStatus;
  progress: number;
};
