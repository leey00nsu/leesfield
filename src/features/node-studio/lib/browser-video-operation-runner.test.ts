import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@node-banana-runtime/runtime-entry", () => ({
  processVideoOperation: mocks.process,
}));
vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  MediaAssetApiError: class MediaAssetApiError extends Error {},
  uploadMediaAsset: mocks.upload,
}));
vi.mock("../api/node-execution-api", () => ({
  updateNodeExecution: mocks.update,
  cancelNodeExecution: mocks.cancel,
}));

import { runBrowserVideoOperation } from "./browser-video-operation-runner";

const execution = {
  executionId: "operation-video-1",
  executionKind: "media_operation" as const,
  mediaType: "video" as const,
  graphNodeId: "node-video",
  status: "pending" as const,
  progress: 0,
  plan: {
    kind: "edit.video.stitch" as const,
    parameters: { repeat: 2, stripAudio: false },
    inputs: [
      {
        assetId: "clip-b", portId: "clips", sortOrder: 1, type: "video" as const,
        mimeType: "video/mp4", bytes: "1024", width: 16, height: 16, durationMs: 1_000,
        url: "https://read.example/b.mp4",
      },
      {
        assetId: "clip-a", portId: "clips", sortOrder: 0, type: "video" as const,
        mimeType: "video/mp4", bytes: "1024", width: 16, height: 16, durationMs: 1_000,
        url: "https://read.example/a.mp4",
      },
      {
        assetId: "soundtrack", portId: "soundtrack", sortOrder: 0, type: "audio" as const,
        mimeType: "audio/mpeg", bytes: "512", width: null, height: null, durationMs: 2_000,
        url: "https://read.example/audio.mp3",
      },
    ],
    outputPortId: "video",
    outputMediaType: "video" as const,
    expectedOutputCount: 1,
  },
};

describe("runBrowserVideoOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.cancel.mockResolvedValue({});
    mocks.upload.mockResolvedValue({ id: "video-output" });
  });

  it("passes typed ordered inputs to the vendored processor and publishes a durable video", async () => {
    mocks.process.mockResolvedValue({ outputs: [{
      blob: new Blob(["video"], { type: "video/mp4" }),
      fileName: "stitched.mp4",
      mimeType: "video/mp4",
      sortOrder: 0,
      width: 16,
      height: 16,
      durationMs: 4_000,
      hasAudio: true,
    }] });

    await expect(runBrowserVideoOperation({
      graphId: "graph-1",
      nodeId: "node-video",
      execution,
      signal: new AbortController().signal,
    })).resolves.toEqual([{ id: "video-output" }]);

    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({
      kind: "edit.video.stitch",
      parameters: { repeat: 2, stripAudio: false },
      inputs: expect.arrayContaining([
        expect.objectContaining({ assetId: "clip-a", portId: "clips", sortOrder: 0 }),
        expect.objectContaining({ assetId: "soundtrack", portId: "soundtrack", type: "audio" }),
      ]),
    }));
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stitched.mp4", type: "video/mp4" }),
      "video",
      { operationId: "operation-video-1", outputPortId: "video", sortOrder: 0 },
      expect.any(AbortSignal),
    );
  });

  it("marks processing failure without publishing a silent fallback", async () => {
    mocks.process.mockRejectedValue(new Error("VIDEO_OUTPUT_AUDIO_MISSING"));

    await expect(runBrowserVideoOperation({
      graphId: "graph-1",
      nodeId: "node-video",
      execution,
      signal: new AbortController().signal,
    })).rejects.toThrow("VIDEO_OUTPUT_AUDIO_MISSING");

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith(
      "graph-1",
      "node-video",
      "operation-video-1",
      { status: "failed", errorCode: "PROCESSOR_FAILED" },
    );
  });
});
