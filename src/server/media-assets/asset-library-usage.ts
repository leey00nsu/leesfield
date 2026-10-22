import { prisma } from "@/server/db/prisma";
import { MediaAssetNotFoundError } from "./media-asset-errors";

export async function getAssetLibraryUsage(ownerEmail: string, assetId: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerEmail },
    select: {
      coveringProjects: { where: { ownerEmail }, select: { id: true } },
      selectedByGraphNodes: { where: { graph: { ownerEmail } }, select: { graphId: true } },
      graphNodeOutputs: { where: { graphNode: { graph: { ownerEmail } } }, select: { graphNode: { select: { graphId: true } } } },
      operationInputs: { where: { operation: { ownerEmail } }, select: { operationId: true, operation: { select: { graphId: true } } } },
      generationInputAssets: { where: { ownerEmail }, select: { requestId: true, generationType: true } },
      assistantInputAssets: { where: { ownerEmail }, select: { executionId: true, execution: { select: { graphId: true } } } },
      sourceOperation: { select: { id: true, ownerEmail: true, graphId: true } },
      imageGenerationImage: { select: { generation: { select: { requestId: true, ownerEmail: true } } } },
      videoGenerationVideo: { select: { generation: { select: { requestId: true, ownerEmail: true } } } },
      audioGenerationAudio: { select: { generation: { select: { requestId: true, ownerEmail: true } } } },
    },
  });
  if (!asset) throw new MediaAssetNotFoundError();
  const configNodes = await prisma.generationGraphNode.findMany({
    where: {
      graph: { ownerEmail },
      OR: [
        { config: { path: ["assetId"], equals: assetId } },
        { kind: "output.gallery", config: { path: ["resultItems"], array_contains: [{ assetId }] } },
      ],
    },
    select: { graphId: true },
  });
  const graphIds = [...new Set([
    ...asset.selectedByGraphNodes.map(({ graphId }) => graphId),
    ...asset.graphNodeOutputs.map(({ graphNode }) => graphNode.graphId),
    ...asset.operationInputs.flatMap(({ operation }) => operation.graphId ? [operation.graphId] : []),
    ...configNodes.map(({ graphId }) => graphId),
    ...(asset.assistantInputAssets ?? []).map(({ execution }) => execution.graphId),
  ])].sort();
  const operationIds = [...new Set(asset.operationInputs.map(({ operationId }) => operationId))].sort();
  const generationRequestIds = [...new Set(asset.generationInputAssets.map(({ requestId }) => requestId))].sort();
  const provenance: Array<{ type: "image" | "video" | "audio" | "edit"; requestId: string; graphId?: string | null }> = [];
  for (const [type, generation] of [
    ["image", asset.imageGenerationImage?.generation],
    ["video", asset.videoGenerationVideo?.generation],
    ["audio", asset.audioGenerationAudio?.generation],
  ] as const) if (generation?.ownerEmail === ownerEmail) provenance.push({ type, requestId: generation.requestId });
  if (asset.sourceOperation?.ownerEmail === ownerEmail) provenance.push({ type: "edit", requestId: asset.sourceOperation.id, graphId: asset.sourceOperation.graphId });
  const projectCoverIds = asset.coveringProjects?.map(({ id }) => id) ?? [];
  const assistantExecutionIds = (asset.assistantInputAssets ?? []).map(({ executionId }) => executionId).sort();
  return { graphIds, operationIds, generationRequestIds, assistantExecutionIds, projectCoverIds, generations: asset.generationInputAssets, provenance, inUse: Boolean(graphIds.length || operationIds.length || generationRequestIds.length || assistantExecutionIds.length || projectCoverIds.length) };
}
