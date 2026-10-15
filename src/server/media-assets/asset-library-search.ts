import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { ListMediaAssetsInput } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { MediaAssetInputError } from "./media-asset-errors";

export function usesAssetLibraryQuery(input: ListMediaAssetsInput) {
  return input.sort !== undefined || input.query !== undefined || input.folderId !== undefined || input.projectId !== undefined
    || input.classification !== undefined || input.managementStatus !== undefined || input.dateFrom !== undefined || input.dateTo !== undefined || input.model !== undefined
    || input.starred !== undefined || input.tagIds !== undefined || input.cursor?.startsWith("v1.");
}
function filterIdentity(ownerEmail: string, input: ListMediaAssetsInput) {
  return createHash("sha256").update(JSON.stringify({
    ownerEmail, type: input.type ?? null, category: input.category ?? null,
    query: input.query?.normalize("NFC") ?? "", folderId: input.folderId ?? null,
    projectId: input.projectId ?? null,
    classification: input.classification ?? null, managementStatus: input.managementStatus ?? null,
    dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null, model: input.model ?? null,
    starred: input.starred ?? null, tags: [...new Set(input.tagIds ?? [])].sort(), sort: input.sort ?? "latest",
  })).digest("hex");
}
export function encodeAssetCursor(ownerEmail: string, input: ListMediaAssetsInput, asset: {
  id: string; createdAt: Date; type: "image" | "video" | "audio"; displayName?: string | null; originalFileName?: string | null;
}) {
  return "v1." + Buffer.from(JSON.stringify({
    filter: filterIdentity(ownerEmail, input), id: asset.id,
    key: input.sort === "name" ? getMediaAssetName(asset) : asset.createdAt.toISOString(),
  })).toString("base64url");
}

function decodeCursor(ownerEmail: string, input: ListMediaAssetsInput) {
  if (!input.cursor) return null;
  try {
    if (!input.cursor.startsWith("v1.")) throw Error();
    const value = JSON.parse(Buffer.from(input.cursor.slice(3), "base64url").toString("utf8"));
    if (value.filter !== filterIdentity(ownerEmail, input) || typeof value.id !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) || typeof value.key !== "string" || value.key.length > 1024) throw Error();
    if (input.sort !== "name" && !Number.isFinite(new Date(value.key).getTime())) throw Error();
    return value as { id: string; key: string };
  } catch { throw new MediaAssetInputError({ cursor: "INVALID_ASSET_CURSOR" }); }
}

