import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { parseImageVariants } from "@/shared/media-assets/image-variants";
import { normalizeAssetOrganizationName } from "@/shared/media-assets/asset-organization-contract";
import type { AssetProjectDto, CreateAssetProjectInput, UpdateAssetProjectInput } from "@/shared/media-assets/asset-project-contract";
import { organizationTransaction } from "./asset-organization-repository";
import { AssetOrganizationNotFoundError, AssetMetadataConflictError, MediaAssetNotFoundError } from "./media-asset-errors";

type Tx = Prisma.TransactionClient;
const include = { coverAsset: { select: { id: true, status: true, storageUrl: true, legacyUrl: true, imageVariants: true } } } satisfies Prisma.AssetProjectInclude;
type Row = Prisma.AssetProjectGetPayload<{ include: typeof include }>;
function dto(row: Row): AssetProjectDto {
  const url = row.coverAsset?.storageUrl ?? row.coverAsset?.legacyUrl;
  return {
    id: row.id, name: row.name, description: row.description, parentId: row.parentId,
    version: row.version, coverAssetId: row.coverAssetId,
    cover: row.coverAsset?.status === "completed" && url
      ? { id: row.coverAsset.id, url, imageVariants: parseImageVariants(row.coverAsset.imageVariants) } : null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
async function requireProject(tx: Tx, ownerEmail: string, id: string) {
  const project = await tx.assetProject.findFirst({ where: { id, ownerEmail }, include });
  if (!project) throw new AssetOrganizationNotFoundError();
  return project;
}
function requireVersion(actual: number, expected: number) {
  if (actual !== expected) throw new AssetMetadataConflictError("ASSET_VERSION_CONFLICT");
}
async function validateParent(tx: Tx, ownerEmail: string, id: string | null, parentId: string | null) {
  const projects = await tx.assetProject.findMany({ where: { ownerEmail }, select: { id: true, parentId: true } });
  const parents = new Map(projects.map((project) => [project.id, project.parentId]));
  if (id) parents.set(id, parentId);
  else parents.set("__new__", parentId);
  // Validate every path after a move so descendants cannot exceed the depth limit.
  for (const start of parents.keys()) {
    const seen = new Set<string>();
    let current: string | null = start;
    while (current) {
      if (seen.has(current)) throw new AssetMetadataConflictError("ASSET_PROJECT_CYCLE");
      if (!parents.has(current)) throw new AssetOrganizationNotFoundError();
      seen.add(current);
      if (seen.size > 32) throw new AssetMetadataConflictError("ASSET_PROJECT_DEPTH");
      current = parents.get(current) ?? null;
    }
  }
}
async function validateCover(tx: Tx, ownerEmail: string, assetId: string | null) {
  if (!assetId) return;
  const asset = await tx.mediaAsset.findFirst({ where: {
    id: assetId, ownerEmail, status: "completed", type: "image",
    OR: [{ origin: { not: "media_operation" } }, { sourceOperation: { is: { ownerEmail, status: "completed" } } }],
  }, select: { id: true, storageUrl: true, legacyUrl: true } });
  if (!asset || !(asset.storageUrl ?? asset.legacyUrl)) throw new MediaAssetNotFoundError();
}
export const assetProjectRepository = {
  async list(ownerEmail: string) {
    return (await prisma.assetProject.findMany({ where: { ownerEmail }, include, orderBy: [{ normalizedName: "asc" }, { id: "asc" }] })).map(dto);
  },
  create(ownerEmail: string, input: CreateAssetProjectInput) {
    return organizationTransaction(ownerEmail, async (tx) => {
      await validateParent(tx, ownerEmail, null, input.parentId);
      await validateCover(tx, ownerEmail, input.coverAssetId);
      return dto(await tx.assetProject.create({ data: {
        ...input, ownerEmail, normalizedName: normalizeAssetOrganizationName(input.name), parentKey: input.parentId ?? "root",
      }, include }));
    });
  },
  update(ownerEmail: string, id: string, input: UpdateAssetProjectInput) {
    return organizationTransaction(ownerEmail, async (tx) => {
      const project = await requireProject(tx, ownerEmail, id);
      requireVersion(project.version, input.expectedVersion);
      if (input.parentId !== undefined) await validateParent(tx, ownerEmail, id, input.parentId);
      if (input.coverAssetId !== undefined) await validateCover(tx, ownerEmail, input.coverAssetId);
      return dto(await tx.assetProject.update({ where: { id }, data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.coverAssetId !== undefined ? { coverAssetId: input.coverAssetId } : {}),
        ...(input.name !== undefined ? { normalizedName: normalizeAssetOrganizationName(input.name) } : {}),
        ...(input.parentId !== undefined ? { parentKey: input.parentId ?? "root" } : {}),
        version: { increment: 1 },
      }, include }));
    });
  },
  delete(ownerEmail: string, id: string, expectedVersion: number) {
    return organizationTransaction(ownerEmail, async (tx) => {
      const project = await requireProject(tx, ownerEmail, id);
      requireVersion(project.version, expectedVersion);
      await tx.assetProject.updateMany({ where: { ownerEmail, parentId: id }, data: {
        parentId: project.parentId, parentKey: project.parentId ?? "root", version: { increment: 1 },
      } });
      await tx.mediaAsset.updateMany({ where: { ownerEmail, projectMemberships: { some: { projectId: id, ownerEmail } } }, data: { version: { increment: 1 } } });
      await tx.assetProject.delete({ where: { id } });
    });
  },
};
