// @vitest-environment node
import { useSharedQueueFixture } from "@/test-utils/job-queue-postgres";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { setHistoryVisibility } from "./history-visibility";
import { getHistoryRecordItem, getHistory } from "./handlers/get-history";
import { getOwnedHistoryRecord, deleteOwnedHistoryRecord } from "./history-record";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import { getImageGenerationByRequestId } from "@/server/image-generation/image-generation-repository";
import { createMediaAssetService } from "@/server/media-assets/media-asset-service";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { createQueueRunner } from "@/server/job-queue/job-queue-runner";
import { createStorageCleanupHandler } from "@/server/job-queue/handlers/storage-cleanup-handler";

describe.skipIf(!postgresIntegrationEnabled)("history visibility and file lifetime", () => {
  const suffix = randomUUID();
  const owner = `visibility-${suffix}@example.com`;
  useSharedQueueFixture(() => [owner]);
  const other = `foreign-${suffix}@example.com`;
  async function drainCleanup() {
    const runner = createQueueRunner([createStorageCleanupHandler(storage)]);
    try { await runner.pump(); await runner.drain(); } finally { await runner.stop(); }
  }
  afterAll(async () => {
    await prisma.generationInputAsset.deleteMany({ where: { ownerEmail: owner } });
    await prisma.imageGeneration.deleteMany({ where: { ownerEmail: owner } });
    await prisma.videoGeneration.deleteMany({ where: { ownerEmail: owner } });
    await prisma.audioGeneration.deleteMany({ where: { ownerEmail: owner } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail: owner } });
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail: owner } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail: owner } });
  });
  async function output() {
    return prisma.mediaAsset.create({ data: { ownerEmail: owner, type: "image", origin: "generation", storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/reference.png", mimeType: "image/png" } });
  }
  async function generation(assetId: string, requestId = randomUUID()) {
    return prisma.imageGeneration.create({ data: { ownerEmail: owner, requestId, prompt: "visibility fixture", status: "completed", progress: 100, modelKey: "fixture", requestParams: {}, aspectRatio: "1024x1024", imageCount: 1, steps: 1, images: { create: { url: "https://storage.example/reference.png", assetId } } } });
  }
  const deleteSpy = vi.fn().mockResolvedValue(undefined);
  const storage = { name: "leemage" as const, assertAvailable() {}, presign: vi.fn(), confirm: vi.fn(), inspect: vi.fn(), resolveReadUrl: vi.fn(), delete: deleteSpy };
  const service = createMediaAssetService(mediaAssetRepository, storage);

  it("hides and restores a terminal record without deleting files or changing execution duration", async () => {
    const file = await output();
    const record = await generation(file.id);
    await setHistoryVisibility(owner, record.requestId, { type: "image", hidden: true });
    expect((await getHistory(new URLSearchParams({ type: "image" }), owner)).items.some((item) => item.id === record.requestId)).toBe(false);
    expect((await getHistory(new URLSearchParams({ type: "image", hidden: "true" }), owner)).items.some((item) => item.id === record.requestId)).toBe(true);
    expect(await prisma.imageGeneration.findUnique({ where: { id: record.id } })).toMatchObject({ updatedAt: record.updatedAt });
    expect(await service.get(owner, file.id)).toMatchObject({ id: file.id, url: file.storageUrl });
    expect(await getOwnedHistoryRecord(owner, record.requestId, { type: "image", origin: "generation" })).toMatchObject({ url: file.storageUrl });
    await expect(setHistoryVisibility(other, record.requestId, { type: "image", hidden: false })).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
    await setHistoryVisibility(owner, record.requestId, { type: "image", hidden: false });
    expect((await getHistory(new URLSearchParams({ type: "image" }), owner)).items.some((item) => item.id === record.requestId)).toBe(true);
    expect(await getHistoryRecordItem(owner, record.requestId, { type: "image", origin: "generation" })).toMatchObject({ id: record.requestId, hidden: false, resultUrl: file.storageUrl });
    expect(await getHistoryRecordItem(other, record.requestId, { type: "image", origin: "generation" })).toBeNull();
    expect(deleteSpy).not.toHaveBeenCalled();
    const active = await prisma.imageGeneration.create({ data: { ownerEmail: owner, requestId: randomUUID(), prompt: "active", status: "processing", progress: 10 } });
    await expect(setHistoryVisibility(owner, active.requestId, { type: "image", hidden: true })).rejects.toThrow("ASSET_VERSION_CONFLICT");
    expect(await prisma.imageGeneration.findUnique({ where: { id: active.id } })).toMatchObject({ hiddenAt: null, status: "processing" });
  });

  it("preserves original output records and disables raw URL fallbacks after deleting an unused generated file", async () => {
    const file = await output();
    const record = await generation(file.id);
    await service.remove(owner, file.id); await drainCleanup();
    expect(deleteSpy).toHaveBeenCalledWith(file.storageObjectId);
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ status: "failed", storageUrl: null, legacyUrl: null });
    expect(await prisma.imageGenerationImage.findFirst({ where: { generationId: record.id } })).toMatchObject({ assetId: file.id, url: file.storageUrl });
    const listed = (await getHistory(new URLSearchParams({ type: "image" }), owner)).items.find((item) => item.id === record.requestId);
    expect(listed).toMatchObject({ assetId: file.id, status: "completed", resultUrl: null, thumbnailUrl: null });
    expect(await getOwnedHistoryRecord(owner, record.requestId, { type: "image", origin: "generation" })).toMatchObject({ url: null });
    expect(await getMonitoringRequestDetail("image", record.requestId, owner)).toMatchObject({ assets: [], status: "completed" });
    expect(await getImageGenerationByRequestId(record.requestId, owner)).toMatchObject({ images: [{ assetId: file.id, url: "" }] });
    await expect(service.get(owner, file.id)).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
  });

  it("uses the next available output without shifting indexed downloads", async () => {
    const gone = await output();
    const kept = await output();
    const record = await generation(gone.id);
    await prisma.imageGenerationImage.create({ data: { generationId: record.id, assetId: kept.id, url: kept.storageUrl!, createdAt: new Date(Date.now() + 1000) } });
    await service.remove(owner, gone.id); await drainCleanup();
    expect(await getOwnedHistoryRecord(owner, record.requestId, { type: "image", origin: "generation" })).toMatchObject({ url: kept.storageUrl });
    expect((await getImageGenerationByRequestId(record.requestId, owner))?.images.map(item => item.url)).toEqual(["", kept.storageUrl]);
    expect((await getMonitoringRequestDetail("image", record.requestId, owner))?.assets).toHaveLength(1);
  });

  it("blocks reused output deletion through both library and explicit History DELETE before storage calls", async () => {
    const file = await output();
    const record = await generation(file.id);
    await prisma.generationInputAsset.create({ data: { ownerEmail: owner, requestId: "consumer-" + suffix, generationType: "video", field: "reference", assetId: file.id } });
    const before = deleteSpy.mock.calls.length;
    await expect(service.remove(owner, file.id)).rejects.toThrow("MEDIA_ASSET_IN_USE");
    expect(await deleteOwnedHistoryRecord(await getOwnedHistoryRecord(owner, record.requestId, { type: "image", origin: "generation" }))).toBe(409);
    expect(deleteSpy.mock.calls).toHaveLength(before);
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ status: "completed", storageUrl: file.storageUrl });
    expect(await prisma.imageGeneration.findUnique({ where: { id: record.id } })).not.toBeNull();
  });

  it("retries a failed remote deletion to the same identity tombstone without losing the source execution", async () => {
    const file = await output();
    const record = await generation(file.id);
    deleteSpy.mockRejectedValueOnce(new Error("storage offline"));
    await service.remove(owner, file.id); await drainCleanup();
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ status: "deleting" });
    const pending = await prisma.mediaCleanupTask.findFirstOrThrow({ where: { assetId: file.id, reason: "asset_delete" } });
    await prisma.queueJob.updateMany({ where: { sourceId: pending.id }, data: { availableAt: new Date(Date.now() - 1000) } });
    await drainCleanup();
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ status: "failed", storageUrl: null });
    expect(await prisma.imageGenerationImage.findFirst({ where: { generationId: record.id } })).toMatchObject({ assetId: file.id });
    expect(await prisma.mediaCleanupTask.findUnique({ where: { id: pending.id } })).toMatchObject({ status: "completed" });
  });
  it("preserves hidden video/audio and edited records while missing results stay unavailable", async () => {
    for (const type of ["video", "audio"] as const) {
      const file = await prisma.mediaAsset.create({ data: { ownerEmail: owner, type, origin: "generation", storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/" + type, mimeType: type === "video" ? "video/mp4" : "audio/mpeg" } });
      const data = { ownerEmail: owner, requestId: randomUUID(), prompt: "other media", status: "completed" as const, progress: 100 };
      const outputData = { url: file.storageUrl!, assetId: file.id };
      const record = type === "video" ? await prisma.videoGeneration.create({ data: { ...data, videos: { create: outputData } } }) : await prisma.audioGeneration.create({ data: { ...data, audios: { create: outputData } } });
      await setHistoryVisibility(owner, record.requestId, { type, hidden: true });
      expect((await getHistory(new URLSearchParams({ type, hidden: "true" }), owner)).items.find((item) => item.id === record.requestId)).toMatchObject({ resultUrl: file.storageUrl });
      await service.remove(owner, file.id); await drainCleanup();
      expect((await getHistory(new URLSearchParams({ type, hidden: "true" }), owner)).items.find((item) => item.id === record.requestId)).toMatchObject({ resultUrl: null });
      expect(await getMonitoringRequestDetail(type, record.requestId, owner)).toMatchObject({ assets: [] });
      expect(await getOwnedHistoryRecord(owner, record.requestId, { type, origin: "generation" })).toMatchObject({ url: null });
    }
    const operation = await prisma.mediaOperation.create({ data: { ownerEmail: owner, type: "edit.image.resize", configVersion: 1, parameters: {}, expectedOutputCount: 1, status: "completed", progress: 100 } });
    const edit = await prisma.mediaAsset.create({ data: { ownerEmail: owner, type: "image", origin: "media_operation", sourceOperationId: operation.id, storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/edit", mimeType: "image/png" } });
    await setHistoryVisibility(owner, operation.id, { type: "image", origin: "edit", hidden: true });
    expect(await getHistoryRecordItem(owner, operation.id, { type: "image", origin: "edit" })).toMatchObject({ id: operation.id, hidden: true, origin: "edit" });
    await service.remove(owner, edit.id); await drainCleanup();
    expect((await getHistory(new URLSearchParams({ hidden: "true" }), owner)).items.find((item) => item.id === operation.id)).toMatchObject({ origin: "edit", assetId: edit.id, resultUrl: null });
    await setHistoryVisibility(owner, operation.id, { type: "image", origin: "edit", hidden: false });
    expect((await getHistory(new URLSearchParams(), owner)).items.find((item) => item.id === operation.id)).toMatchObject({ origin: "edit", resultUrl: null });
  });

});
