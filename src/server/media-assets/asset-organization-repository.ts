import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  normalizeAssetOrganizationName,
  type CreateAssetFolderInput, type UpdateAssetFolderInput, type UpdateAssetMetadataInput,
  type BatchAssetMetadataInput, type AssetOrganizationDto,
} from "@/shared/media-assets/asset-organization-contract";
import { MediaAssetNotFoundError, AssetOrganizationNotFoundError, AssetMetadataConflictError } from "./media-asset-errors";

type Tx = Prisma.TransactionClient;

export async function lockOrganization(tx: Tx, ownerEmail: string) {
  await tx.$queryRaw(Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${"asset-organization:" + ownerEmail}, 0)) AS TEXT)`);
}
export async function organizationTransaction<T>(ownerEmail: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, ownerEmail);
      return work(tx);
    }, { timeout: 20_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (Array.isArray(error.meta?.target) && error.meta.target.includes("referenceId")) {
        throw new AssetMetadataConflictError("ASSET_ID_CONFLICT");
      }
      throw new AssetMetadataConflictError("ASSET_NAME_CONFLICT");
    }
    throw error;
  }
}
async function requireFolder(tx: Tx, ownerEmail: string, id: string) {
  const folder = await tx.assetFolder.findFirst({ where: { ownerEmail, id } });
  if (!folder) throw new AssetOrganizationNotFoundError();
  return folder;
}
async function requireTags(tx: Tx, ownerEmail: string, ids: string[]) {
  if (!ids.length) return;
  const tags = await tx.assetTag.findMany({ where: { ownerEmail, id: { in: ids } }, select: { id: true } });
  if (tags.length !== new Set(ids).size) throw new AssetOrganizationNotFoundError();
}
function requireVersion(version: number, expectedVersion: number) {
  if (version !== expectedVersion) throw new AssetMetadataConflictError("ASSET_VERSION_CONFLICT");
}
function folderDto(folder: Awaited<ReturnType<typeof requireFolder>>) {
  return { id: folder.id, name: folder.name, parentId: folder.parentId, version: folder.version, createdAt: folder.createdAt.toISOString(), updatedAt: folder.updatedAt.toISOString() };
}

async function listOrganization(ownerEmail: string): Promise<AssetOrganizationDto> {
  const [folders, tags] = await prisma.$transaction([
    prisma.assetFolder.findMany({ where: { ownerEmail }, orderBy: [{ normalizedName: "asc" }, { id: "asc" }] }),
    prisma.assetTag.findMany({ where: { ownerEmail }, orderBy: [{ normalizedName: "asc" }, { id: "asc" }], select: { id: true, name: true, version: true } }),
  ]);
  return { folders: folders.map(folderDto), tags };
}
async function createFolder(ownerEmail: string, input: CreateAssetFolderInput) {
  return organizationTransaction(ownerEmail, async (tx) => {
    if (input.parentId) await requireFolder(tx, ownerEmail, input.parentId);
    return folderDto(await tx.assetFolder.create({ data: { ownerEmail, name: input.name, normalizedName: normalizeAssetOrganizationName(input.name), parentId: input.parentId, parentKey: input.parentId ?? "root" } }));
  });
}
async function updateFolder(ownerEmail: string, id: string, input: UpdateAssetFolderInput) {
  return organizationTransaction(ownerEmail, async (tx) => {
    const folder = await requireFolder(tx, ownerEmail, id);
    requireVersion(folder.version, input.expectedVersion);
    if (input.parentId) {
      const ancestors = new Set<string>([id]);
      let parent: string | null = input.parentId;
      while (parent) {
        if (ancestors.has(parent)) throw new AssetMetadataConflictError("ASSET_FOLDER_CYCLE");
        ancestors.add(parent);
        parent = (await requireFolder(tx, ownerEmail, parent)).parentId;
      }
    }
    return folderDto(await tx.assetFolder.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name, normalizedName: normalizeAssetOrganizationName(input.name) } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId, parentKey: input.parentId ?? "root" } : {}),
      version: { increment: 1 },
    } }));
  });
}
async function deleteFolder(ownerEmail: string, id: string, expectedVersion: number) {
  return organizationTransaction(ownerEmail, async (tx) => {
    const folder = await requireFolder(tx, ownerEmail, id);
    requireVersion(folder.version, expectedVersion);
    // Unique sibling constraints turn conflicting promotions into a complete rollback.
    await tx.assetFolder.updateMany({ where: { ownerEmail, parentId: id }, data: { parentId: folder.parentId, parentKey: folder.parentId ?? "root", version: { increment: 1 } } });
    await tx.mediaAsset.updateMany({ where: { ownerEmail, folderId: id }, data: { folderId: folder.parentId, version: { increment: 1 } } });
    await tx.assetFolder.delete({ where: { id } });
  });
}
async function createTag(ownerEmail: string, name: string) {
  return organizationTransaction(ownerEmail, async (tx) => tx.assetTag.create({
    data: { ownerEmail, name, normalizedName: normalizeAssetOrganizationName(name) }, select: { id: true, name: true, version: true },
  }));
}
async function changeTag(ownerEmail: string, id: string, expectedVersion: number, name?: string) {
  return organizationTransaction(ownerEmail, async (tx) => {
    const tag = await tx.assetTag.findFirst({ where: { ownerEmail, id } });
    if (!tag) throw new AssetOrganizationNotFoundError();
    requireVersion(tag.version, expectedVersion);
    await tx.mediaAsset.updateMany({ where: { ownerEmail, tagAssignments: { some: { tagId: id, ownerEmail } } }, data: { version: { increment: 1 } } });
    if (name === undefined) { await tx.assetTag.delete({ where: { id } }); return null; }
    return tx.assetTag.update({ where: { id }, data: { name, normalizedName: normalizeAssetOrganizationName(name), version: { increment: 1 } }, select: { id: true, name: true, version: true } });
  });
}
async function patchAsset(ownerEmail: string, id: string, input: UpdateAssetMetadataInput) {
  return organizationTransaction(ownerEmail, async (tx) => {
    if (input.folderId) await requireFolder(tx, ownerEmail, input.folderId);
    if (input.tagIds) await requireTags(tx, ownerEmail, input.tagIds);
    if (input.projectIds?.length) {
      const projects = await tx.assetProject.count({ where: { ownerEmail, id: { in: input.projectIds } } });
      if (projects !== input.projectIds.length) throw new AssetOrganizationNotFoundError();
    }
    const asset = await tx.mediaAsset.findFirst({ where: { id, ownerEmail, status: "completed" }, select: { version: true } });
    if (!asset) throw new MediaAssetNotFoundError();
    requireVersion(asset.version, input.expectedVersion);
    if (input.referenceId) {
      const duplicate = await tx.mediaAsset.findFirst({
        where: { ownerEmail, id: { not: id }, OR: [{ id: input.referenceId }, { referenceId: input.referenceId }] },
        select: { id: true },
      });
      if (duplicate) throw new AssetMetadataConflictError("ASSET_ID_CONFLICT");
    }
    const result = await tx.mediaAsset.updateMany({ where: { id, ownerEmail, status: "completed", version: input.expectedVersion }, data: {
      ...(input.referenceId !== undefined ? { referenceId: input.referenceId === id ? null : input.referenceId } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.classification !== undefined ? { classification: input.classification } : {}),
      ...(input.displayVersion !== undefined ? { displayVersion: input.displayVersion } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.managementStatus !== undefined ? { managementStatus: input.managementStatus } : {}),
      ...(input.starred !== undefined ? { starred: input.starred } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      version: { increment: 1 },
    } });
    if (result.count !== 1) throw new AssetMetadataConflictError("ASSET_VERSION_CONFLICT");
    if (input.projectIds !== undefined) {
      await tx.assetProjectMembership.deleteMany({ where: { assetId: id, ownerEmail } });
      if (input.projectIds.length) await tx.assetProjectMembership.createMany({ data: input.projectIds.map((projectId) => ({ assetId: id, ownerEmail, projectId })) });
    }
    if (input.tagIds !== undefined) {
      await tx.assetTagAssignment.deleteMany({ where: { assetId: id, ownerEmail } });
      if (input.tagIds.length) await tx.assetTagAssignment.createMany({ data: input.tagIds.map((tagId) => ({ assetId: id, ownerEmail, tagId })) });
    }
  });
}
async function patchBatch(ownerEmail: string, input: BatchAssetMetadataInput) {
  return organizationTransaction(ownerEmail, async (tx) => {
    if (input.folderId) await requireFolder(tx, ownerEmail, input.folderId);
    await requireTags(tx, ownerEmail, [...new Set([...(input.addTagIds ?? []), ...(input.removeTagIds ?? [])])]);
    const assets = await tx.mediaAsset.findMany({ where: { ownerEmail, status: "completed", id: { in: input.assets.map((item) => item.id) } }, select: { id: true, version: true } });
    if (assets.length !== input.assets.length) throw new MediaAssetNotFoundError();
    for (const item of input.assets) requireVersion(assets.find((asset) => asset.id === item.id)!.version, item.expectedVersion);
    for (const item of input.assets) {
      const result = await tx.mediaAsset.updateMany({ where: { id: item.id, ownerEmail, status: "completed", version: item.expectedVersion }, data: {
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        ...(input.starred !== undefined ? { starred: input.starred } : {}),
        version: { increment: 1 },
      } });
      if (result.count !== 1) throw new AssetMetadataConflictError("ASSET_VERSION_CONFLICT");
      if (input.removeTagIds?.length) await tx.assetTagAssignment.deleteMany({ where: { ownerEmail, assetId: item.id, tagId: { in: input.removeTagIds } } });
      if (input.addTagIds?.length) await tx.assetTagAssignment.createMany({ data: input.addTagIds.map((tagId) => ({ ownerEmail, assetId: item.id, tagId })), skipDuplicates: true });
    }
  });
}

export const assetOrganizationRepository = { listOrganization, createFolder, updateFolder, deleteFolder, createTag, changeTag, patchAsset, patchBatch };