export async function findAssetLibraryIds(ownerEmail: string, input: ListMediaAssetsInput) {
  const cursor = decodeCursor(ownerEmail, input);
  const name = Prisma.sql`COALESCE(NULLIF(a."displayName", ''), NULLIF(a."originalFileName", ''), CASE a.type WHEN 'image' THEN 'Image' WHEN 'video' THEN 'Video' ELSE 'Audio' END || ' ' || to_char(a."createdAt", 'YYYY-MM-DD') || ' ' || a.id)`;
  const conditions = [
    Prisma.sql`a."ownerEmail" = ${ownerEmail}`,
    Prisma.sql`a.status = 'completed'`,
    Prisma.sql`(a.origin <> 'media_operation' OR EXISTS (SELECT 1 FROM "MediaOperation" op WHERE op.id = a."sourceOperationId" AND op."ownerEmail" = ${ownerEmail} AND op.status = 'completed'))`,
  ];
  if (input.type) conditions.push(Prisma.sql`a.type::text = ${input.type}`);
  if (input.category === "uploads") conditions.push(Prisma.sql`a.origin = 'upload'`);
  if (input.category === "edited") conditions.push(Prisma.sql`a.origin = 'media_operation'`);
  if (input.category === "generated") conditions.push(Prisma.sql`a.origin IN ('generation', 'legacy_generation')`);
  if (input.classification === "none") conditions.push(Prisma.sql`a.classification IS NULL`);
  else if (input.classification) conditions.push(Prisma.sql`a.classification = ${input.classification}`);
  if (input.managementStatus === "none") conditions.push(Prisma.sql`a."managementStatus" IS NULL`);
  else if (input.managementStatus) conditions.push(Prisma.sql`a."managementStatus" = ${input.managementStatus}`);
  if (input.dateFrom) conditions.push(Prisma.sql`a."createdAt" >= ${new Date(input.dateFrom)}::timestamp`);
  if (input.dateTo) conditions.push(Prisma.sql`a."createdAt" < ${new Date(input.dateTo)}::timestamp`);
  if (input.model) conditions.push(Prisma.sql`a.origin IN ('generation', 'legacy_generation') AND a.id IN (SELECT models."assetId" FROM (${assetModelRows(ownerEmail)}) models WHERE models."modelKey" = ${input.model})`);
  if (input.folderId === "root") conditions.push(Prisma.sql`a."folderId" IS NULL`);
  else if (input.folderId) conditions.push(Prisma.sql`a."folderId" = ${input.folderId}`);
  if (input.projectId === "root") conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "AssetProjectMembership" m WHERE m."assetId" = a.id AND m."ownerEmail" = ${ownerEmail})`);
  else if (input.projectId) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "AssetProjectMembership" m WHERE m."assetId" = a.id AND m."ownerEmail" = ${ownerEmail} AND m."projectId" = ${input.projectId})`);
  if (input.starred !== undefined) conditions.push(Prisma.sql`a.starred = ${input.starred}`);
  for (const id of new Set(input.tagIds ?? [])) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "AssetTagAssignment" assignment WHERE assignment."assetId" = a.id AND assignment."ownerEmail" = ${ownerEmail} AND assignment."tagId" = ${id})`);
  if (input.query) {
    const query = input.query.normalize("NFC");
    conditions.push(Prisma.sql`(strpos(lower(${name}), lower(${query})) > 0 OR strpos(lower(a.id), lower(${query})) > 0 OR strpos(lower(COALESCE(a."referenceId", '')), lower(${query})) > 0 OR strpos(lower(COALESCE(a."originalFileName", '')), lower(${query})) > 0)`);
  }
  const ascending = input.sort === "oldest" || input.sort === "name";
  const key = input.sort === "name" ? Prisma.sql`(${name}) COLLATE "C"` : Prisma.sql`a."createdAt"`;
  const order = ascending ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  if (cursor) {
    const boundary = input.sort === "name" ? Prisma.sql`${cursor.key}::text COLLATE "C"` : Prisma.sql`${new Date(cursor.key)}::timestamp`;
    conditions.push(ascending
      ? Prisma.sql`(${key}, a.id COLLATE "C") > (${boundary}, ${cursor.id}::text COLLATE "C")`
      : Prisma.sql`(${key}, a.id COLLATE "C") < (${boundary}, ${cursor.id}::text COLLATE "C")`);
  }
  return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT a.id FROM "MediaAsset" a WHERE ${Prisma.join(conditions, " AND ")} ORDER BY ${key} ${order}, a.id COLLATE "C" ${order} LIMIT ${input.limit + 1}`);
}

// Only output provenance counts. Assets used as inputs do not inherit that model.
function assetModelRows(ownerEmail: string) {
  return Prisma.sql`
    SELECT output."assetId", generation."modelKey" FROM "ImageGenerationImage" output
      JOIN "ImageGeneration" generation ON generation.id = output."generationId"
      WHERE generation."ownerEmail" = ${ownerEmail} AND generation."modelKey" IS NOT NULL
    UNION
    SELECT output."assetId", generation."modelKey" FROM "VideoGenerationVideo" output
      JOIN "VideoGeneration" generation ON generation.id = output."generationId"
      WHERE generation."ownerEmail" = ${ownerEmail} AND generation."modelKey" IS NOT NULL
    UNION
    SELECT output."assetId", generation."modelKey" FROM "AudioGenerationAudio" output
      JOIN "AudioGeneration" generation ON generation.id = output."generationId"
      WHERE generation."ownerEmail" = ${ownerEmail} AND generation."modelKey" IS NOT NULL
  `;
}
export async function findAssetModelOptions(ownerEmail: string) {
  const rows = await prisma.$queryRaw<Array<{ modelKey: string }>>(Prisma.sql`
    SELECT DISTINCT models."modelKey" FROM (${assetModelRows(ownerEmail)}) models
    JOIN "MediaAsset" a ON a.id = models."assetId"
    WHERE a."ownerEmail" = ${ownerEmail} AND a.status = 'completed'
      AND a.origin IN ('generation', 'legacy_generation') AND models."modelKey" <> ''
    ORDER BY models."modelKey" ASC
  `);
  return rows.map(row => row.modelKey);
}
