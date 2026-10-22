import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("./image-resize-processor", () => ({
  processSpaceImageResize: mocks.process,
}));
vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  MediaAssetApiError: class MediaAssetApiError extends Error {},
  uploadMediaAsset: mocks.upload,
}));
vi.mock("../api/node-execution-api", () => ({
  updateNodeExecution: mocks.update,
  cancelNodeExecution: mocks.cancel,
}));

import { runBrowserImageOperation } from "./browser-image-operation-runner";
import { BROWSER_IMAGE_OPERATION_TIMEOUT_MS, runBrowserMediaOperation } from "./browser-media-operation-runner";

const execution = {
  executionId: "operation-1",
  executionKind: "media_operation" as const,
  mediaType: "image" as const,
  graphNodeId: "node-1",
  status: "pending" as const,
  progress: 0,
  plan: {
    kind: "edit.image.resize" as const,
    parameters: { mode: "exact", width: 128, height: 128, fit: "contain", padColor: "transparent", format: "png", quality: 0.9 },
    inputs: [{
      assetId: "input-1",
      portId: "image",
      sortOrder: 0,
      type: "image" as const,
      mimeType: "image/png",
      bytes: "128",
      width: 1,
      height: 1,
      durationMs: null,
      url: "https://read.example/input.png",
    }],
    outputPortId: "image",
    outputMediaType: "image" as const,
    expectedOutputCount: 1,
  },
};

describe("runBrowserImageOperation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.cancel.mockResolvedValue({});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("uploads the native Resize Blob directly with its durable operation binding and owner content URL", async () => {
    const blob = new Blob(["native-resize"], { type: "image/webp" });
    mocks.process.mockImplementation(async ({ onProgress }) => {
      onProgress(45);
      return { outputs: [{ blob, fileName: "leesfield-resize.webp", mimeType: "image/webp", sortOrder: 0 }] };
    });
    mocks.upload.mockResolvedValue({ id: "resized-asset" });
    await expect(runBrowserImageOperation({ graphId: "graph-1", nodeId: "node-1", execution,
      signal: new AbortController().signal })).resolves.toEqual([{ id: "resized-asset" }]);
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      plan: { ...execution.plan, inputs: [{ ...execution.plan.inputs[0], url: "/api/media-assets/input-1/content" }] },
      signal: expect.any(AbortSignal), onProgress: expect.any(Function),
    }));
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "leesfield-resize.webp", type: "image/webp", size: blob.size }),
      "image", { operationId: "operation-1", outputPortId: "image", sortOrder: 0 }, expect.any(AbortSignal));
    const uploaded = mocks.upload.mock.calls[0][0] as File;
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
      reader.readAsText(uploaded);
    });
    expect(contents).toBe("native-resize");
    expect(mocks.update).toHaveBeenCalledWith("graph-1", "node-1", "operation-1", { status: "processing", progress: 45 });
  });

  it("keeps the shared lifecycle's sequential uploads and stable provenance slots", async () => {
    mocks.process.mockResolvedValue({ outputs: [
      { blob: new Blob(["b"]), fileName: "2.png", mimeType: "image/png", sortOrder: 1, width: 1, height: 1 },
      { blob: new Blob(["a"]), fileName: "1.png", mimeType: "image/png", sortOrder: 0, width: 1, height: 1 },
    ] });
    mocks.upload
      .mockResolvedValueOnce({ id: "asset-1" })
      .mockResolvedValueOnce({ id: "asset-2" });

    await expect(runBrowserMediaOperation({
      graphId: "graph-1",
      nodeId: "node-1",
      execution: { ...execution, plan: { ...execution.plan, expectedOutputCount: 2, outputPortId: "images" } },
      signal: new AbortController().signal,
      processor: mocks.process,
    })).resolves.toEqual([{ id: "asset-1" }, { id: "asset-2" }]);

    expect(mocks.upload.mock.calls.map((call) => call[2])).toEqual([
      { operationId: "operation-1", outputPortId: "images", sortOrder: 0 },
      { operationId: "operation-1", outputPortId: "images", sortOrder: 1 },
    ]);
    expect(mocks.upload.mock.calls.every((call) => call[3] instanceof AbortSignal)).toBe(true);
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ inputs: [expect.objectContaining({ url: "/api/media-assets/input-1/content" })] }),
    }));
  });

  it("cancels without uploading when the processor observes abort", async () => {
    const controller = new AbortController();
    mocks.process.mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
      controller.abort();
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      return { outputs: [] };
    });

    await expect(runBrowserImageOperation({
      graphId: "graph-1",
      nodeId: "node-1",
      execution,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.cancel).toHaveBeenCalledWith("graph-1", "node-1", "operation-1");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("cancels when abort wins while the last output is uploading", async () => {
    const controller = new AbortController();
    mocks.process.mockResolvedValue({ outputs: [
      { blob: new Blob(["a"]), fileName: "1.png", mimeType: "image/png", sortOrder: 0, width: 1, height: 1 },
    ] });
    mocks.upload.mockImplementation(async () => {
      controller.abort();
      return { id: "asset-1" };
    });

    await expect(runBrowserImageOperation({
      graphId: "graph-1",
      nodeId: "node-1",
      execution: {
        ...execution,
        plan: { ...execution.plan, expectedOutputCount: 1 },
      },
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.cancel).toHaveBeenCalledWith("graph-1", "node-1", "operation-1");
  });

  it("rejects inactive image kinds without invoking the native processor or uploading", async () => {
    await expect(runBrowserImageOperation({ graphId: "graph-1", nodeId: "node-1",
      execution: { ...execution, plan: { ...execution.plan, kind: "edit.image.splitGrid" } },
      signal: new AbortController().signal })).rejects.toThrow("IMAGE_OPERATION_PLAN_INVALID");
    expect(mocks.process).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith("graph-1", "node-1", "operation-1", { status: "failed", errorCode: "PROCESSOR_FAILED" });
  });

  it("marks Resize failures without changing or uploading an output", async () => {
    mocks.process.mockRejectedValue(new Error("IMAGE_RESIZE_DECODE_FAILED"));
    await expect(runBrowserImageOperation({ graphId: "graph-1", nodeId: "node-1", execution,
      signal: new AbortController().signal })).rejects.toThrow("IMAGE_RESIZE_DECODE_FAILED");
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith("graph-1", "node-1", "operation-1", { status: "failed", errorCode: "PROCESSOR_FAILED" });
  });

  it("aborts native processing at the existing 120 second limit and reports a failure", async () => {
    vi.useFakeTimers();
    let processorSignal: AbortSignal | undefined;
    mocks.process.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      processorSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const work = runBrowserImageOperation({ graphId: "graph-1", nodeId: "node-1", execution, signal: new AbortController().signal });
    const result = expect(work).rejects.toThrow("BROWSER_OPERATION_TIMEOUT");
    await vi.advanceTimersByTimeAsync(BROWSER_IMAGE_OPERATION_TIMEOUT_MS - 1);
    expect(processorSignal?.aborted).toBe(false); expect(mocks.upload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(processorSignal?.aborted).toBe(true); expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith("graph-1", "node-1", "operation-1", { status: "failed", errorCode: "PROCESSOR_FAILED" });
  });
});
