/**
 * Remove Background Executor
 *
 * Removes image backgrounds client-side using @imgly/background-removal.
 */

import type { RemoveBackgroundNodeData } from "@/types";
import type { NodeExecutionContext } from "./types";
import { removeImageBackground } from "@/utils/backgroundRemoval";

export async function executeRemoveBackground(ctx: NodeExecutionContext): Promise<void> {
  const { node, getConnectedInputs, updateNodeData, signal } = ctx;
  const nodeData = node.data as RemoveBackgroundNodeData;

  updateNodeData(node.id, { status: "loading", error: null, progress: 0 });

  try {
    const inputs = getConnectedInputs(node.id);

    if (inputs.images.length === 0) {
      updateNodeData(node.id, {
        status: "error",
        error: "Connect an image input to remove the background",
      });
      throw new Error("Connect an image input to remove the background");
    }

    const sourceImage = inputs.images[0];

    const outputImage = await removeImageBackground(sourceImage, {
      model: nodeData.model,
      onProgress: (progress) => {
        if (signal?.aborted) return;
        updateNodeData(node.id, { progress });
      },
    });

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    updateNodeData(node.id, {
      outputImage,
      outputImageRef: undefined,
      status: "complete",
      error: null,
      progress: 100,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      updateNodeData(node.id, { status: "idle", error: null, progress: 0 });
      throw error;
    }

    const message = error instanceof Error ? error.message : "Background removal failed";
    updateNodeData(node.id, {
      status: "error",
      error: message,
      progress: 0,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
