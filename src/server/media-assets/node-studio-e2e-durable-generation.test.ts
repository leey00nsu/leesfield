import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mockVideoGenerationResult } from "./node-studio-e2e-media-fixtures";
import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";
import { audioGenerationDefaults } from "@/features/audio-generation/model/audio-generation-schema";
import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";
import { resolveImageGenerationResult } from "@/server/image-generation/image-generation";
import { resolveAudioGenerationResult } from "@/server/audio-generation/audio-generation";
import { resolveVideoGenerationResult } from "@/server/video-generation/video-generation";
import { NodeExecutionCancelledError } from "@/server/node-executions/node-execution-errors";
import { leemageMediaStorageAdapter } from "./leemage-media-storage";
import { processMediaOperationJobs } from "@/server/media-operations/media-operation-worker";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  upload: vi.fn(),
  getProject: vi.fn(),
  getOperation: vi.fn(),
  completeOperation: vi.fn(),
  failOperation: vi.fn(),
}));
vi.mock("leemage-sdk", () => ({
  LeemageClient: class {
    files = { upload: mocks.upload };
    projects = { get: mocks.getProject };
  },
}));
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: async () => [{ type: "image", key: imageGenerationDefaults.model, provider: "hf_space" }],
}));
vi.mock("@/server/image-generation/adapters/hf-space-adapter", () => ({ hfSpaceImageAdapter: { generate: mocks.generate } }));
vi.mock("@/server/image-generation/adapters/codex-cli-adapter", () => ({ codexCliImageAdapter: { generate: mocks.generate } }));
vi.mock("@/server/image-generation/adapters/codex-bridge-adapter", () => ({ codexBridgeImageAdapter: { generate: mocks.generate } }));
vi.mock("@/server/audio-generation/adapters/hf-space-adapter", () => ({ hfSpaceAudioAdapter: { generate: mocks.generate } }));
vi.mock("@/server/video-generation/adapters/hf-space-adapter", () => ({ hfSpaceVideoAdapter: { generate: mocks.generate } }));
vi.mock("@/server/media-assets/media-asset-repository", () => ({
  mediaAssetRepository: {
    listPendingServerOperationIds: async () => [{ id: "operation-test" }],
    claimPendingServerOperation: async () => ({ id: "operation-test", ownerEmail: "test@example.com", inputs: [{ assetId: "input-test" }] }),
    getOperation: mocks.getOperation,
    completeServerOperation: mocks.completeOperation,
    failOperation: mocks.failOperation,
  },
}));
vi.mock("@/server/media-assets/media-asset-service", () => ({
  mediaAssetService: { get: async () => ({ url: "https://storage.example/input", width: 16, height: 16 }) },
}));

const cases = [
  { kind: "image", run: (onUploading: () => Promise<void>) => resolveImageGenerationResult(imageGenerationDefaults, "request-image", { onUploading }) },
  { kind: "audio", run: (onUploading: () => Promise<void>) => resolveAudioGenerationResult(audioGenerationDefaults, "request-audio", { onUploading }) },
  { kind: "video", run: (onUploading: () => Promise<void>) => resolveVideoGenerationResult(videoGenerationDefaults, "request-video", { onUploading }) },
];

describe("E2E provider fixtures retain durable generation storage", () => {
  it("uses the exact independently playable checked-in video fixture", () => {
    const result = mockVideoGenerationResult();
    const dataUrl = result.videos[0];
    expect(Buffer.from(dataUrl.split(",")[1], "base64")).toEqual(readFileSync("public/sample-video.mp4"));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NODE_STUDIO_E2E_MOCK_GENERATION", "1");
    vi.stubEnv("NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL", "1");
    vi.stubEnv("LEEMAGE_API_KEY", "test-key");
    vi.stubEnv("LEEMAGE_PROJECT_ID", "project-test");
    for (const kind of ["IMAGE", "AUDIO", "VIDEO"]) vi.stubEnv(kind + "_STORAGE_PROVIDER", "leemage");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(cases)("$kind uploads fixture bytes and returns the storage identity after lifecycle transition", async ({ kind, run }) => {
    const events: string[] = [];
    mocks.upload.mockImplementation(async (_project, file) => {
      events.push("upload");
      expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(0);
      return { id: "stored-" + kind, url: "https://storage.example/" + kind, mimeType: file.type, size: file.size, variants: [] };
    });
    const result = await run(async () => { events.push("uploading"); });
    expect(result.status).toBe("completed");
    expect(result.artifacts?.[0]).toMatchObject({ storageObjectId: "stored-" + kind, storageUrl: "https://storage.example/" + kind });
    expect(events[0]).toBe("uploading");
    expect(events.slice(1)).toEqual(Array(mocks.upload.mock.calls.length).fill("upload"));
    expect(mocks.upload).toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each(cases)("$kind cancellation before upload cannot fabricate a successful artifact", async ({ run }) => {
    await expect(run(async () => { throw new NodeExecutionCancelledError(); })).rejects.toBeInstanceOf(NodeExecutionCancelledError);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("requires a stored object even when its legacy fallback is a fixture data URL", async () => {
    mocks.getProject.mockResolvedValue({ files: [] });
    await expect(leemageMediaStorageAdapter.resolveReadUrl("e2e-image-old-0", "data:image/png;base64,cG5n")).rejects.toThrow("MEDIA_STORAGE_UNAVAILABLE");
    expect(mocks.getProject).toHaveBeenCalledWith("project-test");
  });

  it("background removal uploads provider fixture bytes before completing the operation", async () => {
    mocks.getOperation.mockResolvedValue({ status: "processing" });
    mocks.upload.mockResolvedValue({ id: "stored-background", url: "https://storage.example/background", mimeType: "image/png", size: 100, variants: [] });
    await processMediaOperationJobs();
    expect(mocks.upload).toHaveBeenCalledWith("project-test", expect.objectContaining({ type: "image/png" }), {
      variants: [{ format: "png", sizeLabel: "source" }],
    });
    expect(mocks.completeOperation).toHaveBeenCalledWith("test@example.com", "operation-test", [
      expect.objectContaining({ storageObjectId: "stored-background", storageUrl: "https://storage.example/background" }),
    ], expect.any(Date));
    expect(mocks.failOperation).not.toHaveBeenCalled();
  });

  it("background removal cancelled during generation never uploads", async () => {
    mocks.getOperation.mockResolvedValue({ status: "cancelled" });
    await processMediaOperationJobs();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.completeOperation).not.toHaveBeenCalled();
  });
});
