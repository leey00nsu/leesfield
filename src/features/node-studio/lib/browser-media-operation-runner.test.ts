import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  cancel: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("../api/node-execution-api", () => ({
  cancelNodeExecution: api.cancel,
  updateNodeExecution: api.update,
}));

vi.mock("@/features/media-assets/api/media-asset-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/media-assets/api/media-asset-api")>()),
  uploadMediaAsset: api.upload,
}));

import type { StartNodeExecutionResult } from "../model/node-execution-types";
import { BROWSER_IMAGE_OPERATION_TIMEOUT_MS, runBrowserMediaOperation, type BrowserMediaOperationProcessor } from "./browser-media-operation-runner";

const execution: StartNodeExecutionResult = {
  executionId: "operation-1",
  executionKind: "media_operation",
  mediaType: "image",
  graphNodeId: "node-1",
  status: "pending",
  progress: 0,
  plan: {
    kind: "edit.image.annotation",
    parameters: { shapes: [] },
    inputs: [{
      assetId: "asset_source_1",
      portId: "image",
      sortOrder: 0,
      type: "image",
      mimeType: "image/png",
      bytes: "4",
      width: 1,
      height: 1,
      durationMs: null,
      url: "https://assets.example/source.png",
    }],
    outputPortId: "image",
    outputMediaType: "image",
    expectedOutputCount: 1,
  },
};

describe("runBrowserMediaOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.update.mockResolvedValue(undefined);
    api.cancel.mockResolvedValue(undefined);
    api.upload.mockResolvedValue({ id: "output-1" });
  });

  afterEach(() => vi.useRealTimers());

  it("fails a stalled image processor within the deadline and ignores late results", async () => {
    vi.useFakeTimers();
    let finish!: (result: { outputs: [] }) => void;
    const processor = vi.fn<BrowserMediaOperationProcessor>(() => new Promise<{ outputs: [] }>((resolve) => { finish = resolve; }));
    const running = runBrowserMediaOperation({ graphId: "graph-1", nodeId: "node-1", execution,
      signal: new AbortController().signal, processor });
    const rejected = expect(running).rejects.toThrow("BROWSER_OPERATION_TIMEOUT");
    await vi.advanceTimersByTimeAsync(BROWSER_IMAGE_OPERATION_TIMEOUT_MS);
    await rejected;
    expect(api.update).toHaveBeenLastCalledWith("graph-1", "node-1", "operation-1", {
      status: "failed", errorCode: "PROCESSOR_FAILED",
    });
    expect(processor.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
    finish({ outputs: [] });
    await Promise.resolve();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("cancels promptly even when the processor ignores its signal", async () => {
    const controller = new AbortController();
    const processor = vi.fn(() => new Promise<never>(() => undefined));
    const running = runBrowserMediaOperation({ graphId: "graph-1", nodeId: "node-1", execution,
      signal: controller.signal, processor });
    const rejected = expect(running).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(processor).toHaveBeenCalled());
    controller.abort();
    await rejected;
    expect(api.cancel).toHaveBeenCalledWith("graph-1", "node-1", "operation-1");
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("settles a stalled processing status request without starting the processor", async () => {
    vi.useFakeTimers();
    api.update.mockImplementationOnce(() => new Promise(() => undefined));
    const processor = vi.fn();
    const running = runBrowserMediaOperation({ graphId: "graph-1", nodeId: "node-1", execution,
      signal: new AbortController().signal, processor });
    const rejected = expect(running).rejects.toThrow("BROWSER_OPERATION_TIMEOUT");
    await vi.advanceTimersByTimeAsync(BROWSER_IMAGE_OPERATION_TIMEOUT_MS);
    await rejected;
    expect(processor).not.toHaveBeenCalled();
    expect(api.update).toHaveBeenLastCalledWith("graph-1", "node-1", "operation-1", {
      status: "failed", errorCode: "PROCESSOR_FAILED",
    });
  });

  it("gives browser processors authenticated same-origin input URLs", async () => {
    const processor = vi.fn().mockResolvedValue({
      outputs: [{
        blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
        fileName: "annotation.png",
        mimeType: "image/png",
        sortOrder: 0,
      }],
    });

    await runBrowserMediaOperation({
      graphId: "graph-1",
      nodeId: "node-1",
      execution,
      signal: new AbortController().signal,
      processor,
    });

    expect(processor).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        inputs: [expect.objectContaining({
          assetId: "asset_source_1",
          url: "/api/media-assets/asset_source_1/content",
        })],
      }),
    }));
  });
});
