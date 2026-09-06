import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@node-banana-runtime/runtime-entry", () => ({
  processImageOperation: mocks.process,
}));
vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  MediaAssetApiError: class MediaAssetApiError extends Error {},
  uploadMediaAsset: mocks.upload,
}));
vi.mock("../api/node-execution-api", () => ({
  updateNodeExecution: mocks.update,
  cancelNodeExecution: mocks.cancel,
}));

import {
  runBrowserImageOperation,
  runPreparedAnnotationOperation,
} from "./browser-image-operation-runner";

const execution = {
  executionId: "operation-1",
  executionKind: "media_operation" as const,
  mediaType: "image" as const,
  graphNodeId: "node-1",
  status: "pending" as const,
  progress: 0,
  plan: {
    kind: "edit.image.splitGrid" as const,
    parameters: { rows: 1, cols: 2, colOffsets: [], rowOffsets: [] },
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
    outputPortId: "images",
    outputMediaType: "image" as const,
    expectedOutputCount: 2,
  },
};

describe("runBrowserImageOperation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.cancel.mockResolvedValue({});
  });

  it("uploads processor outputs sequentially with stable provenance slots", async () => {
    mocks.process.mockResolvedValue({ outputs: [
      { blob: new Blob(["b"]), fileName: "2.png", mimeType: "image/png", sortOrder: 1, width: 1, height: 1 },
      { blob: new Blob(["a"]), fileName: "1.png", mimeType: "image/png", sortOrder: 0, width: 1, height: 1 },
    ] });
    mocks.upload
      .mockResolvedValueOnce({ id: "asset-1" })
      .mockResolvedValueOnce({ id: "asset-2" });

    await expect(runBrowserImageOperation({
      graphId: "graph-1",
      nodeId: "node-1",
      execution,
      signal: new AbortController().signal,
    })).resolves.toEqual([{ id: "asset-1" }, { id: "asset-2" }]);

    expect(mocks.upload.mock.calls.map((call) => call[2])).toEqual([
      { operationId: "operation-1", outputPortId: "images", sortOrder: 0 },
      { operationId: "operation-1", outputPortId: "images", sortOrder: 1 },
    ]);
    expect(mocks.upload.mock.calls.every((call) => call[3] instanceof AbortSignal)).toBe(true);
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({
      inputUrls: ["/api/media-assets/input-1/content"],
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

  it("persists the exact bitmap flattened by the upstream annotation editor", async () => {
    const flattened = new Blob(["flattened-by-node-banana"], { type: "image/png" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(flattened, { headers: { "content-type": "image/png" } }),
    );
    mocks.upload.mockResolvedValueOnce({ id: "annotation-asset" });

    await expect(runPreparedAnnotationOperation({
      graphId: "graph-1",
      nodeId: "node-1",
      execution: {
        ...execution,
        plan: {
          ...execution.plan,
          kind: "edit.image.annotation",
          outputPortId: "image",
          expectedOutputCount: 1,
        },
      },
      signal: new AbortController().signal,
      dataUrl: "data:image/png;base64,ZmFrZQ==",
    })).resolves.toEqual([{ id: "annotation-asset" }]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "data:image/png;base64,ZmFrZQ==",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ name: "node-banana-annotation.png", type: "image/png" }),
      "image",
      { operationId: "operation-1", outputPortId: "image", sortOrder: 0 },
      expect.any(AbortSignal),
    );
  });
});
