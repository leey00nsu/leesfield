// @vitest-environment node
import { useSharedQueueFixture } from "@/test-utils/job-queue-postgres";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { assetOrganizationRepository as repository } from "./asset-organization-repository";
import { createMediaAssetService, mediaAssetService } from "./media-asset-service";
import { mediaAssetRepository } from "./media-asset-repository";
import { findAssetModelOptions } from "./asset-library-search";
import { createQueueRunner } from "@/server/job-queue/job-queue-runner";
import { createStorageCleanupHandler } from "@/server/job-queue/handlers/storage-cleanup-handler";
import { getAssetLibraryUsage } from "./asset-library-usage";

describe.skipIf(!postgresIntegrationEnabled)("asset organization operations and server search", () => {
  const suffix = randomUUID();
  const owner = `library-${suffix}@example.com`;
  useSharedQueueFixture(() => [owner]);
  const other = `foreign-library-${suffix}@example.com`;
  afterAll(async () => {
    await prisma.generationGraph.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.generationInputAsset.deleteMany({ where: { ownerEmail: owner } });
    await prisma.imageGeneration.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.videoGeneration.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.audioGeneration.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.assetTag.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    const folders = await prisma.assetFolder.findMany({ where: { ownerEmail: { in: [owner, other] } } });
    for (let pass = 0; pass < folders.length; pass++) {
      await prisma.assetFolder.deleteMany({ where: { ownerEmail: { in: [owner, other] }, children: { none: {} } } });
    }
  });
  async function asset(name: string, createdAt: Date = new Date()) {
    return prisma.mediaAsset.create({ data: { ownerEmail: owner, type: "image", origin: "upload", displayName: name, originalFileName: "source.png", storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/source.png", mimeType: "image/png", createdAt } });
  }
  async function frozenGallery(assetId: string, graphOwner = owner) {
    return prisma.generationGraph.create({
      data: {
        ownerEmail: graphOwner,
        title: "Frozen Gallery reference",
        nodes: { create: {
          id: randomUUID(), kind: "output.gallery", x: 0, y: 0, configVersion: 1,
          config: { mediaType: "image", excludedAssetIds: [], resultItems: [{
            id: randomUUID(), nodeId: randomUUID(), executionId: randomUUID(),
            portId: "image", index: 0, mediaType: "image", assetId, state: "completed",
          }] },
        } },
      },
      include: { nodes: true, edges: true },
    });
  }

  it("filters null metadata and local-day UTC boundaries across pages and binds every new condition to cursors", async () => {
    const from = "2026-10-12T15:00:00.000Z", to = "2026-10-13T15:00:00.000Z";
    const files = await Promise.all(["2026-10-12T14:59:59.999Z", from, "2026-10-13T14:59:59.999Z", to].map((time, i) => asset("Filter " + suffix + " " + i, new Date(time))));
    await repository.patchAsset(owner, files[1].id, { expectedVersion: 1, classification: "prop", managementStatus: "active" });
    await repository.patchAsset(owner, files[2].id, { expectedVersion: 1, classification: "prop", managementStatus: "archived" });
    const query = { query: "Filter " + suffix, dateFrom: from, dateTo: to, classification: "prop", sort: "oldest", limit: 1 };
    const first = await mediaAssetService.list(owner, query);
    expect(first.items.map(item => item.id)).toEqual([files[1].id]);
    const second = await mediaAssetService.list(owner, { ...query, cursor: first.nextCursor });
    expect(second.items.map(item => item.id)).toEqual([files[2].id]); expect(second.nextCursor).toBeNull();
    for (const change of [{ classification: "none" }, { managementStatus: "active" }, { dateFrom: "2026-10-12T16:00:00.000Z" }, { dateTo: "2026-10-14T00:00:00.000Z" }, { model: "changed" }]) {
      await expect(mediaAssetService.list(owner, { ...query, ...change, cursor: first.nextCursor })).rejects.toThrow("INVALID_REQUEST");
    }
    expect((await mediaAssetService.list(owner, { ...query, limit: 24, managementStatus: "active" })).items.map(item => item.id)).toEqual([files[1].id]);
    expect((await mediaAssetService.list(owner, { query: "Filter " + suffix, classification: "none", managementStatus: "none", sort: "oldest" })).items.map(item => item.id)).toEqual([files[0].id, files[3].id]);
    expect((await mediaAssetService.list(other, query)).items).toEqual([]);
  });
  it("filters original image/video/audio generation models without inheriting input models or foreign provenance", async () => {
    const model = "model-" + suffix;
    const files = await Promise.all(["image", "video", "audio"].map(async type => {
      const file = await asset("Model " + type + " " + suffix);
      await prisma.mediaAsset.update({ where: { id: file.id }, data: { type: type as "image" | "video" | "audio", origin: "generation" } });
      const data = { ownerEmail: owner, requestId: randomUUID(), prompt: "fixture", status: "completed" as const, progress: 100, modelKey: model };
      if (type === "image") await prisma.imageGeneration.create({ data: { ...data, aspectRatio: "1024x1024", imageCount: 1, steps: 1, images: { create: { url: file.storageUrl!, assetId: file.id } } } });
      else if (type === "video") await prisma.videoGeneration.create({ data: { ...data, videos: { create: { url: file.storageUrl!, assetId: file.id } } } });
      else await prisma.audioGeneration.create({ data: { ...data, audios: { create: { url: file.storageUrl!, assetId: file.id } } } });
      return file;
    }));
    const input = await asset("Model input " + suffix);
    await prisma.generationInputAsset.create({ data: { ownerEmail: owner, requestId: "model-input-" + suffix, generationType: "image", field: "reference", assetId: input.id } });
    const foreign = await asset("Model foreign " + suffix);
    await prisma.mediaAsset.update({ where: { id: foreign.id }, data: { origin: "generation" } });
    await prisma.imageGeneration.create({ data: { ownerEmail: other, requestId: randomUUID(), prompt: "fixture", status: "completed", progress: 100, modelKey: "foreign-" + suffix, aspectRatio: "1024x1024", imageCount: 1, steps: 1, images: { create: { url: foreign.storageUrl!, assetId: foreign.id } } } });
    expect((await mediaAssetService.list(owner, { model })).items.map(item => item.id).sort()).toEqual(files.map(file => file.id).sort());
    expect((await mediaAssetService.list(owner, { model, category: "uploads" })).items).toEqual([]);
    expect((await mediaAssetService.list(owner, { model: "foreign-" + suffix })).items).toEqual([]);
    expect((await mediaAssetService.list(other, { model })).items).toEqual([]);
    expect(await findAssetModelOptions(owner)).toContain(model);
    expect(await findAssetModelOptions(owner)).not.toContain("foreign-" + suffix);
    expect(await findAssetModelOptions(other)).toEqual([]);
  });

  it("rolls back cycles, duplicate siblings and conflicting folder promotion while preserving files", async () => {
    const parent = await repository.createFolder(owner, { name: "Parent", parentId: null });
    const child = await repository.createFolder(owner, { name: "Child", parentId: parent.id });
    const file = await asset("Folder file");
    await repository.patchAsset(owner, file.id, { expectedVersion: 1, folderId: child.id });
    await expect(repository.updateFolder(owner, parent.id, { expectedVersion: 1, parentId: child.id })).rejects.toThrow("ASSET_FOLDER_CYCLE");
    await expect(repository.createFolder(owner, { name: " parent ", parentId: null })).rejects.toThrow("ASSET_NAME_CONFLICT");
    const conflict = await repository.createFolder(owner, { name: "Child", parentId: null });
    await expect(repository.deleteFolder(owner, parent.id, 1)).rejects.toThrow("ASSET_NAME_CONFLICT");
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ folderId: child.id, version: 2, storageUrl: file.storageUrl });
    expect(await prisma.assetFolder.findUnique({ where: { id: child.id } })).toMatchObject({ parentId: parent.id, version: 1 });
    await repository.deleteFolder(owner, conflict.id, 1);
    await repository.deleteFolder(owner, parent.id, 1);
    expect(await prisma.assetFolder.findUnique({ where: { id: child.id } })).toMatchObject({ parentId: null, parentKey: "root", version: 2 });
    await repository.deleteFolder(owner, child.id, 2);
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ folderId: null, version: 3, storageUrl: file.storageUrl });
  });

  it("rejects foreign ownership and stale batch versions without partial metadata or tags", async () => {
    const first = await asset("Batch first");
    const second = await asset("Batch second");
    const folder = await repository.createFolder(other, { name: "Foreign", parentId: null });
    const tag = await repository.createTag(owner, "Shared");
    await expect(repository.patchAsset(owner, first.id, { expectedVersion: 1, folderId: folder.id })).rejects.toThrow("ASSET_ORGANIZATION_NOT_FOUND");
    await repository.patchAsset(owner, second.id, { expectedVersion: 1, starred: true });
    await expect(repository.patchBatch(owner, { assets: [{ id: first.id, expectedVersion: 1 }, { id: second.id, expectedVersion: 1 }], starred: true, addTagIds: [tag.id] })).rejects.toThrow("ASSET_VERSION_CONFLICT");
    expect(await prisma.mediaAsset.findUnique({ where: { id: first.id }, include: { tagAssignments: true } })).toMatchObject({ starred: false, version: 1, tagAssignments: [] });
    await repository.patchBatch(owner, { assets: [{ id: first.id, expectedVersion: 1 }, { id: second.id, expectedVersion: 2 }], starred: true, addTagIds: [tag.id] });
    const current = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: first.id }, include: { tagAssignments: true } });
    expect(current).toMatchObject({ starred: true, version: 2 });
    expect(current.tagAssignments).toHaveLength(1);
    await repository.changeTag(owner, tag.id, 1);
    expect(await prisma.mediaAsset.findUnique({ where: { id: first.id }, include: { tagAssignments: true } })).toMatchObject({ version: 3, tagAssignments: [], storageUrl: first.storageUrl });
  });

  it("searches unloaded names and AND tags, and binds sort cursors to their owner and filters", async () => {
    const files = await Promise.all(["Search A", "Search B", "Search C"].map((name, index) => asset(name, new Date(Date.UTC(2026, 9, 13, 0, index)))));
    const tagA = await repository.createTag(owner, "Catalog");
    const tagB = await repository.createTag(owner, "Hero");
    await repository.patchAsset(owner, files[0].id, { expectedVersion: 1, tagIds: [tagA.id, tagB.id] });
    await repository.patchAsset(owner, files[1].id, { expectedVersion: 1, tagIds: [tagA.id] });
    const query = { query: "Search ", sort: "name", limit: 1 };
    const firstPage = await mediaAssetService.list(owner, query);
    expect(firstPage.items.map((item) => item.id)).toEqual([files[0].id]);
    expect(firstPage.nextCursor).toMatch(/^v1\./);
    // Renaming/deleting the boundary row does not cause Prisma cursor row lookups to fail.
    await repository.patchAsset(owner, files[0].id, { expectedVersion: 2, displayName: "Earlier" });
    const secondPage = await mediaAssetService.list(owner, { ...query, cursor: firstPage.nextCursor });
    expect(secondPage.items.map((item) => item.id)).toEqual([files[1].id]);
    await expect(mediaAssetService.list(owner, { ...query, sort: "latest", cursor: firstPage.nextCursor })).rejects.toThrow("INVALID_REQUEST");
    await expect(mediaAssetService.list(other, { ...query, cursor: firstPage.nextCursor })).rejects.toThrow("INVALID_REQUEST");
    const tagged = await mediaAssetService.list(owner, { tagIds: [tagA.id, tagB.id], sort: "latest" });
    expect(tagged.items.map((item) => item.id)).toEqual([files[0].id]);
    const searchedTag = await mediaAssetService.list(owner, { query: "Catalog", sort: "oldest" });
    expect(searchedTag.items).toEqual([]);
    const root = await mediaAssetService.list(owner, { query: files[2].id, folderId: "root", sort: "latest" });
    expect(root.items.map((item) => item.id)).toEqual([files[2].id]);
    await expect(mediaAssetService.list(owner, { sort: "name", cursor: "v1.bad" })).rejects.toThrow("INVALID_REQUEST");
  });

  it("separates original generation provenance from subsequent input use", async () => {
    const output = await asset("Generated original");
    const requestId = randomUUID();
    await prisma.imageGeneration.create({ data: { ownerEmail: owner, requestId, prompt: "fixture", status: "completed", progress: 100, modelKey: "test", requestParams: {}, aspectRatio: "1024x1024", imageCount: 1, steps: 1, images: { create: { url: output.storageUrl!, assetId: output.id } } } });
    expect(await getAssetLibraryUsage(owner, output.id)).toMatchObject({ inUse: false, provenance: [{ type: "image", requestId }] });
    await prisma.generationInputAsset.create({ data: { ownerEmail: owner, requestId: "subsequent-" + suffix, generationType: "video", field: "reference", assetId: output.id } });
    expect(await getAssetLibraryUsage(owner, output.id)).toMatchObject({ inUse: true, generationRequestIds: ["subsequent-" + suffix] });
    await expect(getAssetLibraryUsage(other, output.id)).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
  });

  it("counts frozen Gallery-only references for both usage queries within the asset owner", async () => {
    const file = await asset("Frozen Gallery output");
    // The producer ID in the snapshot has no remaining node, output binding or edge.
    const graph = await frozenGallery(file.id);
    await frozenGallery(file.id, other);
    expect(graph.nodes.map(node => node.kind)).toEqual(["output.gallery"]);
    expect(graph.edges).toEqual([]);

    await expect(getAssetLibraryUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [graph.id], inUse: true });
    await expect(mediaAssetRepository.getAssetUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [graph.id] });
    await expect(getAssetLibraryUsage(other, file.id)).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
    await expect(mediaAssetRepository.getAssetUsage(other, file.id)).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");

    await prisma.generationGraphNode.update({
      where: { id: graph.nodes[0].id },
      data: { config: { mediaType: "image", excludedAssetIds: [], resultItems: [] } },
    });
    // The other owner's matching snapshot remains, but cannot keep this asset in use.
    await expect(getAssetLibraryUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [], inUse: false });
    await expect(mediaAssetRepository.getAssetUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [] });

    const input = await prisma.generationGraphNode.create({
      data: { id: randomUUID(), graphId: graph.id, kind: "input.image", x: 0, y: 0, configVersion: 1, config: { assetId: file.id } },
    });
    await expect(getAssetLibraryUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [graph.id], inUse: true });
    await expect(mediaAssetRepository.getAssetUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [graph.id] });
    await prisma.generationGraphNode.delete({ where: { id: input.id } });
  });

  it("blocks removal before storage deletion until the sole Gallery reference is removed", async () => {
    const file = await asset("Protected Gallery output");
    const graph = await frozenGallery(file.id);
    const storage = {
      name: "leemage" as const,
      assertAvailable: vi.fn(), presign: vi.fn(), confirm: vi.fn(),
      inspect: vi.fn(), resolveReadUrl: vi.fn(), delete: vi.fn().mockResolvedValue(undefined),
    };
    const service = createMediaAssetService(mediaAssetRepository, storage);

    await expect(service.remove(owner, file.id)).rejects.toMatchObject({ name: "MediaAssetInUseError", graphIds: [graph.id] });
    expect(storage.delete).not.toHaveBeenCalled();
    await expect(prisma.mediaAsset.findUnique({ where: { id: file.id } })).resolves.toMatchObject({ status: "completed", storageUrl: file.storageUrl });
    await expect(prisma.mediaCleanupTask.count({ where: { assetId: file.id } })).resolves.toBe(0);

    await prisma.generationGraphNode.delete({ where: { id: graph.nodes[0].id } });
    await expect(getAssetLibraryUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [], inUse: false });
    await expect(mediaAssetRepository.getAssetUsage(owner, file.id)).resolves.toMatchObject({ graphIds: [] });
    await expect(service.remove(owner, file.id)).resolves.toBeUndefined();
    const runner = createQueueRunner([createStorageCleanupHandler(storage)]);
    try { await runner.pump(); await runner.drain(); } finally { await runner.stop(); }
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith(file.storageObjectId);
    await expect(prisma.mediaAsset.findUnique({ where: { id: file.id } })).resolves.toMatchObject({ status: "failed", storageUrl: null });
  });

  it("serializes competing folder and asset writes and keeps one winning version", async () => {
    const folder = await repository.createFolder(owner, { name: "Concurrent", parentId: null });
    const folders = await Promise.allSettled([
      repository.updateFolder(owner, folder.id, { expectedVersion: 1, name: "Winner A" }),
      repository.updateFolder(owner, folder.id, { expectedVersion: 1, name: "Winner B" }),
    ]);
    expect(folders.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(folders.filter((item) => item.status === "rejected")).toHaveLength(1);
    const file = await asset("Concurrent file");
    const writes = await Promise.allSettled([
      repository.patchAsset(owner, file.id, { expectedVersion: 1, starred: true }),
      repository.patchAsset(owner, file.id, { expectedVersion: 1, displayName: "Winner" }),
    ]);
    expect(writes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ version: 2, storageUrl: file.storageUrl });
  });

  it("round-trips detail metadata without changing file identity or execution state and enforces owner/CAS", async () => {
    const file = await asset("Editable detail");
    expect(file).toMatchObject({ classification: null, displayVersion: null, description: null, managementStatus: null });
    const input = { expectedVersion: 1, classification: "prop" as const, displayVersion: "v2", description: "Reusable product\nFront view", managementStatus: "active" as const };
    await repository.patchAsset(owner, file.id, input);
    expect(await mediaAssetService.get(owner, file.id)).toMatchObject({ id: file.id, version: 2, status: "completed", url: file.storageUrl, classification: "prop", displayVersion: "v2", description: input.description, managementStatus: "active" });
    await expect(repository.patchAsset(owner, file.id, { expectedVersion: 1, description: "stale" })).rejects.toThrow("ASSET_VERSION_CONFLICT");
    await expect(repository.patchAsset(other, file.id, { expectedVersion: 2, description: "foreign" })).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
    expect(await mediaAssetService.get(owner, file.id)).toMatchObject({ description: input.description, version: 2 });
    await repository.patchAsset(owner, file.id, { expectedVersion: 2, classification: null, displayVersion: null, description: null, managementStatus: null });
    expect(await mediaAssetService.get(owner, file.id)).toMatchObject({ id: file.id, version: 3, status: "completed", classification: null, displayVersion: null, description: null, managementStatus: null });
    await expect(prisma.mediaAsset.update({ where: { id: file.id }, data: { classification: "invalid" } })).rejects.toThrow();
  });

  it("edits searchable owner-scoped reference IDs without changing existing file/input links", async () => {
    const first = await asset("Reference first");
    const second = await asset("Reference second");
    const key = "HERO_" + suffix;
    await prisma.generationInputAsset.create({ data: { ownerEmail: owner, requestId: "reference-" + suffix, generationType: "video", field: "reference", assetId: first.id } });
    await repository.patchAsset(owner, first.id, { expectedVersion: 1, referenceId: key });
    expect(await mediaAssetService.get(owner, first.id)).toMatchObject({ id: first.id, referenceId: key, version: 2, url: first.storageUrl });
    expect((await mediaAssetService.list(owner, { query: key, sort: "latest" })).items.map(item => item.id)).toEqual([first.id]);
    expect(await getAssetLibraryUsage(owner, first.id)).toMatchObject({ inUse: true, generationRequestIds: ["reference-" + suffix] });
    await expect(repository.patchAsset(owner, second.id, { expectedVersion: 1, referenceId: key })).rejects.toThrow("ASSET_ID_CONFLICT");
    await expect(repository.patchAsset(owner, second.id, { expectedVersion: 1, referenceId: first.id })).rejects.toThrow("ASSET_ID_CONFLICT");
    await expect(repository.patchAsset(other, first.id, { expectedVersion: 2, referenceId: "FOREIGN" })).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
    await expect(repository.patchAsset(owner, first.id, { expectedVersion: 1, referenceId: "STALE" })).rejects.toThrow("ASSET_VERSION_CONFLICT");
    const foreign = await prisma.mediaAsset.create({ data: { ownerEmail: other, type: "image", origin: "upload", storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/foreign.png", mimeType: "image/png" } });
    await repository.patchAsset(other, foreign.id, { expectedVersion: 1, referenceId: key });
    await repository.patchAsset(owner, first.id, { expectedVersion: 2, referenceId: first.id });
    expect(await mediaAssetService.get(owner, first.id)).toMatchObject({ id: first.id, referenceId: null, version: 3, url: first.storageUrl });
    const writes = await Promise.allSettled([first, second].map(file => repository.patchAsset(owner, file.id, { expectedVersion: file.id === first.id ? 3 : 1, referenceId: key })));
    expect(writes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter(item => item.status === "rejected")).toHaveLength(1);
  });
});
