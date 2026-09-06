import { processImageOperation } from "@node-banana-runtime/runtime-entry";

import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

import type { StartNodeExecutionResult } from "../model/node-execution-types";
import { runBrowserMediaOperation } from "./browser-media-operation-runner";

export async function runBrowserImageOperation(input: {
  graphId: string;
  nodeId: string;
  execution: StartNodeExecutionResult;
  signal: AbortSignal;
}): Promise<MediaAssetDto[]> {
  return runBrowserMediaOperation({
    ...input,
    processor: async ({ plan, signal, onProgress }) => {
      if (!plan.kind.startsWith("edit.image.")) throw new Error("IMAGE_OPERATION_PLAN_INVALID");
      return processImageOperation({
        kind: plan.kind as Parameters<typeof processImageOperation>[0]["kind"],
        parameters: plan.parameters as never,
        inputUrls: [...plan.inputs]
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((item) => item.url),
        signal,
        onProgress,
      });
    },
  });
}

/**
 * Persists the exact flattened bitmap produced by Node Banana's AnnotationModal.
 *
 * Annotation is different from the other image operations: the upstream editor
 * already rendered the source image and every Konva shape when the user pressed
 * Done. Replaying those shapes through a second, Leesfield-owned canvas renderer
 * can produce a visibly different result (notably text metrics and transforms).
 * Keep the normal MediaOperation/upload/provenance lifecycle, but use that
 * upstream-produced bitmap as the processor output.
 */
export async function runPreparedAnnotationOperation(input: {
  graphId: string;
  nodeId: string;
  execution: StartNodeExecutionResult;
  signal: AbortSignal;
  dataUrl: string;
}): Promise<MediaAssetDto[]> {
  if (!input.dataUrl.startsWith("data:image/")) {
    throw new Error("ANNOTATION_OUTPUT_INVALID");
  }
  return runBrowserMediaOperation({
    ...input,
    processor: async ({ plan, signal, onProgress }) => {
      if (plan.kind !== "edit.image.annotation" || plan.expectedOutputCount !== 1) {
        throw new Error("ANNOTATION_OPERATION_PLAN_INVALID");
      }
      if (signal.aborted) throw new DOMException("Annotation operation cancelled", "AbortError");
      onProgress(25);
      const response = await fetch(input.dataUrl, { signal });
      const blob = await response.blob();
      if (signal.aborted) throw new DOMException("Annotation operation cancelled", "AbortError");
      if (!blob.type.startsWith("image/")) throw new Error("ANNOTATION_OUTPUT_INVALID");
      onProgress(90);
      return {
        outputs: [{
          blob,
          fileName: "node-banana-annotation.png",
          mimeType: blob.type || "image/png",
          sortOrder: 0,
        }],
      };
    },
  });
}
