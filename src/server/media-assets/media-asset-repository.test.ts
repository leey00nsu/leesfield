import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    mediaUploadSession: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mediaAsset: { create: vi.fn(), aggregate: vi.fn() },
    mediaOperation: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    generationGraphNodeOutput: { deleteMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    generationGraphNode: { updateMany: vi.fn() },
  };
  const prisma = { $transaction: vi.fn(), mediaAsset: { findFirst: vi.fn(), findMany: vi.fn() } };
  return { tx, prisma };
});

vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import {
  MediaUploadExpiredError,
  MediaUploadNotFoundError,
} from "./media-asset-errors";
import { mediaAssetRepository } from "./media-asset-repository";

const now = new Date("2026-09-03T10:00:00.000Z");

describe("asset source pagination", () => {
  it.each([
    ["uploads", { origin: "upload" }],
    ["generated", { origin: { in: ["generation", "legacy_generation"] } }],
    ["edited", { origin: "media_operation" }],
  ] as const)("applies %s to both cursor ownership and page query", async (category, origin) => {
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue({ id: "cursor" });
    mocks.prisma.mediaAsset.findMany.mockResolvedValue([]);
    await mediaAssetRepository.listAssets("owner@example.com", { type: "image", category, cursor: "cursor", limit: 24 });
    expect(mocks.prisma.mediaAsset.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerEmail: "owner@example.com", type: "image", ...origin }) }));
    expect(mocks.prisma.mediaAsset.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerEmail: "owner@example.com", type: "image", ...origin }), take: 25 }));
  });
  it("rejects a cursor outside the selected source", async () => {
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null);
    await expect(mediaAssetRepository.listAssets("owner@example.com", { category: "edited", cursor: "upload-cursor", limit: 24 })).rejects.toThrow();
  });
});
const baseSession = {
  id: "upload_1",
  ownerEmail: "owner@example.com",
  intendedType: "image" as const,
  fileName: "image.png",
  declaredMimeType: "image/png",
  declaredBytes: BigInt(33),
  storageProvider: "leemage",
  storageObjectId: "file_1",
  storageObjectName: "project/file_1.png",
  storageUrl: "https://storage.example/file_1",
  operationId: null,
  outputPortId: null,
  sortOrder: 0,
  status: "pending" as const,
  expiresAt: new Date("2026-09-03T10:15:00.000Z"),
  assetId: null,
  errorCode: null,
  createdAt: now,
  updatedAt: now,
  asset: null,
  operation: null,
};
const asset = {
  id: "asset_1",
  version: 1,
  ownerEmail: "owner@example.com",
  type: "image" as const,
  status: "completed" as const,
  origin: "media_operation" as const,
  storageProvider: "leemage",
  storageObjectId: "file_1",
  storageUrl: "https://storage.example/file_1",
  legacyUrl: null,
  mimeType: "image/png",
  bytes: BigInt(33),
  width: 640,
  height: 360,
  durationMs: null,
  sourceOperationId: "op_1",
  createdAt: now,
  updatedAt: now,
};

