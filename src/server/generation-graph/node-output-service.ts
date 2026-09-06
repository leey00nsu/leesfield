import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import {
  NodeExecutionConfigError,
  NodeExecutionInputResolutionError,
} from "@/server/node-executions/node-execution-errors";
import { findNodeDefinition, findPortDefinition } from "@/shared/generation-graph/node-registry";
import type {
  MediaAssetDto,
  ResolvedNodeAssetsDto,
} from "@/shared/media-assets/media-asset-contract";

import {
  nodeOutputRepository,
  type NodeOutputRepository,
  type StoredDisplayNode,
} from "./node-output-repository";

type Dependencies = {
  repository: NodeOutputRepository;
  resolveAsset: typeof mediaAssetService.get;
};

const supportedKinds = new Set(["output.single", "output.gallery", "inspect.imageCompare"]);

function canonicalKind(node: { kind: string }) {
  return node.kind;
}

function configuredInputAssetId(node: StoredDisplayNode["incomingEdges"][number]["sourceNode"]) {
  const kind = canonicalKind(node);
  if (kind !== "input.image" && kind !== "input.audio" && kind !== "input.video") return null;
  const config = node.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const assetId = (config as Record<string, unknown>).assetId;
  return typeof assetId === "string" && assetId ? assetId : null;
}

function inputPassThroughPort(kind: string) {
  if (kind === "input.image") return "reference";
  if (kind === "input.audio") return "audio";
  if (kind === "input.video") return "video";
  return null;
}

function excludedAssetIds(node: StoredDisplayNode) {
  if (node.kind !== "output.gallery" || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) {
    return new Set<string>();
  }
  const value = (node.config as Record<string, unknown>).excludedAssetIds;
  return new Set(
    Array.isArray(value)
      ? value.filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0)
      : [],
  );
}

async function resolveSourceAssetIds(
  dependencies: Dependencies,
  ownerEmail: string,
  graphId: string,
  edge: StoredDisplayNode["incomingEdges"][number],
  sourceKind: string,
  sourcePortId: string,
  targetValueShape: "single" | "ordered-list",
  visited: Set<string> = new Set(),
): Promise<string[]> {
  const passThroughPort = inputPassThroughPort(sourceKind);
  if (passThroughPort) {
    if (visited.has(edge.sourceNode.id)) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
        edgeId: edge.id,
        reason: "INPUT_PASS_THROUGH_CYCLE",
      });
    }
    const nextVisited = new Set(visited).add(edge.sourceNode.id);
    const sourceNode = await dependencies.repository.getOwnedDisplayNode(ownerEmail, graphId, edge.sourceNode.id);
    const upstreamEdge = sourceNode.id === edge.sourceNode.id
      ? sourceNode.incomingEdges.find((candidate) => candidate.targetPortId === passThroughPort &&
        !(sourceKind === "input.image" && canonicalKind(candidate.sourceNode) === "edit.image.splitGrid"))
      : null;
    if (upstreamEdge) {
      const upstreamKind = canonicalKind(upstreamEdge.sourceNode);
      const upstreamPort = upstreamEdge.sourcePortId;
      const upstreamSourcePort = findPortDefinition(upstreamKind, upstreamPort, "output");
      const passThroughTarget = findPortDefinition(sourceKind, passThroughPort, "input");
      if (!upstreamSourcePort || !passThroughTarget || upstreamSourcePort.valueType !== passThroughTarget.valueType) {
        throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", { edgeId: upstreamEdge.id });
      }
      const assetIds = await resolveSourceAssetIds(
        dependencies,
        ownerEmail,
        graphId,
        upstreamEdge,
        upstreamKind,
        upstreamPort,
        targetValueShape,
        nextVisited,
      );
      return assetIds;
    }
  }
  const inputAssetId = configuredInputAssetId(edge.sourceNode);
  if (inputAssetId) return [inputAssetId];
  const selectedAssetId = edge.sourceNode.selectedOutputAssetId;
  if (!selectedAssetId) return [];
  const outputs = edge.sourceNode.outputs.filter((output) => output.portId === sourcePortId);
  const sourcePort = findPortDefinition(sourceKind, sourcePortId, "output");
  if (sourcePort?.valueShape === "ordered-list" && targetValueShape === "ordered-list" &&
    outputs.some((output) => output.assetId === selectedAssetId)) {
    return outputs.map((output) => output.assetId);
  }
  return [selectedAssetId];
}

export function createNodeOutputService(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    repository: nodeOutputRepository,
    resolveAsset: mediaAssetService.get.bind(mediaAssetService),
    ...overrides,
  };
  return {
    async resolve(ownerEmail: string, graphId: string, nodeId: string): Promise<ResolvedNodeAssetsDto> {
      const node = await dependencies.repository.getOwnedDisplayNode(ownerEmail, graphId, nodeId);
      const kind = canonicalKind(node);
      if (!kind || !supportedKinds.has(kind)) {
        throw new NodeExecutionConfigError({ node: ["NODE_OUTPUT_TYPE_UNSUPPORTED"] });
      }
      const definition = findNodeDefinition(kind);
      if (!definition) throw new NodeExecutionConfigError({ node: ["NODE_OUTPUT_TYPE_UNSUPPORTED"] });
      const hiddenAssetIds = excludedAssetIds(node);

      const groups = await Promise.all(node.incomingEdges.map(async (edge) => {
        const sourceKind = canonicalKind(edge.sourceNode);
        const sourcePortId = edge.sourcePortId;
        const targetPortId = edge.targetPortId;
        const sourcePort = sourceKind && sourcePortId
          ? findPortDefinition(sourceKind, sourcePortId, "output")
          : null;
        const targetPort = targetPortId
          ? findPortDefinition(kind, targetPortId, "input")
          : null;
        if (
          !sourceKind ||
          !sourcePortId ||
          !targetPortId ||
          !sourcePort ||
          !targetPort ||
          (targetPort.valueType !== "media" && targetPort.valueType !== sourcePort.valueType)
        ) {
          throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", { edgeId: edge.id });
        }
        const assetIds = await resolveSourceAssetIds(
          dependencies,
          ownerEmail,
          graphId,
          edge,
          sourceKind,
          sourcePortId,
          targetPort.valueShape,
        );
        const assets = (await Promise.all(
          assetIds.map((assetId) => dependencies.resolveAsset(ownerEmail, assetId)),
        )).filter((asset) => !hiddenAssetIds.has(asset.id));
        if (assets.some((asset) => asset.type !== sourcePort.valueType)) {
          throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", { edgeId: edge.id });
        }
        return { portId: targetPortId, assets };
      }));

      const allAssets = groups.flatMap((group) => group.assets);
      const mediaTypes = new Set(allAssets.map((asset: MediaAssetDto) => asset.type));
      if (kind === "output.gallery" && mediaTypes.size > 1) {
        throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
          reason: "MIXED_MEDIA_GALLERY",
        });
      }
      return {
        nodeId,
        kind: kind as ResolvedNodeAssetsDto["kind"],
        mediaType: mediaTypes.size === 1 ? allAssets[0]?.type ?? null : null,
        groups,
      };
    },
  };
}

export const nodeOutputService = createNodeOutputService();
