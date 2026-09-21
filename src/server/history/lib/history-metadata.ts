import type { Prisma } from "@prisma/client";

export type HistoryMetadata = {
  graphId?: string;
  graphNodeId?: string;
  referenceText?: string;
  sourceAssetIds?: string[];
};

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedMetadataText(value: unknown) {
  const normalized = nonEmptyString(value);
  return normalized ? normalized.slice(0, 4_000) : null;
}

function assetIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const assetId = nonEmptyString(
      typeof entry === "string" ? entry : recordObject(entry).assetId,
    );
    return assetId ? [assetId] : [];
  });
}

/**
 * Stores only the small fields needed by history cards. The request snapshot
 * remains the source for detail/reuse, while list queries can omit it.
 */
export function historyMetadataFromRequest(
  value: unknown,
): Prisma.InputJsonObject | null {
  const request = recordObject(value);
  const metadata: Record<string, unknown> = {};
  const graphId = nonEmptyString(request.graphId);
  const graphNodeId = nonEmptyString(request.graphNodeId);
  const referenceText = boundedMetadataText(request.referenceText);
  const sourceAssetIds = Array.from(
    new Set([
      ...assetIds(request.inputAssets),
      ...assetIds(request.sourceAssetIds),
    ]),
  );

  if (graphId) metadata.graphId = graphId;
  if (graphNodeId) metadata.graphNodeId = graphNodeId;
  if (referenceText) metadata.referenceText = referenceText;
  if (sourceAssetIds.length > 0) metadata.sourceAssetIds = sourceAssetIds;

  return Object.keys(metadata).length > 0
    ? (metadata as Prisma.InputJsonObject)
    : null;
}

export function readHistoryMetadata(value: unknown): HistoryMetadata {
  const metadata = recordObject(value);
  const sourceAssetIds = Array.from(
    new Set([
      ...assetIds(metadata.sourceAssetIds),
      ...assetIds(metadata.inputAssets),
    ]),
  );
  const result: HistoryMetadata = {};
  const graphId = nonEmptyString(metadata.graphId);
  const graphNodeId = nonEmptyString(metadata.graphNodeId);
  const referenceText = boundedMetadataText(metadata.referenceText);

  if (graphId) result.graphId = graphId;
  if (graphNodeId) result.graphNodeId = graphNodeId;
  if (referenceText) result.referenceText = referenceText;
  if (sourceAssetIds.length > 0) result.sourceAssetIds = sourceAssetIds;

  return result;
}
