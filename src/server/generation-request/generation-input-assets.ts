import type { MediaType } from "@/shared/media-assets/media-asset-contract";
import { prisma } from "@/server/db/prisma";

export type GenerationInputAssetRef = {
  assetId: string;
  field: string;
  sortOrder: number;
  multiple?: boolean;
  generationType?: MediaType;
};

type InputAssetRecord = {
  assetId: string;
  field?: string;
  portId?: string;
  sortOrder?: number;
  multiple?: boolean;
  generationType?: MediaType;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveSortOrder(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function validMediaType(value: unknown): value is MediaType {
  return value === "image" || value === "audio" || value === "video";
}

/** Reads both the new generic refs and the existing Graph port refs. */
export function inputAssetRefsFromSnapshot(
  generationType: MediaType,
  snapshot: unknown,
): GenerationInputAssetRef[] {
  const values = record(snapshot).inputAssets;
  if (!Array.isArray(values)) return [];

  return values.flatMap((value) => {
    const item = record(value) as InputAssetRecord;
    if (typeof item.assetId !== "string" || item.assetId.length === 0) return [];
    const field = typeof item.field === "string" && item.field.length > 0
      ? item.field
      : typeof item.portId === "string" && item.portId.length > 0
        ? item.portId
        : null;
    if (!field) return [];
    return [{
      assetId: item.assetId,
      field,
      sortOrder: positiveSortOrder(item.sortOrder),
      multiple: item.multiple === true,
      generationType: validMediaType(item.generationType)
        ? item.generationType
        : generationType,
    }];
  });
}

export function normalizeGenerationInputAssetRefs(
  generationType: MediaType,
  refs: readonly GenerationInputAssetRef[] | undefined,
) {
  return (refs ?? []).flatMap((ref) => {
    if (!ref || typeof ref.assetId !== "string" || !ref.assetId) return [];
    if (typeof ref.field !== "string" || !ref.field) return [];
    return [{
      assetId: ref.assetId,
      field: ref.field,
      sortOrder: positiveSortOrder(ref.sortOrder),
      multiple: ref.multiple === true,
      generationType: validMediaType(ref.generationType)
        ? ref.generationType
        : generationType,
    }];
  });
}

export function refsForSnapshot(refs: readonly GenerationInputAssetRef[]) {
  return refs.map(({ assetId, field, sortOrder, multiple }) => ({
    assetId,
    field,
    sortOrder,
    ...(multiple ? { multiple: true } : {}),
  }));
}

type GenerationInputAssetClient = {
  generationInputAsset: {
    createMany(args: {
      data: Array<{
        requestId: string;
        generationType: MediaType;
        ownerEmail: string;
        field: string;
        sortOrder: number;
        multiple: boolean;
        assetId: string;
      }>;
      skipDuplicates?: boolean;
    }): Promise<unknown>;
  };
};

/** Links assets after the generation row exists; duplicate retries are safe. */
export async function linkGenerationInputAssets(
  client: GenerationInputAssetClient,
  input: {
    requestId: string;
    generationType: MediaType;
    ownerEmail: string;
    refs: readonly GenerationInputAssetRef[];
  },
) {
  const refs = normalizeGenerationInputAssetRefs(input.generationType, input.refs);
  if (refs.length === 0) return;
  await client.generationInputAsset.createMany({
    data: refs.map((ref) => ({
      requestId: input.requestId,
      generationType: ref.generationType,
      ownerEmail: input.ownerEmail,
      field: ref.field,
      sortOrder: ref.sortOrder,
      multiple: ref.multiple,
      assetId: ref.assetId,
    })),
    skipDuplicates: true,
  });
}

export async function linkGenerationInputAssetsForRequest(input: {
  requestId: string;
  generationType: MediaType;
  ownerEmail: string;
  refs: readonly GenerationInputAssetRef[];
}) {
  return linkGenerationInputAssets(prisma, input);
}
