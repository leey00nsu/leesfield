import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

import type { StartNodeExecutionResult } from "../model/node-execution-types";
import { runBrowserMediaOperation } from "./browser-media-operation-runner";
import { processSpaceImageResize } from "./image-resize-processor";

export async function runBrowserImageOperation(input: {
  graphId: string;
  nodeId: string;
  execution: StartNodeExecutionResult;
  signal: AbortSignal;
}): Promise<MediaAssetDto[]> {
  return runBrowserMediaOperation({
    ...input,
    processor: async input => {
      if (input.plan.kind !== "edit.image.resize") throw new Error("IMAGE_OPERATION_PLAN_INVALID");
      return processSpaceImageResize(input);
    },
  });
}