describe("mediaAssetRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.mediaUploadSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.mediaUploadSession.update.mockResolvedValue({});
    mocks.tx.mediaAsset.create.mockResolvedValue(asset);
    mocks.tx.mediaOperation.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.mediaOperation.update.mockResolvedValue({});
    mocks.tx.generationGraphNodeOutput.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.generationGraphNodeOutput.create.mockResolvedValue({});
    mocks.tx.generationGraphNodeOutput.createMany.mockResolvedValue({ count: 1 });
  });

  it("persists the remote name separately from the untouched local filename", async () => {
    mocks.tx.mediaAsset.aggregate.mockResolvedValue({ _sum: { bytes: null } });
    mocks.tx.mediaUploadSession.aggregate.mockResolvedValue({ _sum: { declaredBytes: null } });
    mocks.tx.mediaUploadSession.create.mockResolvedValue(baseSession);
    await mediaAssetRepository.createUploadSession("owner@example.com", {
      fileName: "스크린샷.png", intendedType: "image", declaredMimeType: "image/png", declaredBytes: 33, sortOrder: 0,
    }, {
      fileName: "leesfield-persisted.png", objectId: "file_1", objectName: "project/file_1.png",
      objectUrl: "https://storage.example/file_1", presignedUrl: "https://upload.example/file_1", expiresAt: now,
    }, BigInt(1000));
    expect(mocks.tx.mediaUploadSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fileName: "스크린샷.png", storageFileName: "leesfield-persisted.png" }),
    }));
  });

  it("does not reveal an upload session owned by another account", async () => {
    mocks.tx.mediaUploadSession.findFirst.mockResolvedValue(null);
    await expect(
      mediaAssetRepository.claimUpload("owner@example.com", "foreign_upload", now),
    ).rejects.toBeInstanceOf(MediaUploadNotFoundError);
    expect(mocks.tx.mediaUploadSession.updateMany).not.toHaveBeenCalled();
  });

  it.each(["pending", "confirming"])("persists %s expiry before returning the terminal expiry error", async (status) => {
    mocks.tx.mediaUploadSession.findFirst.mockResolvedValue({
      ...baseSession,
      status,
      expiresAt: new Date("2026-09-03T09:59:00.000Z"),
    });
    await expect(
      mediaAssetRepository.claimUpload("owner@example.com", "upload_1", now),
    ).rejects.toBeInstanceOf(MediaUploadExpiredError);
    expect(mocks.tx.mediaUploadSession.updateMany).toHaveBeenCalledWith({
      where: { id: "upload_1", status: { in: ["pending", "confirming"] }, expiresAt: { lte: now } },
      data: { status: "expired", errorCode: "MEDIA_UPLOAD_EXPIRED" },
    });
  });

  it("does not fail an operation or delete storage when completion wins the expiry race", async () => {
    mocks.tx.mediaUploadSession.findMany.mockResolvedValue([{ id: "upload_1", operationId: "op_1", ownerEmail: "owner@example.com", storageProvider: "leemage", storageObjectId: "file_1" }]);
    mocks.tx.mediaUploadSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(mediaAssetRepository.expireUploads(now, 100, {
      ownerEmail: "owner@example.com", graphId: "graph_1", graphNodeId: "node_1",
    })).resolves.toEqual([]);
    expect(mocks.tx.mediaUploadSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      status: { in: ["pending", "confirming"] }, expiresAt: { lte: now }, ownerEmail: "owner@example.com",
      operation: { graphId: "graph_1", graphNodeId: "node_1" },
    } }));
    expect(mocks.tx.mediaOperation.updateMany).not.toHaveBeenCalled();
  });

  it.each(["expired", "lost-claim"])("blocks late confirmation before creating an asset: %s", async (reason) => {
    mocks.tx.mediaUploadSession.findFirst.mockResolvedValue({
      ...baseSession, status: "confirming", expiresAt: reason === "expired" ? now : baseSession.expiresAt,
    });
    if (reason === "lost-claim") mocks.tx.mediaUploadSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(mediaAssetRepository.completeUpload({
      ownerEmail: "owner@example.com", uploadId: "upload_1", now,
      confirmed: { objectId: "file_1", mimeType: "image/png", bytes: 33, url: asset.storageUrl },
      inspected: { detectedMimeType: "image/png", width: 640, height: 360, durationMs: null },
    })).rejects.toThrow();
    expect(mocks.tx.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("returns an idempotent completed result without reclaiming storage", async () => {
    mocks.tx.mediaUploadSession.findFirst.mockResolvedValue({
      ...baseSession,
      status: "completed",
      assetId: asset.id,
      asset,
    });
    await expect(
      mediaAssetRepository.claimUpload("owner@example.com", "upload_1", now),
    ).resolves.toMatchObject({ kind: "completed", asset: { id: "asset_1" } });
    expect(mocks.tx.mediaUploadSession.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the previous NodeOutput until every operation output is durable", async () => {
    mocks.tx.mediaUploadSession.findFirst.mockResolvedValue({
      ...baseSession,
      status: "confirming",
      operationId: "op_1",
      outputPortId: "images",
      operation: {
        id: "op_1",
        ownerEmail: "owner@example.com",
        graphNodeId: "node_1",
        status: "uploading",
        expectedOutputCount: 2,
        type: "edit.image.splitGrid",
        configVersion: 1,
      },
    });
    mocks.tx.mediaUploadSession.findMany.mockResolvedValue([
      { assetId: "asset_1", outputPortId: "images", sortOrder: 0 },
    ]);

    await mediaAssetRepository.completeUpload({
      ownerEmail: "owner@example.com",
      uploadId: "upload_1",
      confirmed: { objectId: "file_1", mimeType: "image/png", bytes: 33, url: asset.storageUrl },
      inspected: { detectedMimeType: "image/png", width: 640, height: 360, durationMs: null },
      now,
    });

    expect(mocks.tx.generationGraphNodeOutput.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.generationGraphNodeOutput.create).not.toHaveBeenCalled();
    expect(mocks.tx.mediaOperation.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "completed" }),
    }));
  });

  it("atomically replaces the output projection when the final asset commits", async () => {
    mocks.tx.mediaUploadSession.findFirst.mockResolvedValue({
      ...baseSession,
      status: "confirming",
      operationId: "op_1",
      outputPortId: "images",
      operation: {
        id: "op_1",
        ownerEmail: "owner@example.com",
        graphNodeId: "node_1",
        status: "uploading",
        expectedOutputCount: 2,
        type: "edit.image.splitGrid",
        configVersion: 1,
      },
    });
    mocks.tx.mediaUploadSession.findMany.mockResolvedValue([
      { assetId: "asset_1", outputPortId: "images", sortOrder: 0 },
      { assetId: "asset_2", outputPortId: "images", sortOrder: 1 },
    ]);

    await mediaAssetRepository.completeUpload({
      ownerEmail: "owner@example.com",
      uploadId: "upload_1",
      confirmed: { objectId: "file_1", mimeType: "image/png", bytes: 33, url: asset.storageUrl },
      inspected: { detectedMimeType: "image/png", width: 640, height: 360, durationMs: null },
      now,
    });

    expect(mocks.tx.mediaOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "op_1", status: "uploading" }),
        data: { status: "completed", progress: 100, completedAt: now },
      }),
    );
    expect(mocks.tx.generationGraphNodeOutput.deleteMany).toHaveBeenCalledWith({
      where: { graphNodeId: "node_1", portId: { in: ["images"] } },
    });
    expect(mocks.tx.generationGraphNodeOutput.create).toHaveBeenCalledTimes(2);
    expect(mocks.tx.generationGraphNode.updateMany).toHaveBeenCalledWith({
      where: { id: "node_1" },
      data: { selectedOutputAssetId: "asset_1" },
    });
  });

  it("selects the newest server-operation output even when an older result was selected", async () => {
    mocks.tx.mediaOperation.findFirst.mockResolvedValue({
      id: "op_1",
      ownerEmail: "owner@example.com",
      graphId: "graph_1",
      graphNodeId: "node_1",
      type: "edit.image.removeBackground",
      configVersion: 1,
      parametersJson: {},
      inputAssetIdsJson: ["source_1"],
      expectedOutputCount: 1,
      status: "processing",
      progress: 10,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });

    await mediaAssetRepository.completeServerOperation("owner@example.com", "op_1", [{
      type: "image",
      storageProvider: "leemage",
      storageObjectId: "file_1",
      storageUrl: "https://storage.example/file_1",
      mimeType: "image/png",
      bytes: 33,
      width: 640,
      height: 360,
      durationMs: null,
    }], now);

    expect(mocks.tx.generationGraphNode.updateMany).toHaveBeenCalledWith({
      where: { id: "node_1" },
      data: { selectedOutputAssetId: "asset_1" },
    });
  });
});
