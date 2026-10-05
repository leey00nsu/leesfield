import { z } from "zod";
import type { AssistantItem, AssistantOutputMode } from "@/shared/generation-graph/assistant-output";

export const executeNodeSchema = z
  .object({ expectedGraphVersion: z.number().int().positive(), repeatOfExecutionId: z.string().min(1).max(200).optional(), repeatIndex: z.number().int().min(1).max(99).optional() })
  .refine(value => Boolean(value.repeatOfExecutionId) === (value.repeatIndex !== undefined), { message: "REPEAT_REFERENCE_REQUIRED" })
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
  executionKind: "generation" | "media_operation" | "assistant";
  mediaType: NodeExecutionMediaType | "text";
  graphNodeId: string;
  status: NodeExecutionStatus;
  progress: number;
  errorCode: "GENERATION_FAILED" | "MODAL_TIMEOUT" | "MODAL_OUTPUT_MEDIA" | "PROCESSOR_FAILED" | "PROCESSOR_UNAVAILABLE" | "MEDIA_UPLOAD_FAILED" | string | null;
  modelKey: string | null;
  outputAssetIds: string[];
  outputBindings?: Array<{ portId: string; sortOrder: number; assetId: string | null }>;
  outputText?: string | null;
  outputMode?: AssistantOutputMode;
  outputItems?: AssistantItem[] | null;
  selectedItemId?: string | null;
  selectionVersion?: number;
  selectedOutputAssetId?: string | null;
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
