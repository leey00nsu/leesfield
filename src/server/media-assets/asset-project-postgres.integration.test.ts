// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { assetProjectService as projects } from "./asset-project-service";
import { assetOrganizationService as metadata } from "./asset-organization-service";
import { mediaAssetService } from "./media-asset-service";
import { mediaAssetRepository } from "./media-asset-repository";
import { getAssetLibraryUsage } from "./asset-library-usage";
import { deleteHistoryFiles } from "@/server/history/delete-history-files";

describe.skipIf(!postgresIntegrationEnabled)("asset project collections", () => {
  const owner = "projects-" + randomUUID() + "@example.com";
  const foreign = "foreign-" + owner;
  afterAll(async () => {
    for (let depth = 0; depth < 33; depth++) await prisma.assetProject.deleteMany({ where: { ownerEmail: { in: [owner, foreign] }, children: { none: {} } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail: { in: [owner, foreign] } } });
  });
  function asset(type: "image" | "video" = "image") {
    return prisma.mediaAsset.create({ data: {
      ownerEmail: owner, type, origin: "upload", storageProvider: "leemage",
      storageObjectId: randomUUID(), storageUrl: "https://storage.example/project." + (type === "image" ? "png" : "mp4"),
      mimeType: type === "image" ? "image/png" : "video/mp4",
    } });
  }
  it("uses many memberships without duplicating files and removes only the deleted project", async () => {
    const file = await asset();
    const first = await projects.create(owner, { name: "First" });
    const second = await projects.create(owner, { name: "Second" });
    const linked = await metadata.patch(owner, file.id, { expectedVersion: 1, projectIds: [first.id, second.id] });
    expect(linked.projectIds?.sort()).toEqual([first.id, second.id].sort());
    for (const projectId of [first.id, second.id]) {
      expect((await mediaAssetService.list(owner, { projectId })).items.map(({ id }) => id)).toEqual([file.id]);
    }
    expect((await mediaAssetService.list(owner, { query: file.id, projectId: "root" })).items).toEqual([]);
    await projects.delete(owner, first.id, { expectedVersion: 1 });
    expect(await mediaAssetService.get(owner, file.id)).toMatchObject({ id: file.id, url: file.storageUrl, version: 3, projectIds: [second.id] });
    expect(await prisma.mediaAsset.count({ where: { storageObjectId: file.storageObjectId } })).toBe(1);
    await projects.delete(owner, second.id, { expectedVersion: 1 });
    expect((await mediaAssetService.list(owner, { query: file.id, projectId: "root" })).items.map(({ id }) => id)).toEqual([file.id]);
  });
  it("rejects foreign and duplicate memberships, stale metadata, and invalid project input atomically", async () => {
    const file = await asset();
    const mine = await projects.create(owner, { name: "Owned" });
    const theirs = await projects.create(foreign, { name: "Foreign" });
    await expect(metadata.patch(owner, file.id, { expectedVersion: 1, displayName: "Must rollback", projectIds: [mine.id, theirs.id] })).rejects.toThrow("ASSET_ORGANIZATION_NOT_FOUND");
    await expect(metadata.patch(owner, file.id, { expectedVersion: 1, projectIds: [mine.id, mine.id] })).rejects.toThrow("INVALID_REQUEST");
    expect(await mediaAssetService.get(owner, file.id)).toMatchObject({ version: 1, displayName: null, projectIds: [] });
    await metadata.patch(owner, file.id, { expectedVersion: 1, projectIds: [mine.id] });
    await expect(metadata.patch(owner, file.id, { expectedVersion: 1, projectIds: [] })).rejects.toThrow("ASSET_VERSION_CONFLICT");
    await expect(projects.update(foreign, mine.id, { expectedVersion: 1, name: "Intruder" })).rejects.toThrow("ASSET_ORGANIZATION_NOT_FOUND");
    expect(() => projects.create(owner, { name: "Invalid", description: "x".repeat(2001) })).toThrow("INVALID_REQUEST");
  });
  it("rejects cycles and promotion conflicts, then promotes children while preserving memberships", async () => {
    const parent = await projects.create(owner, { name: "Parent" });
    const child = await projects.create(owner, { name: "Child", parentId: parent.id });
    const collision = await projects.create(owner, { name: "Child" });
    await expect(projects.update(owner, parent.id, { expectedVersion: 1, parentId: child.id })).rejects.toThrow("ASSET_PROJECT_CYCLE");
    await expect(projects.create(owner, { name: " parent " })).rejects.toThrow("ASSET_NAME_CONFLICT");
    await expect(projects.delete(owner, parent.id, { expectedVersion: 1 })).rejects.toThrow("ASSET_NAME_CONFLICT");
    expect(await prisma.assetProject.findUnique({ where: { id: child.id } })).toMatchObject({ parentId: parent.id, version: 1 });
    await projects.delete(owner, collision.id, { expectedVersion: 1 });
    await projects.delete(owner, parent.id, { expectedVersion: 1 });
    expect(await prisma.assetProject.findUnique({ where: { id: child.id } })).toMatchObject({ parentId: null, version: 2 });
    await expect(projects.update(owner, child.id, { expectedVersion: 1, description: "Stale" })).rejects.toThrow("ASSET_VERSION_CONFLICT");
  });
  it("protects owned image covers from both asset and History deletion and rejects video/foreign covers", async () => {
    const file = await asset();
    const video = await asset("video");
    const project = await projects.create(owner, { name: "Cover", coverAssetId: file.id, description: "Cover fixture" });
    expect(project.cover).toMatchObject({ id: file.id, url: file.storageUrl });
    expect(await getAssetLibraryUsage(owner, file.id)).toMatchObject({ inUse: true, projectCoverIds: [project.id] });
    await expect(mediaAssetService.remove(owner, file.id)).rejects.toThrow("MEDIA_ASSET_IN_USE");
    await expect(mediaAssetRepository.markAssetDeleting(owner, file.id)).rejects.toThrow("MEDIA_ASSET_IN_USE");
    await expect(deleteHistoryFiles(owner, [{ id: "output", assetId: file.id }])).rejects.toThrow("MEDIA_ASSET_IN_USE");
    await expect(projects.update(owner, project.id, { expectedVersion: 1, coverAssetId: video.id })).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
    await expect(projects.create(foreign, { name: "Stolen", coverAssetId: file.id })).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
    await projects.update(owner, project.id, { expectedVersion: 1, coverAssetId: null });
    expect(await getAssetLibraryUsage(owner, file.id)).toMatchObject({ inUse: false, projectCoverIds: [] });
    expect(await prisma.mediaAsset.findUnique({ where: { id: file.id } })).toMatchObject({ status: "completed", storageUrl: file.storageUrl });
  });
  it("serializes competing cover changes/deletion and binds cursors to project filters", async () => {
    const files = await Promise.all([asset(), asset()]);
    const project = await projects.create(owner, { name: "Race" });
    for (const file of files) await metadata.patch(owner, file.id, { expectedVersion: 1, projectIds: [project.id] });
    const page = await mediaAssetService.list(owner, { projectId: project.id, limit: 1 });
    expect(page.nextCursor).toMatch(/^v1\./);
    await expect(mediaAssetService.list(owner, { projectId: "root", limit: 1, cursor: page.nextCursor })).rejects.toThrow("INVALID_REQUEST");
    const race = await Promise.allSettled([
      projects.update(owner, project.id, { expectedVersion: 1, coverAssetId: files[0].id }),
      mediaAssetRepository.markAssetDeleting(owner, files[0].id),
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const current = await prisma.assetProject.findUniqueOrThrow({ where: { id: project.id } });
    const file = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: files[0].id } });
    expect(current.coverAssetId === file.id && file.status === "deleting").toBe(false);
    await prisma.mediaCleanupTask.deleteMany({ where: { assetId: file.id } });
  });
});
