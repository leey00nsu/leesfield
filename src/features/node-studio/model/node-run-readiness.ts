import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { resolveGraphText } from "@/shared/generation-graph/prompt-constructor";
import type { GraphDocumentV2 } from "@/shared/generation-graph/canonical-graph";
import {
  findNodeDefinition,
  findPortDefinition,
  validateNodeConfig,
} from "@/shared/generation-graph/node-registry";
import {
  getRuntimeVideoParamConfig,
  resolveRuntimeImageMaxInputImages,
  resolveRuntimeVideoSupportsInitImage,
  type RuntimeAudioModel,
  type RuntimeImageModel,
  type RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

import { areGenerationNodeParametersValid } from "./generation-node-parameter-validation";

export type NodeRunReadinessReason =
  | "NODE_NOT_FOUND"
  | "NODE_NOT_EXECUTABLE"
  | "NODE_CONFIG_INVALID"
  | "MODEL_REQUIRED"
  | "PROMPT_REQUIRED"
  | "PARAMETERS_INVALID"
  | "INPUT_REQUIRED"
  | "INPUT_NOT_READY"
  | "INPUT_UNSUPPORTED"
  | "PROCESSOR_UNAVAILABLE";

export type NodeRunReadiness = {
  ready: boolean;
  reasons: NodeRunReadinessReason[];
};

const readinessReasonPriority: readonly NodeRunReadinessReason[] = [
  "NODE_NOT_FOUND",
  "NODE_NOT_EXECUTABLE",
  "NODE_CONFIG_INVALID",
  "MODEL_REQUIRED",
  "PROMPT_REQUIRED",
  "PARAMETERS_INVALID",
  "INPUT_UNSUPPORTED",
  "INPUT_NOT_READY",
  "INPUT_REQUIRED",
  "PROCESSOR_UNAVAILABLE",
];

export function getPrimaryNodeRunReadinessReason(
  readiness: NodeRunReadiness,
): NodeRunReadinessReason | null {
  return readinessReasonPriority.find((reason) => readiness.reasons.includes(reason)) ?? null;
}

export type NodeRunReadinessCatalog = {
  imageModels: readonly RuntimeImageModel[];
  videoModels?: readonly RuntimeVideoModel[];
  audioModels?: readonly RuntimeAudioModel[];
  backgroundRemovalAvailable?: boolean;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function selectedAssetId(node: GraphDocumentV2["nodes"][number]) {
  if (node.kind === "input.image" || node.kind === "input.audio" || node.kind === "input.video") {
    const value = record(node.config).assetId;
    return typeof value === "string" && value.trim() ? value : null;
  }
  return node.selectedOutputAssetId;
}

function sourceReady(
  graph: Pick<GraphDocumentV2, "nodes" | "edges">,
  edge: GraphDocumentV2["edges"][number],
  visited: Set<string> = new Set(),
) {
  const source = graph.nodes.find((node) => node.id === edge.sourceNodeId);
  if (!source) return false;
  if (visited.has(source.id)) return false;
  const nextVisited = new Set(visited).add(source.id);
  const passThroughPort = source.kind === "input.image"
    ? "reference"
    : source.kind === "input.audio"
      ? "audio"
      : source.kind === "input.video"
        ? "video"
        : source.kind === "input.prompt"
          ? "text"
          : null;
  const upstream = passThroughPort
    ? graph.edges.find((candidate) => candidate.targetNodeId === source.id && candidate.targetPortId === passThroughPort)
    : null;
  if (upstream) return sourceReady(graph, upstream, nextVisited);
  const sourcePort = findPortDefinition(source.kind, edge.sourcePortId, "output");
  if (!sourcePort) return false;
  if (sourcePort.valueType === "text") {
    try { return Boolean(resolveGraphText(graph, source.id).trim()); } catch { return false; }
  }
  return Boolean(selectedAssetId(source));
}

function uniqueReasons(reasons: NodeRunReadinessReason[]): NodeRunReadiness {
  const unique = Array.from(new Set(reasons));
  return { ready: unique.length === 0, reasons: unique };
}

export function resolveNodeRunReadiness(
  graph: Pick<GraphDocumentV2, "nodes" | "edges">,
  nodeId: string,
  catalog: NodeRunReadinessCatalog,
): NodeRunReadiness {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return uniqueReasons(["NODE_NOT_FOUND"]);
  const definition = findNodeDefinition(node.kind);
  if (!definition || definition.executionMode === "none") {
    return uniqueReasons(["NODE_NOT_EXECUTABLE"]);
  }

  const reasons: NodeRunReadinessReason[] = [];
  if (!validateNodeConfig(node.kind, node.configVersion, node.config).supported) {
    reasons.push("NODE_CONFIG_INVALID");
  }
  if (node.kind === "edit.image.removeBackground" && !catalog.backgroundRemovalAvailable) {
    reasons.push("PROCESSOR_UNAVAILABLE");
  }

  const config = record(node.config);
  const modelKey = typeof config.modelKey === "string" ? config.modelKey : "";
  const incoming = graph.edges.filter((edge) => edge.targetNodeId === nodeId);
  const readyCounts = new Map<string, number>();

  for (const edge of incoming) {
    if (!sourceReady(graph, edge)) {
      reasons.push("INPUT_NOT_READY");
      continue;
    }
    readyCounts.set(edge.targetPortId, (readyCounts.get(edge.targetPortId) ?? 0) + 1);
  }

  for (const port of definition.ports.filter((candidate) => candidate.direction === "input")) {
    let minimum = port.minConnections;
    if (node.kind === "generate.video" && port.id === "initImage") {
      const model = (catalog.videoModels ?? []).find((candidate) => candidate.key === modelKey);
      minimum = model && resolveRuntimeVideoSupportsInitImage(model) && getRuntimeVideoParamConfig(model, "initImage")?.required
        ? 1
        : 0;
    }
    if ((readyCounts.get(port.id) ?? 0) < minimum) reasons.push("INPUT_REQUIRED");
  }

  if (node.kind.startsWith("generate.")) {
    const promptFromConfig = typeof config.prompt === "string" && Boolean(config.prompt.trim());
    const promptFromEdge = (readyCounts.get("prompt") ?? 0) > 0;
    const selectedModel = [...catalog.imageModels,...(catalog.videoModels??[]),...(catalog.audioModels??[])].find(m=>m.key===modelKey);
    const contract = selectedModel ? getGradioContract(selectedModel) : null;
    const requiresPrompt = !contract || contract.inputs.some(f=>f.canonical==="prompt"&&f.required&&f.default===undefined);
    if (requiresPrompt && !promptFromConfig && !promptFromEdge) reasons.push("PROMPT_REQUIRED");
    if(contract) for(const field of contract.inputs.filter(f=>["file","files","gallery"].includes(f.kind))) {
      const port=`${field.media}-field-${field.name}`;
      const count=readyCounts.get(port)??0;
      const legacy=contract.inputs.filter(f=>["file","files","gallery"].includes(f.kind)&&f.media===field.media).length===1
        ? ["primary","references","initImage"].reduce((sum,p)=>sum+(readyCounts.get(p)??0),0):0;
      const value=record(record(config.parameters).dynamicParams)[field.name]??record(config.parameters)[field.name]??field.default;
      if(field.required && !count && !legacy && value===undefined)reasons.push("INPUT_REQUIRED");
      if((field.kind==="file"&&count>1)||(typeof field.schema.maxItems==="number"&&count>field.schema.maxItems))reasons.push("INPUT_UNSUPPORTED");
    }

    const parameters = record(config.parameters);
    if (node.kind === "generate.image") {
      const model = catalog.imageModels.find((candidate) => candidate.key === modelKey);
      if (!model) {
        reasons.push("MODEL_REQUIRED");
      } else {
        const imageInputs = incoming.filter((edge) => edge.targetPortId === "primary" || edge.targetPortId === "references");
        if (imageInputs.length > resolveRuntimeImageMaxInputImages(model)) reasons.push("INPUT_UNSUPPORTED");
        if (!areGenerationNodeParametersValid(model, parameters)) reasons.push("PARAMETERS_INVALID");
      }
    } else if (node.kind === "generate.video") {
      const model = (catalog.videoModels ?? []).find((candidate) => candidate.key === modelKey);
      if (!model) {
        reasons.push("MODEL_REQUIRED");
      } else {
        const imageInputs = incoming.filter((edge) => edge.targetPortId === "initImage");
        if (imageInputs.length > 0 && !resolveRuntimeVideoSupportsInitImage(model)) reasons.push("INPUT_UNSUPPORTED");
        if (!areGenerationNodeParametersValid(model, parameters)) reasons.push("PARAMETERS_INVALID");
      }
    } else if (node.kind === "generate.audio") {
      const model = (catalog.audioModels ?? []).find((candidate) => candidate.key === modelKey);
      if (!model) {
        reasons.push("MODEL_REQUIRED");
      } else if (!areGenerationNodeParametersValid(model, parameters)) {
        reasons.push("PARAMETERS_INVALID");
      }
    }
  }

  return uniqueReasons(reasons);
}
