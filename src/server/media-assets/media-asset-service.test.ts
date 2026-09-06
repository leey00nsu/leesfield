import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MediaAssetInUseError,
  MediaOperationConflictError,
  MediaQuotaExceededError,
  MediaVerificationError,
} from "./media-asset-errors";
import type {
  MediaAssetRecord,
  MediaAssetRepository,
  MediaOperationRecord,
  MediaUploadSessionRecord,
} from "./media-asset-repository";
import { createMediaAssetService, MEDIA_CONFIRM_STEP_TIMEOUT_MS } from "./media-asset-service";
import type { MediaStorageAdapter } from "./media-storage";

const now = new Date("2026-09-03T10:00:00.000Z");

const asset: MediaAssetRecord = {
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
    completedAt: null,
    graphNode: { id: "node_1", graphId: "graph_1", kind: "edit.video.trim", configVersion: 1 },
    inputs: [],
    outputs: [],
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
  const repository = repositoryMocks as unknown as MediaAssetRepository;
  const storage = storageMocks as unknown as MediaStorageAdapter;
  const service = createMediaAssetService(repository, storage, () => now);

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
    storageMocks.delete.mockResolvedValue(undefined);
    repositoryMocks.expireUploads.mockResolvedValue([]);
    repositoryMocks.listNodeOperations.mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

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
    expect(storageMocks.delete).toHaveBeenCalledWith("expired-file");
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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
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
    ).resolves.toMatchObject({ id: "asset_1", url: "https://read.example/file_1" });
    expect(storageMocks.confirm).not.toHaveBeenCalled();
  });

  it("lists an owner-scoped cursor page with fresh read URLs", async () => {
    repositoryMocks.listAssets.mockResolvedValue([
      asset,
      { ...asset, id: "asset_2", storageObjectId: "file_2" },
      { ...asset, id: "asset_3", storageObjectId: "file_3" },
    ]);
    storageMocks.resolveReadUrl
      .mockResolvedValueOnce("https://read.example/file_1")
      .mockResolvedValueOnce("https://read.example/file_2");

    await expect(service.list("owner@example.com", { type: "image", limit: 2 }))
      .resolves.toMatchObject({
        items: [
          { id: "asset_1", url: "https://read.example/file_1" },
          { id: "asset_2", url: "https://read.example/file_2" },
        ],
        nextCursor: "asset_2",
      });
    expect(repositoryMocks.listAssets).toHaveBeenCalledWith("owner@example.com", {
      type: "image",
      limit: 2,
    });
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
    expect(storageMocks.delete).toHaveBeenCalledWith("file_1");
  });

  it("blocks physical deletion while any owned Graph references the asset", async () => {
    repositoryMocks.getAssetUsage.mockResolvedValue({ graphIds: ["graph_1"], operationIds: [] });
    await expect(service.remove("owner@example.com", "asset_1")).rejects.toEqual(
      new MediaAssetInUseError(["graph_1"]),
    );
    expect(repositoryMocks.markAssetDeleting).not.toHaveBeenCalled();
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });

  it("keeps provenance source assets while a historical operation references them", async () => {
    repositoryMocks.getAssetUsage.mockResolvedValue({ graphIds: [], operationIds: ["op_1"] });
    await expect(service.remove("owner@example.com", "asset_1")).rejects.toEqual(
      new MediaAssetInUseError([], ["op_1"]),
    );
    expect(repositoryMocks.markAssetDeleting).not.toHaveBeenCalled();
    expect(storageMocks.delete).not.toHaveBeenCalled();
  });
});
