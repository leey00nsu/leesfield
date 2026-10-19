import { getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import { fileFieldInputPorts, normalizeFileInputAssets, fileInputsFromAssets } from "@/shared/model-catalog/file-input-ports";
import { generationPayload, syncPrimaryTextValue } from "@/shared/model-catalog/generation-payload";
import { cinemaAuthoringBlocked, cinemaAuthoringValidation } from "@/shared/cinema/cinema-authoring";
import { promptPresetRefSchema } from "@/shared/prompt-presets/prompt-preset-contract";
import { promptPresetInputIssue } from "@/shared/prompt-presets/prompt-preset-application";
import { promptPresetReferenceImageCount } from "@/shared/prompt-presets/prompt-preset-input-mode";
import { resolveGraphText } from "@/shared/generation-graph/prompt-constructor";
import type { AssistantResults } from "@/shared/generation-graph/assistant-output";
import { mediaAssetIdsForPort, type MediaOutputBinding } from "@/shared/generation-graph/media-output";
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
  type RuntimeLlmModel,
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
  llmModels?: readonly RuntimeLlmModel[];
  assistantResults?: AssistantResults;
  mediaOutputs?: Readonly<Record<string, readonly MediaOutputBinding[]>>;
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
  assistantResults: AssistantResults = {},
  mediaOutputs: NodeRunReadinessCatalog["mediaOutputs"] = {},
): number {
  const source = graph.nodes.find((node) => node.id === edge.sourceNodeId);
  if (!source) return 0;
  if (visited.has(source.id)) return 0;
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
  const upstream = passThroughPort && !record(source.config).resultSource
    ? graph.edges.find((candidate) => !candidate.hasPause && candidate.targetNodeId === source.id && candidate.targetPortId === passThroughPort && !(source.kind === "input.image" && graph.nodes.find(node=>node.id===candidate.sourceNodeId)?.kind === "edit.image.splitGrid"))
    : null;
  if (upstream) {
    const upstreamSource = graph.nodes.find(node=>node.id===upstream.sourceNodeId);
    const upstreamPort = upstreamSource && findPortDefinition(upstreamSource.kind,upstream.sourcePortId,"output");
    const passPort = findPortDefinition(source.kind,upstream.targetPortId,"input");
    if (!upstreamPort || !passPort || upstreamPort.valueType !== passPort.valueType) return 0;
    return Math.min(sourceReady(graph, upstream, nextVisited, assistantResults, mediaOutputs), 1);
  }
  const sourcePort = findPortDefinition(source.kind, edge.sourcePortId, "output");
  if (!sourcePort) return 0;
  if (sourcePort.valueType === "text") {
    try { return resolveGraphText(graph, source.id, new Set(), assistantResults, edge.sourcePortId).trim() ? 1 : 0; } catch { return 0; }
  }
  return passThroughPort ? (selectedAssetId(source) ? 1 : 0) : mediaAssetIdsForPort(source.kind,
    edge.sourcePortId, source.selectedOutputAssetId, mediaOutputs[source.id]).length;
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
  const incoming = graph.edges.filter((edge) => edge.targetNodeId === nodeId && !edge.hasPause);
  const readyCounts = new Map<string, number>();
  const readyAssets: {portId:string;sortOrder:number;url:string}[] = [];

  for (const edge of incoming) {
    const targetPort = findPortDefinition(node.kind,edge.targetPortId,"input");
    const source = graph.nodes.find(n=>n.id===edge.sourceNodeId);
    const sourcePort = source && findPortDefinition(source.kind,edge.sourcePortId,"output");
    if (!targetPort || !sourcePort || targetPort.valueType !== sourcePort.valueType) { reasons.push("INPUT_UNSUPPORTED"); continue; }
    const sourceCount = sourceReady(graph, edge, new Set(), catalog.assistantResults, catalog.mediaOutputs);
    const count = targetPort.valueShape === "ordered-list" ? sourceCount : Math.min(sourceCount,1);
    if (!count) {
      reasons.push("INPUT_NOT_READY");
      continue;
    }
    if (["image","video","audio"].includes(targetPort.valueType)) for (let index=0;index<count;index++) readyAssets.push({
      portId:edge.targetPortId,sortOrder:/^(image|video|audio)-field-/.test(edge.targetPortId) ? edge.sortOrder+index : (readyCounts.get(edge.targetPortId)??0)+index,
      url:`https://connected.invalid/${edge.id}/${index}`,
    });
    readyCounts.set(edge.targetPortId, (readyCounts.get(edge.targetPortId) ?? 0) + count);
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
    const promptFromEdge = (readyCounts.get(node.kind === "generate.assistant" ? "text" : "prompt") ?? 0) > 0;
    if (node.kind === "generate.assistant") {
      const model = (catalog.llmModels ?? []).find((candidate) => candidate.key === modelKey && candidate.isActive);
      if (!model) reasons.push("MODEL_REQUIRED");
      const visualCount = (readyCounts.get("images") ?? 0) + (readyCounts.get("videos") ?? 0);
      if (visualCount && model && !model.providerConfig.supports_images) reasons.push("INPUT_UNSUPPORTED");
      if (!promptFromConfig && !promptFromEdge && !visualCount) reasons.push("PROMPT_REQUIRED");
      return uniqueReasons(reasons);
    }
    const selectedModel = [...catalog.imageModels,...(catalog.videoModels??[]),...(catalog.audioModels??[])].find(m=>m.key===modelKey && "generate." + m.type === node.kind);
    if ((node.kind === "generate.image" || node.kind === "generate.video") && cinemaAuthoringBlocked(config.cinema, node.kind === "generate.image" ? "image" : "video", selectedModel, typeof record(config.promptPreset).key === "string" ? String(record(config.promptPreset).key) : undefined)) reasons.push("NODE_CONFIG_INVALID");
    const contract = selectedModel ? getGradioContract(selectedModel) : null;
    const authoringPrompt = (node.kind === "generate.image" || node.kind === "generate.video")
      ? cinemaAuthoringValidation({ prompt: typeof config.prompt === "string" ? config.prompt : "" }, config.cinema,
        node.kind === "generate.image" ? "image" : "video", selectedModel).prompt : undefined;
    const requiresPrompt = !contract || contract.inputs.some(f=>f.canonical==="prompt"&&f.required&&!f.allowEmpty&&f.default===undefined);
    if (requiresPrompt && !promptFromConfig && !promptFromEdge && !authoringPrompt?.trim()) reasons.push("PROMPT_REQUIRED");
    const parameters = record(config.parameters);
    let fileInputs: Record<string,(string|null)[]> = {};
    try { if (selectedModel) fileInputs = fileInputsFromAssets(normalizeFileInputAssets(selectedModel,readyAssets)); }
    catch { reasons.push("INPUT_UNSUPPORTED"); }
    if (contract) for (const field of contract.inputs.filter(f=>f.media && ["file","files","gallery"].includes(f.kind))) {
      const count = fileFieldInputPorts(contract, field).reduce((sum,port)=>sum+(readyCounts.get(port)??0),0);
      if ((field.kind === "file" && count > 1) || (typeof field.schema.maxItems === "number" && count > field.schema.maxItems)) reasons.push("INPUT_UNSUPPORTED");
    }
    if (contract && selectedModel) {
      let prompt=typeof config.prompt === "string" ? config.prompt : undefined;
      const promptEdge=incoming.find(e=>e.targetPortId==="prompt" && sourceReady(graph,e,new Set(),catalog.assistantResults,catalog.mediaOutputs));
      if (promptEdge) {
        try {prompt=resolveGraphText(graph,promptEdge.sourceNodeId,new Set(),catalog.assistantResults,promptEdge.sourcePortId);} catch { /* INPUT_NOT_READY is recorded above. */ }
      }
      try {
        const authored = { ...(promptEdge && prompt !== undefined ? syncPrimaryTextValue(selectedModel,parameters,prompt) : parameters), prompt, fileInputs };
        const validation = node.kind === "generate.image" || node.kind === "generate.video"
          ? cinemaAuthoringValidation(authored, config.cinema, node.kind === "generate.image" ? "image" : "video", selectedModel) : authored;
        const payload=generationPayload(selectedModel,validation) as {prompt?:string;dynamicParams?:Record<string,unknown>};
        gradioInputValues(contract,payload);
      } catch (error) {
        const detail=error instanceof Error ? error.message.split(":")[1] : "";
        const field=contract.inputs.find(f=>f.name===detail);
        reasons.push(field?.canonical ? "PROMPT_REQUIRED" : field && ["file","files","gallery"].includes(field.kind) ? "INPUT_REQUIRED" : "PARAMETERS_INVALID");
      }
    }
    const preset = promptPresetRefSchema.safeParse(config.promptPreset);
    if (preset.success && !promptPresetReferenceImageCount(preset.data)
      && incoming.some(edge => findPortDefinition(node.kind, edge.targetPortId, "input")?.valueType !== "text")) {
      reasons.push("INPUT_UNSUPPORTED");
    }
    if (selectedModel && preset.success) {
      const images = (readyCounts.get("primary") ?? 0) + (readyCounts.get("references") ?? 0);
      const issue = promptPresetInputIssue(selectedModel, { ...parameters, fileInputs,
        initImages: Array(images).fill("connected:image"), initImage: readyCounts.get("initImage") ? "connected:image" : "" }, preset.data);
      if (issue) reasons.push(issue === "referenceRequired" ? "INPUT_REQUIRED" : "INPUT_UNSUPPORTED");
    }
    if (node.kind === "generate.image") {
      const model = catalog.imageModels.find((candidate) => candidate.key === modelKey);
      if (!model) {
        reasons.push("MODEL_REQUIRED");
      } else {
        const imageInputs = incoming.filter((edge) => edge.targetPortId === "primary" || edge.targetPortId === "references");
        if (!contract && imageInputs.length > resolveRuntimeImageMaxInputImages(model)) reasons.push("INPUT_UNSUPPORTED");
        if (!areGenerationNodeParametersValid(model, parameters)) reasons.push("PARAMETERS_INVALID");
      }
    } else if (node.kind === "generate.video") {
      const model = (catalog.videoModels ?? []).find((candidate) => candidate.key === modelKey);
      if (!model) {
        reasons.push("MODEL_REQUIRED");
      } else {
        const imageInputs = incoming.filter((edge) => edge.targetPortId === "initImage");
        if (!contract && imageInputs.length > 0 && !resolveRuntimeVideoSupportsInitImage(model)) reasons.push("INPUT_UNSUPPORTED");
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
