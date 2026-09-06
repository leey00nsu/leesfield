import { processVideoOperation } from "@node-banana-runtime/runtime-entry";

import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

import type { StartNodeExecutionResult } from "../model/node-execution-types";
import { runBrowserMediaOperation } from "./browser-media-operation-runner";

export async function runBrowserVideoOperation(input: {
  graphId: string;
  nodeId: string;
  execution: StartNodeExecutionResult;
  signal: AbortSignal;
}): Promise<MediaAssetDto[]> {
  return runBrowserMediaOperation({
    ...input,
    processor: async ({ plan, signal, onProgress }) => {
      if (!plan.kind.startsWith("edit.video.")) throw new Error("VIDEO_OPERATION_PLAN_INVALID");
      return processVideoOperation({
        kind: plan.kind as Parameters<typeof processVideoOperation>[0]["kind"],
        parameters: plan.parameters as never,
        inputs: plan.inputs.map(({ assetId, portId, sortOrder, type, mimeType, url }) => ({
          assetId,
          portId,
          sortOrder,
          type: type as "audio" | "video",
          mimeType,
          url,
        })),
        signal,
        onProgress,
      });
    },
  });
}
