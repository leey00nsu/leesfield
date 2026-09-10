import { z } from "zod";

export const executeNodeSchema = z
  .object({ expectedGraphVersion: z.number().int().positive() })
  .strict();

export const nodeExecutionStatusSchema = z.enum([
  "pending",
  "processing",
  "uploading",
  "completed",
  "failed",
  "cancelled",
]);

export type NodeExecutionStatus = z.infer<typeof nodeExecutionStatusSchema>;
export type NodeExecutionMediaType = "image" | "audio" | "video";

export type NodeExecutionDto = {
  executionId: string;
  executionKind: "generation" | "media_operation";
  mediaType: NodeExecutionMediaType;
  graphNodeId: string;
  status: NodeExecutionStatus;
  progress: number;
  errorCode: "GENERATION_FAILED" | "MODAL_TIMEOUT" | "MODAL_OUTPUT_MEDIA" | "PROCESSOR_FAILED" | "PROCESSOR_UNAVAILABLE" | "MEDIA_UPLOAD_FAILED" | null;
  modelKey: string | null;
  outputAssetIds: string[];
  createdAt: string;
};

export type BrowserMediaOperationPlan = {
  kind:
    | "edit.image.annotation"
    | "edit.image.resize"
    | "edit.image.splitGrid"
    | "edit.image.gif"
    | "edit.video.stitch"
    | "edit.video.trim"
    | "edit.video.frameGrab"
    | "edit.video.easeCurve";
  parameters: Record<string, unknown>;
  inputs: Array<{
    assetId: string;
    portId: string;
    sortOrder: number;
    type: NodeExecutionMediaType;
    mimeType: string;
    bytes: string | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    url: string;
  }>;
  outputPortId: string;
  outputMediaType: NodeExecutionMediaType;
  expectedOutputCount: number;
};

export type StartNodeExecutionResult = Pick<
  NodeExecutionDto,
  "executionId" | "executionKind" | "mediaType" | "graphNodeId" | "status" | "progress"
> & { plan?: BrowserMediaOperationPlan };

export type NodeExecutionInputSnapshot = {
  assetId: string;
  portId: string;
  sortOrder: number;
};
