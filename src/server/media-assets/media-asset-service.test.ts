import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MediaAssetInUseError,
  MediaOperationConflictError,
  MediaQuotaExceededError,
  MediaVerificationError,
  MediaAssetNotFoundError,
} from "./media-asset-errors";
import type {
  MediaAssetRecord,
  MediaAssetRepository,
  MediaOperationRecord,
  MediaUploadSessionRecord,
} from "./media-asset-repository";
import { createMediaAssetService, MEDIA_CONFIRM_STEP_TIMEOUT_MS } from "./media-asset-service";
import type { MediaStorageAdapter } from "./media-storage";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { externalAssetSchema } from "@/shared/api/assets-contract";
import { modelCatalogSchema } from "@/server/model-catalog/catalog-schema";

vi.mock("@/server/model-catalog/catalog-service", () => ({ getModelCatalog: vi.fn() }));

const now = new Date("2026-09-03T10:00:00.000Z");

const asset: MediaAssetRecord = {
  classification: null,
  referenceId: null,
  displayVersion: null,
  description: null,
  managementStatus: null,
  displayName: null,
  originalFileName: null,
  folderId: null,
  starred: false,
  tagAssignments: [],
  projectMemberships: [],
  imageVariants: null,
  id: "asset_1",
  version: 1,
  ownerEmail: "owner@example.com",
  type: "image",
  status: "completed",
  origin: "upload",
  storageProvider: "leemage",
  storageObjectId: "file_1",
  storageUrl: "https://storage.example/file_1",
  legacyUrl: null,
  mimeType: "image/png",
  bytes: BigInt(33),
  width: 640,
  height: 360,
  durationMs: null,
  sourceOperationId: null,
  createdAt: now,
  updatedAt: now,
};

const session: MediaUploadSessionRecord = {
  id: "upload_1",
  ownerEmail: "owner@example.com",
  intendedType: "image",
  fileName: "image.png",
  storageFileName: null,
  declaredMimeType: "image/png",
  declaredBytes: BigInt(33),
  storageProvider: "leemage",
  storageObjectId: "file_1",
  storageObjectName: "project/file_1.png",
  storageUrl: "https://storage.example/file_1",
  operationId: null,
  outputPortId: null,
  sortOrder: 0,
  status: "pending",
  expiresAt: new Date("2026-09-03T10:15:00.000Z"),
  assetId: null,
  errorCode: null,
  createdAt: now,
  updatedAt: now,
  asset: null,
  operation: null,
};

function operation(overrides: Partial<MediaOperationRecord> = {}): MediaOperationRecord {
  return {
    id: "op_1",
    ownerEmail: "owner@example.com",
    graphId: "graph_1",
    graphNodeId: "node_1",
    type: "edit.video.trim",
    configVersion: 1,
    parameters: {},
    status: "pending",
    progress: 0,
    expectedOutputCount: 1,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    graphNode: { id: "node_1", graphId: "graph_1", kind: "edit.video.trim", configVersion: 1 },
    inputs: [],
    outputs: [],
    outputBindings: [],
    ...overrides,
  };
}

