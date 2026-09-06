import {
  MediaAssetApiError,
  uploadMediaAsset,
} from "@/features/media-assets/api/media-asset-api";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetContentUrl } from "@/shared/media-assets/media-asset-content";

import {
  cancelNodeExecution,
  updateNodeExecution,
} from "../api/node-execution-api";
import type {
  BrowserMediaOperationPlan,
  StartNodeExecutionResult,
} from "../model/node-execution-types";

export type BrowserMediaOperationOutput = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sortOrder: number;
};

export type BrowserMediaOperationProcessor = (input: {
  plan: BrowserMediaOperationPlan;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
}) => Promise<{ outputs: BrowserMediaOperationOutput[] }>;

export const BROWSER_IMAGE_OPERATION_TIMEOUT_MS = 120_000;
const BROWSER_MEDIA_OPERATION_TIMEOUT_MS = 600_000;

function waitWithSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Media operation cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

export async function runBrowserMediaOperation(input: {
  graphId: string;
  nodeId: string;
  execution: StartNodeExecutionResult;
  signal: AbortSignal;
  processor: BrowserMediaOperationProcessor;
}): Promise<MediaAssetDto[]> {
  const plan = input.execution.plan;
  if (!plan) throw new Error("BROWSER_OPERATION_PLAN_MISSING");
  const browserPlan = {
    ...plan,
    inputs: plan.inputs.map((mediaInput) => ({
      ...mediaInput,
      url: getMediaAssetContentUrl(mediaInput.assetId),
    })),
  };
  let reportedProgress = 0;
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException("Media operation cancelled", "AbortError"));
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error("BROWSER_OPERATION_TIMEOUT")),
    plan.kind.startsWith("edit.image.") ? BROWSER_IMAGE_OPERATION_TIMEOUT_MS : BROWSER_MEDIA_OPERATION_TIMEOUT_MS);
  const signal = controller.signal;
  try {
    signal.throwIfAborted();
    await waitWithSignal(updateNodeExecution(input.graphId, input.nodeId, input.execution.executionId, {
      status: "processing",
      progress: 1,
    }), signal);
    signal.throwIfAborted();
    const processed = await waitWithSignal(input.processor({
      plan: browserPlan,
      signal,
      onProgress(progress) {
        if (signal.aborted) return;
        const next = Math.max(1, Math.min(89, Math.round(progress)));
        if (next - reportedProgress < 10) return;
        reportedProgress = next;
        void updateNodeExecution(input.graphId, input.nodeId, input.execution.executionId, {
          status: "processing",
          progress: next,
        }).catch(() => undefined);
      },
    }), signal);
    if (processed.outputs.length !== plan.expectedOutputCount) {
      throw new Error("PROCESSOR_OUTPUT_COUNT_INVALID");
    }
    const assets: MediaAssetDto[] = [];
    for (const output of [...processed.outputs].sort((left, right) => left.sortOrder - right.sortOrder)) {
      signal.throwIfAborted();
      const file = new File([output.blob], output.fileName, { type: output.mimeType });
      assets.push(await waitWithSignal(uploadMediaAsset(file, plan.outputMediaType, {
        operationId: input.execution.executionId,
        outputPortId: plan.outputPortId,
        sortOrder: output.sortOrder,
      }, signal), signal));
      signal.throwIfAborted();
    }
    return assets;
  } catch (error) {
    if (input.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      await waitWithSignal(cancelNodeExecution(
        input.graphId,
        input.nodeId,
        input.execution.executionId,
      ), AbortSignal.timeout(10_000)).catch(() => undefined);
      throw error;
    }
    await waitWithSignal(updateNodeExecution(input.graphId, input.nodeId, input.execution.executionId, {
      status: "failed",
      errorCode: error instanceof MediaAssetApiError ? "MEDIA_UPLOAD_FAILED" : "PROCESSOR_FAILED",
    }), AbortSignal.timeout(10_000)).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", abort);
    controller.abort();
  }
}
