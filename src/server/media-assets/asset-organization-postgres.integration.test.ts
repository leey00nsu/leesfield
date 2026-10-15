// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

describe.skipIf(!postgresIntegrationEnabled)("asset library PostgreSQL constraints", () => {
  const suffix = randomUUID();
  const owner = `assets-${suffix}@example.com`;
  const other = `other-assets-${suffix}@example.com`;
  afterAll(async () => {
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.assetTag.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.assetFolder.deleteMany({ where: { ownerEmail: { in: [owner, other] }, parentId: { not: null } } });
    await prisma.assetFolder.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
  });
  it("defaults old-shaped files to root and preserves identity/storage when metadata changes", async () => {
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail: owner, type: "image", origin: "generation", storageProvider: "leemage", storageObjectId: `file-${suffix}`, storageUrl: "https://storage.example/file.png", mimeType: "image/png" } });
    expect(asset).toMatchObject({ folderId: null, displayName: null, originalFileName: null, starred: false, version: 1 });
    const folder = await prisma.assetFolder.create({ data: { ownerEmail: owner, name: "Portrait", normalizedName: "portrait" } });
    const tag = await prisma.assetTag.create({ data: { ownerEmail: owner, name: "Hero", normalizedName: "hero" } });
    const result = await prisma.mediaAsset.update({ where: { id: asset.id }, data: { displayName: "Cover", starred: true, folderId: folder.id, tagAssignments: { create: { tagId: tag.id } } }, include: { tagAssignments: true } });
    expect(result).toMatchObject({ id: asset.id, storageObjectId: asset.storageObjectId, storageUrl: asset.storageUrl, starred: true, folderId: folder.id });
    expect(result.tagAssignments).toHaveLength(1);
    await expect(prisma.assetFolder.delete({ where: { id: folder.id } })).rejects.toMatchObject({ code: "P2003" });
    await prisma.assetTag.delete({ where: { id: tag.id } });
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id }, include: { tagAssignments: true } })).toMatchObject({ id: asset.id, tagAssignments: [] });
  });
  it("enforces root sibling uniqueness and owner-scoped folder/tag relations in the DB", async () => {
    const folder = await prisma.assetFolder.create({ data: { ownerEmail: owner, name: "Root", normalizedName: "root" } });
    await expect(prisma.assetFolder.create({ data: { ownerEmail: owner, name: "ROOT", normalizedName: "root" } })).rejects.toMatchObject({ code: "P2002" });
    const foreign = await prisma.assetFolder.create({ data: { ownerEmail: other, name: "Other", normalizedName: "other" } });
    await expect(prisma.assetFolder.create({ data: { ownerEmail: owner, name: "Child", normalizedName: "child", parentId: foreign.id, parentKey: foreign.id } })).rejects.toMatchObject({ code: "P2003" });
    const asset = await prisma.mediaAsset.findFirstOrThrow({ where: { ownerEmail: owner } });
    await expect(prisma.mediaAsset.update({ where: { id: asset.id }, data: { folderId: foreign.id } })).rejects.toMatchObject({ code: "P2003" });
    const tag = await prisma.assetTag.create({ data: { ownerEmail: other, name: "Foreign", normalizedName: "foreign" } });
    await expect(prisma.assetTagAssignment.create({ data: { ownerEmail: owner, assetId: asset.id, tagId: tag.id } })).rejects.toMatchObject({ code: "P2003" });
    await prisma.assetFolder.create({ data: { ownerEmail: owner, name: "Child", normalizedName: "child", parentId: folder.id, parentKey: folder.id } });
  });
});