describe("mediaAssetService", () => {
  const repositoryMocks = {
    getOwnerReservedBytes: vi.fn(),
    getOperation: vi.fn(),
    createOperation: vi.fn(),
    createUploadSession: vi.fn(),
    getPendingUpload: vi.fn(),
    claimUpload: vi.fn(),
    failUpload: vi.fn(),
    completeUpload: vi.fn(),
    getAsset: vi.fn(),
    listAssets: vi.fn(),
    listAudioGenerationInputs: vi.fn(),
    getAssetUsage: vi.fn(),
    markAssetDeleting: vi.fn(),
    restoreAsset: vi.fn(),
    deleteAsset: vi.fn(),
    expireUploads: vi.fn(),
    listNodeOperations: vi.fn(),
  };
  const storageMocks = {
    name: "leemage" as const,
    assertAvailable: vi.fn(),
    presign: vi.fn(),
    confirm: vi.fn(),
    inspect: vi.fn(),
    resolveReadUrl: vi.fn(),
    delete: vi.fn(),
  };
  const cleanupMocks = {
    register: vi.fn().mockResolvedValue({ id: "cleanup_1" }),
    queue: vi.fn().mockResolvedValue({ id: "cleanup_1" }),
  };
  const repository = repositoryMocks as unknown as MediaAssetRepository;
  const storage = storageMocks as unknown as MediaStorageAdapter;
  const service = createMediaAssetService(repository, storage, () => now, cleanupMocks);

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.getOwnerReservedBytes.mockResolvedValue(BigInt(0));
    repositoryMocks.createUploadSession.mockResolvedValue(session);
    storageMocks.presign.mockResolvedValue({
      objectId: "file_1",
      objectName: "project/file_1.png",
      objectUrl: "https://storage.example/file_1",
      presignedUrl: "https://account.r2.cloudflarestorage.com/project/file_1.png?X-Amz-Signature=signed",
      expiresAt: session.expiresAt,
    });
    storageMocks.resolveReadUrl.mockResolvedValue("https://read.example/file_1");
    storageMocks.delete.mockReset();
    storageMocks.delete.mockResolvedValue(undefined);
    repositoryMocks.expireUploads.mockResolvedValue([]);
    repositoryMocks.listNodeOperations.mockResolvedValue([]);
    repositoryMocks.listAudioGenerationInputs.mockReset();
    repositoryMocks.listAudioGenerationInputs.mockResolvedValue([]);
    vi.mocked(getModelCatalog).mockResolvedValue([]);
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it.each([
    ["image", "image/png", "png"], ["video", "video/mp4", "mp4"], ["audio", "audio/mpeg", "mp3"],
  ] as const)("allows exactly 50 MiB and rejects one extra byte for %s", async (intendedType, declaredMimeType, ext) => {
    const input = { intendedType, declaredMimeType, fileName: "reference." + ext, declaredBytes: 52_428_800 };
    await expect(service.createUpload("owner@example.com", input)).resolves.toMatchObject({ id: "upload_1" });
    await expect(service.createUpload("owner@example.com", { ...input, declaredBytes: 52_428_801 }))
      .rejects.toMatchObject({ maxBytes: 52_428_800 });
  });

  it("uses the operator's video limit before presigning", async () => {
    vi.stubEnv("MEDIA_ASSET_MAX_VIDEO_BYTES", "1048576");
    await expect(service.createUpload("owner@example.com", {
      intendedType: "video", declaredMimeType: "video/mp4", fileName: "clip.mp4", declaredBytes: 1_048_577,
    })).rejects.toMatchObject({ maxBytes: 1_048_576 });
    expect(storageMocks.presign).not.toHaveBeenCalled();
  });

  it.each([[401, "authentication"], [403, "permission"], [400, "validation"], [429, "rate_limit"], [503, "upstream"]])(
    "retains only safe presign diagnostics for status %s", async (status, reason) => {
      storageMocks.presign.mockRejectedValueOnce(Object.assign(new Error("secret signed URL and credential"), { status }));
      const error = await service.createUpload("owner@example.com", {
        intendedType: "image", fileName: "image.png", declaredMimeType: "image/png", declaredBytes: 33,
      }).catch((error: unknown) => error);
      expect(error).toMatchObject({
        message: "MEDIA_STORAGE_UNAVAILABLE", diagnostic: { stage: "presign", reason, upstreamStatus: status },
      });
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(repositoryMocks.createUploadSession).not.toHaveBeenCalled();
    },
  );

  it("bounds a stalled presign response without creating a late local session", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    storageMocks.presign.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const running = service.createUpload("owner@example.com", {
      intendedType: "image", fileName: "image.png", declaredMimeType: "image/png", declaredBytes: 33,
    });
    const rejected = expect(running).rejects.toMatchObject({ diagnostic: { stage: "presign", reason: "timeout" } });
    await vi.advanceTimersByTimeAsync(MEDIA_CONFIRM_STEP_TIMEOUT_MS);
    await rejected;
    finish({ objectId: "late" });
    await Promise.resolve();
    expect(repositoryMocks.createUploadSession).not.toHaveBeenCalled();
  });

  it.each(["confirm", "inspect"] as const)("fails a stalled %s and bounds cleanup without accepting late results", async (step) => {
    vi.useFakeTimers();
    repositoryMocks.claimUpload.mockResolvedValue({ kind: "claimed", session: { ...session, status: "confirming" } });
    storageMocks.confirm.mockResolvedValue({ objectId: "file_1", mimeType: "image/png", bytes: 33, url: "https://storage.example/file_1" });
    let finish!: (value: unknown) => void;
    storageMocks[step].mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    storageMocks.delete.mockImplementationOnce(() => new Promise(() => undefined));
    const running = service.confirmUpload("owner@example.com", "upload_1", {});
    const rejected = expect(running).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(MEDIA_CONFIRM_STEP_TIMEOUT_MS * 2);
    await rejected;
    expect(repositoryMocks.failUpload).toHaveBeenCalledWith("owner@example.com", "upload_1", expect.any(String));
    finish({ objectId: "file_1", mimeType: "image/png", bytes: 33, url: "https://storage.example/file_1" });
    await Promise.resolve();
    expect(repositoryMocks.completeUpload).not.toHaveBeenCalled();
  });

  it("reconciles expired confirmations on the owned node's execution polling path", async () => {
    repositoryMocks.expireUploads.mockResolvedValue([{ storageProvider: "leemage", storageObjectId: "expired-file" }]);
    await service.listNodeOperations("owner@example.com", "graph_1", "node_1");
    expect(repositoryMocks.expireUploads).toHaveBeenCalledWith(now, 100, {
      ownerEmail: "owner@example.com", graphId: "graph_1", graphNodeId: "node_1",
    });
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });

  it("creates a direct upload session without exposing the storage object id", async () => {
    await expect(
      service.createUpload("owner@example.com", {
        intendedType: "image",
        fileName: "image.png",
        declaredMimeType: "image/png",
        declaredBytes: 33,
      }),
    ).resolves.toEqual({
      id: "upload_1",
      intendedType: "image",
      status: "pending",
      upload: {
        method: "PUT",
        url: "/api/media-assets/uploads/upload_1/content?target=https%3A%2F%2Faccount.r2.cloudflarestorage.com%2Fproject%2Ffile_1.png%3FX-Amz-Signature%3Dsigned",
        headers: { "Content-Type": "image/png" },
      },
      expiresAt: "2026-09-03T10:15:00.000Z",
    });
  });

  it("relays an owner-scoped pending upload through the server", async () => {
    repositoryMocks.getPendingUpload.mockResolvedValue(session);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.body instanceof ReadableStream) {
        await new Response(init.body).arrayBuffer();
      }
      return new Response(null, { status: 200 });
    });
    const bytes = new Uint8Array(33);
    const request = new Request("http://localhost/content", { method: "PUT", body: bytes });

    await expect(service.relayUpload(
      "owner@example.com",
      "upload_1",
      "https://account.r2.cloudflarestorage.com/project/file_1.png?X-Amz-Signature=signed",
      request.body,
      "image/png",
      "33",
    )).resolves.toBeUndefined();

    expect(repositoryMocks.getPendingUpload).toHaveBeenCalledWith("owner@example.com", "upload_1", now);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "account.r2.cloudflarestorage.com" }),
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "image/png", "Content-Length": "33" },
      }),
    );
    fetchMock.mockRestore();
  });

  it("rejects a relay target that is not the session object", async () => {
    repositoryMocks.getPendingUpload.mockResolvedValue(session);
    await expect(service.relayUpload(
      "owner@example.com",
      "upload_1",
      "https://example.com/project/file_1.png?X-Amz-Signature=signed",
      new Request("http://localhost/content", { method: "PUT", body: new Uint8Array(33) }).body,
      "image/png",
      "33",
    )).rejects.toMatchObject({ message: "INVALID_REQUEST" });
  });

  it("rejects a quota overflow before allocating storage", async () => {
    repositoryMocks.getOwnerReservedBytes.mockResolvedValue(BigInt(5 * 1024 * 1024 * 1024));
    await expect(
      service.createUpload("owner@example.com", {
        intendedType: "image",
        fileName: "image.png",
        declaredMimeType: "image/png",
        declaredBytes: 33,
      }),
    ).rejects.toBeInstanceOf(MediaQuotaExceededError);
    expect(storageMocks.presign).not.toHaveBeenCalled();
  });

  it("rejects an operation output whose port media type does not match", async () => {
    repositoryMocks.getOperation.mockResolvedValue(operation());
    await expect(
      service.createUpload("owner@example.com", {
        intendedType: "image",
        fileName: "image.png",
        declaredMimeType: "image/png",
        declaredBytes: 33,
        operationId: "op_1",
        outputPortId: "video",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(MediaOperationConflictError);
    expect(storageMocks.presign).not.toHaveBeenCalled();
  });

  it("confirms storage, verifies metadata, and commits the asset", async () => {
    repositoryMocks.claimUpload.mockResolvedValue({
      kind: "claimed",
      session: { ...session, status: "confirming" },
    });
    storageMocks.confirm.mockResolvedValue({
      objectId: "file_1",
      mimeType: "image/png",
      bytes: 33,
      url: "https://storage.example/file_1",
    });
    storageMocks.inspect.mockResolvedValue({
      detectedMimeType: "image/png",
      width: 640,
      height: 360,
      durationMs: null,
    });
    repositoryMocks.completeUpload.mockResolvedValue(asset);

    await expect(
      service.confirmUpload("owner@example.com", "upload_1", {}),
    ).resolves.toMatchObject({
      id: "asset_1",
      bytes: "33",
      url: "https://storage.example/file_1",
    });
    expect(repositoryMocks.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: "owner@example.com", uploadId: "upload_1" }),
    );
    expect(repositoryMocks.failUpload).not.toHaveBeenCalled();
  });

  it.each([null, "leesfield-persisted.png"])("confirms a persisted %s storage name while preserving the source name", async (storageFileName) => {
    const original = { ...session, fileName: "스크린샷.png", storageFileName };
    repositoryMocks.claimUpload.mockResolvedValue({ kind: "claimed", session: original });
    storageMocks.confirm.mockResolvedValue({ objectId: "file_1", mimeType: "image/png", bytes: 33, url: "https://storage.example/file_1" });
    storageMocks.inspect.mockResolvedValue({ detectedMimeType: "image/png", width: 640, height: 360, durationMs: null });
    repositoryMocks.completeUpload.mockResolvedValue(asset);
    await service.confirmUpload("owner@example.com", "upload_1", {});
    expect(storageMocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      fileName: storageFileName ?? "스크린샷.png",
    }));
    expect(original.fileName).toBe("스크린샷.png");
  });

  it("returns an already completed confirm without calling storage again", async () => {
    repositoryMocks.claimUpload.mockResolvedValue({
      kind: "completed",
      session: { ...session, status: "completed", assetId: asset.id, asset },
      asset,
    });
    await expect(
      service.confirmUpload("owner@example.com", "upload_1", {}),
    ).resolves.toMatchObject({ id: "asset_1", url: "https://storage.example/file_1" });
    expect(storageMocks.confirm).not.toHaveBeenCalled();
  });

  it("reads stored URLs without storage access and resolves only missing legacy data", async () => {
    repositoryMocks.getAsset.mockResolvedValueOnce(asset);
    await expect(service.get("owner@example.com", "asset_1")).resolves.toMatchObject({ url: asset.storageUrl });
    expect(repositoryMocks.getAsset).toHaveBeenCalledWith("owner@example.com", "asset_1");
    expect(storageMocks.resolveReadUrl).not.toHaveBeenCalled();
    repositoryMocks.getAsset.mockResolvedValueOnce({ ...asset, storageUrl: null });
    await expect(service.get("owner@example.com", "asset_1")).resolves.toMatchObject({ url: "https://read.example/file_1" });
    expect(storageMocks.resolveReadUrl).toHaveBeenCalledOnce();
  });

  it("rejects an inaccessible asset before returning its permanent URL", async () => {
    repositoryMocks.getAsset.mockRejectedValueOnce(new Error("not found"));
    await expect(service.get("another-owner", "asset_1")).rejects.toThrow("not found");
    expect(repositoryMocks.getAsset).toHaveBeenCalledWith("another-owner", "asset_1");
    expect(storageMocks.resolveReadUrl).not.toHaveBeenCalled();
  });

  it("lists an owner-scoped cursor page using stored permanent URLs", async () => {
    repositoryMocks.listAssets.mockResolvedValue([
      asset,
      { ...asset, id: "asset_2", storageObjectId: "file_2", storageUrl: "https://storage.example/file_2" },
      { ...asset, id: "asset_3", storageObjectId: "file_3" },
    ]);
    storageMocks.resolveReadUrl
      .mockResolvedValueOnce("https://read.example/file_1")
      .mockResolvedValueOnce("https://read.example/file_2");

    await expect(service.list("owner@example.com", { type: "image", limit: 2 }))
      .resolves.toMatchObject({
        items: [
          { id: "asset_1", url: "https://storage.example/file_1" },
          { id: "asset_2", url: "https://storage.example/file_2" },
        ],
        nextCursor: "asset_2",
      });
    expect(storageMocks.resolveReadUrl).not.toHaveBeenCalled();
    expect(repositoryMocks.listAssets).toHaveBeenCalledWith("owner@example.com", {
      type: "image",
      limit: 2,
    });
  });

  it("loads generated audio authoring once per page and returns the same original text in detail", async () => {
    const first = { ...asset, id: "audio_1", type: "audio" as const, origin: "generation" as const };
    const second = { ...first, id: "audio_2", origin: "legacy_generation" as const };
    const script = "[Speaker 1] Original nativeDrama script.\n[Speaker 2] 그대로 읽어 주세요.";
    const sources = [
      { assetId: first.id, generation: { ownerEmail: asset.ownerEmail, prompt: "Processed provider instructions", requestParams: {
        inputPrompt: script, dynamicParams: { Script: script }, promptFields: ["Script"],
      } } },
      { assetId: second.id, generation: { ownerEmail: asset.ownerEmail, prompt: "expanded final", requestParams: {
        inputPrompt: "", graphNodeId: "audio-node", promptProvenance: { connectedPrompt: "connected narration" },
      } } },
    ];
    repositoryMocks.listAssets.mockResolvedValue([first, second, { ...first, id: "lookahead" }]);
    repositoryMocks.listAudioGenerationInputs.mockResolvedValue(sources);
    const page = await service.list(asset.ownerEmail, { type: "audio", limit: 2 });
    expect(page.items.map(item => item.inputPrompt)).toEqual([script, "connected narration"]);
    expect(externalAssetSchema.parse(page.items[0])).not.toHaveProperty("inputPrompt");
    expect(page.items.every(item => item.name !== item.inputPrompt)).toBe(true);
    expect(page.nextCursor).toBe(second.id);
    expect(repositoryMocks.listAudioGenerationInputs).toHaveBeenCalledExactlyOnceWith(asset.ownerEmail, [first.id, second.id]);
    repositoryMocks.getAsset.mockResolvedValue(first);
    expect(await service.get(asset.ownerEmail, first.id)).toEqual(page.items[0]);
  });

  it("uses the frozen native Script alias when a promptless audio workflow has a processed generic prompt", async () => {
    const script = "한국어 대본을 그대로 보존합니다.\nOriginal spoken text.";
    const generated = { ...asset, type: "audio" as const, origin: "generation" as const };
    repositoryMocks.getAsset.mockResolvedValue(generated);
    repositoryMocks.listAudioGenerationInputs.mockResolvedValue([{ assetId: asset.id, generation: {
      ownerEmail: asset.ownerEmail, prompt: "Processed full instructions", requestParams: {
        inputPrompt: "", promptFields: [], dynamicParams: { Script: script, voice: "speaker" }, executionModel: {
          providerConfig: { gradio_contract: { version: 1, apiName: "/speak", inputs: [
            { name: "Script", label: "Script", kind: "string", schema: { type: "string" }, required: true, nullable: false },
            { name: "voice", label: "Voice", kind: "string", schema: { type: "string" }, choices: ["speaker"], required: false, nullable: false },
          ], output: { media: "audio", path: [0], multiple: false }, diagnostics: [], reviewed: true } },
        },
      },
    } }]);
    expect(await service.get(asset.ownerEmail, asset.id)).toMatchObject({ inputPrompt: script });
    expect(getModelCatalog).not.toHaveBeenCalled();
  });

  it("resolves native Drama Script from the shared model contract once for a legacy page", async () => {
    const model = modelCatalogSchema.parse([{
      id: "native-drama", key: "native-drama", label: "Native drama", vendor: "unit", type: "audio", provider: "hf_space",
      providerConfig: { space_id: "unit/native", api_name: "/speak", gradio_contract: {
        version: 1, apiName: "/speak", inputs: [
          { name: "script", label: "Drama Script", kind: "string", schema: { type: "string" }, required: true, nullable: false },
        ], output: { media: "audio", path: [0], multiple: false }, diagnostics: [], reviewed: true,
      } }, parameters: {}, meta: {}, isActive: false, isDefault: false, createdAt: now, updatedAt: now,
    }])[0];
    vi.mocked(getModelCatalog).mockResolvedValue([model]);
    const records = ["native-a", "native-b"].map(id => ({ ...asset, id, type: "audio" as const, origin: "generation" as const }));
    repositoryMocks.listAssets.mockResolvedValue(records);
    repositoryMocks.listAudioGenerationInputs.mockResolvedValue(records.map(record => ({ assetId: record.id, generation: {
      ownerEmail: asset.ownerEmail, modelKey: model.key, prompt: "Processed instructions", requestParams: {
        inputPrompt: "", promptFields: [], graphNodeId: "drama", dynamicParams: { script: "Original " + record.id },
      },
    } })));
    const page = await service.list(asset.ownerEmail, { type: "audio" });
    expect(page.items.map(item => item.inputPrompt)).toEqual(["Original native-a", "Original native-b"]);
    expect(getModelCatalog).toHaveBeenCalledExactlyOnceWith({ includeInactive: true });
    expect(repositoryMocks.listAudioGenerationInputs).toHaveBeenCalledOnce();
  });

  it("does not disclose a foreign parent generation or query uploaded/edited audio and non-audio sources", async () => {
    const records = [
      { ...asset, id: "foreign", type: "audio" as const, origin: "generation" as const },
      { ...asset, id: "unknown", type: "audio" as const, origin: "legacy_generation" as const },
      { ...asset, id: "uploaded", type: "audio" as const },
      { ...asset, id: "edited", type: "audio" as const, origin: "media_operation" as const },
      { ...asset, id: "image", origin: "generation" as const },
    ];
    repositoryMocks.listAssets.mockResolvedValue(records);
    repositoryMocks.listAudioGenerationInputs.mockResolvedValue([{ assetId: "foreign", generation: {
      ownerEmail: "another@example.com", prompt: "foreign private prompt", requestParams: { inputPrompt: "foreign private script" },
    } }]);
    const page = await service.list(asset.ownerEmail, { limit: 5 });
    expect(repositoryMocks.listAudioGenerationInputs).toHaveBeenCalledExactlyOnceWith(asset.ownerEmail, ["foreign", "unknown"]);
    expect(page.items.slice(0, 2).map(item => item.inputPrompt)).toEqual([null, null]);
    for (const item of page.items.slice(2)) expect(item).not.toHaveProperty("inputPrompt");
    expect(JSON.stringify(page)).not.toContain("private");
    repositoryMocks.listAudioGenerationInputs.mockClear();
    for (const record of records.slice(2)) {
      repositoryMocks.getAsset.mockResolvedValueOnce(record);
      expect(await service.get(asset.ownerEmail, record.id)).not.toHaveProperty("inputPrompt");
    }
    expect(repositoryMocks.listAudioGenerationInputs).not.toHaveBeenCalled();
  });

  it.each(["", null])("keeps explicit empty and unknown preset authoring distinct from the full prompt (%s)", async inputPrompt => {
    repositoryMocks.getAsset.mockResolvedValue({ ...asset, type: "audio", origin: "generation" });
    repositoryMocks.listAudioGenerationInputs.mockResolvedValue([{ assetId: asset.id, generation: {
      ownerEmail: asset.ownerEmail, prompt: "Preset and provider instructions", requestParams: {
        ...(inputPrompt !== null ? { inputPrompt } : {}), promptPreset: { key: "unknown-preset", revision: 1 },
      },
    } }]);
    expect(await service.get(asset.ownerEmail, asset.id)).toMatchObject({ inputPrompt });
  });

  it("does not label ambiguous native settings or an unknown alias as the original spoken text", async () => {
    const generated = { ...asset, type: "audio" as const, origin: "generation" as const };
    repositoryMocks.getAsset.mockResolvedValue(generated);
    for (const executionModel of [undefined, { providerConfig: { gradio_contract: {
      version: 1, apiName: "/speak", inputs: ["text", "instructions"].map(name => ({
        name, label: name, kind: "string", schema: { type: "string" }, required: true, nullable: false,
      })), output: { media: "audio", path: [0], multiple: false }, diagnostics: [], reviewed: true,
    } } }]) {
      repositoryMocks.listAudioGenerationInputs.mockResolvedValue([{ assetId: asset.id, generation: {
        ownerEmail: asset.ownerEmail, prompt: "Full processed prompt", requestParams: {
          graphNodeId: "native", promptFields: [], dynamicParams: { text: "Spoken input", instructions: "Style instruction" }, executionModel,
        },
      } }]);
      expect(await service.get(asset.ownerEmail, asset.id)).toMatchObject({ inputPrompt: null });
    }
  });

  it("fails the session and removes a mismatched storage object", async () => {
    repositoryMocks.claimUpload.mockResolvedValue({
      kind: "claimed",
      session: { ...session, status: "confirming" },
    });
    storageMocks.confirm.mockResolvedValue({
      objectId: "file_1",
      mimeType: "image/png",
      bytes: 34,
      url: "https://storage.example/file_1",
    });

    await expect(
      service.confirmUpload("owner@example.com", "upload_1", {}),
    ).rejects.toBeInstanceOf(MediaVerificationError);
    expect(repositoryMocks.failUpload).toHaveBeenCalledWith(
      "owner@example.com",
      "upload_1",
      "MEDIA_SIZE_MISMATCH",
    );
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });

  it("blocks physical deletion while any owned Graph references the asset", async () => {
    repositoryMocks.getAssetUsage.mockResolvedValue({ graphIds: ["graph_1"], operationIds: [], generationRequestIds: [] });
    await expect(service.remove("owner@example.com", "asset_1")).rejects.toEqual(
      new MediaAssetInUseError(["graph_1"]),
    );
    expect(repositoryMocks.markAssetDeleting).not.toHaveBeenCalled();
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });

  it("keeps provenance source assets while a historical operation references them", async () => {
    repositoryMocks.getAssetUsage.mockResolvedValue({ graphIds: [], operationIds: ["op_1"], generationRequestIds: [] });
    await expect(service.remove("owner@example.com", "asset_1")).rejects.toEqual(
      new MediaAssetInUseError([], ["op_1"]),
    );
    expect(repositoryMocks.markAssetDeleting).not.toHaveBeenCalled();
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });

  it("blocks physical deletion while a generation request references the asset", async () => {
    repositoryMocks.getAssetUsage.mockResolvedValue({
      graphIds: [],
      operationIds: [],
      generationRequestIds: ["generation-request-1"],
    });
    await expect(service.remove("owner@example.com", "asset_1")).rejects.toEqual(
      new MediaAssetInUseError([], [], ["generation-request-1"]),
    );
    expect(repositoryMocks.markAssetDeleting).not.toHaveBeenCalled();
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });

  it("treats a cleanup worker winning the same deletion race as success", async () => {
    repositoryMocks.getAssetUsage.mockResolvedValue({ graphIds: [], operationIds: [], generationRequestIds: [] });
    repositoryMocks.markAssetDeleting.mockResolvedValue(asset);
    repositoryMocks.deleteAsset.mockRejectedValue(new MediaAssetNotFoundError());

    await expect(service.remove("owner@example.com", "asset_1")).resolves.toBeUndefined();
    expect(storageMocks.delete).toHaveBeenCalledWith("file_1");
  });
});
