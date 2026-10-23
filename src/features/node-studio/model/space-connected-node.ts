import type { CanonicalJsonValue, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import type { RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import { projectGenerationModelSelectionDefaults } from "./generation-model-selection-defaults";
import type { SpaceNewNode } from "./space-editor-command-types";
import type { SpaceInputRuntime } from "./space-editor-inputs";
import { spaceConnectionForPorts, spaceNodePorts, type SpaceModelCatalog } from "./space-editor-ports";
import type { SpaceGenerationModel } from "./space-editor-attachments";
import type { SpaceEditorDocument, SpacePortReference } from "./space-editor-types";

type Model = SpaceGenerationModel | RuntimeLlmModel;
export function spaceGenerationModels(kind: string, catalog: SpaceModelCatalog): readonly Model[] {
  const type = spaceNodeModelType(kind);
  return type === "image" ? catalog.imageModels : type === "video" ? catalog.videoModels ?? []
    : type === "audio" ? catalog.audioModels ?? [] : type === "llm" ? catalog.llmModels ?? [] : [];
}
export function spaceGenerationModelError(kind: string, catalog: SpaceModelCatalog & { isLoading?: boolean; error?: string | null }) {
  const type = spaceNodeModelType(kind);
  if (!type) return null;
  if (catalog.isLoading) return "MODEL_CATALOG_LOADING";
  if (catalog.error) return "MODEL_CATALOG_UNAVAILABLE";
  return spaceGenerationModels(kind, catalog).some(model => model.isActive) ? null
    : type === "llm" ? "ASSISTANT_MODEL_MISSING" : type.toUpperCase() + "_MODEL_MISSING";
}
export function spaceNodeModelType(kind: string | undefined) {
  return kind === "generate.image" ? "image" : kind === "generate.video" ? "video"
    : kind === "generate.audio" ? "audio" : kind === "generate.assistant" ? "llm" : null;
}

export function spaceConnectionNode(node: SpaceNewNode, id = crypto.randomUUID()): CanonicalNode {
  return { id, configVersion: 1, config: defaultConfigForKind(node.kind as CanonicalNodeKind), selectedOutputAssetId: null, ...node };
}

export function spaceConnectionModelConfig(node: CanonicalNode, model: Model): CanonicalJsonValue {
  const base = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
  return (model.type === "llm" ? { ...base, modelKey: model.key }
    : projectGenerationModelSelectionDefaults({}, { ...base, modelKey: model.key, parameters: {} }, [model])) as CanonicalJsonValue;
}

/** Model compatibility probes and the final transaction share the same canonical validation. */
export function prepareConnectedSpaceNode(document: SpaceEditorDocument, port: SpacePortReference, node: CanonicalNode,
  catalog: SpaceModelCatalog, runtime: SpaceInputRuntime = {}, edgeId = crypto.randomUUID()) {
  const candidate = { ...document, nodes: [...document.nodes, node] };
  const source = spaceNodePorts(candidate, port.nodeId, catalog).find(item => item.definition.id === port.portId && item.definition.direction === port.direction);
  if (!source?.connectable) return { valid: false as const, reason: "PORT_UNSUPPORTED" };
  const ports = spaceNodePorts(candidate, node.id, catalog).filter(item => item.connectable && item.visible && item.definition.direction !== port.direction
    && (item.definition.valueType === source.definition.valueType || item.definition.valueType === "media" || source.definition.valueType === "media"));
  let failure: { valid: false; reason: string } = { valid: false, reason: "PORT_UNSUPPORTED" };
  for (const target of ports) {
    const result = spaceConnectionForPorts(candidate, port, { nodeId: node.id, direction: target.definition.direction, portId: target.definition.id }, catalog, edgeId, runtime);
    if (result.valid) return { valid: true as const, document: { ...candidate, edges: [...candidate.edges, result.edge] } };
    failure = result;
  }
  return failure;
}

export function compatibleSpaceConnectionModels(document: SpaceEditorDocument, port: SpacePortReference, node: CanonicalNode,
  catalog: SpaceModelCatalog, runtime: SpaceInputRuntime = {}): Model[] {
  const models = spaceGenerationModels(node.kind, catalog);
  return models.filter(model => model.isActive && prepareConnectedSpaceNode(document, port,
    { ...node, config: spaceConnectionModelConfig(node, model) }, catalog, runtime).valid);
}

export function autoConnectSpaceNode(document: SpaceEditorDocument, port: SpacePortReference, node: CanonicalNode,
  catalog: SpaceModelCatalog & { isLoading?: boolean; error?: string | null }, runtime: SpaceInputRuntime = {}) {
  const unavailable = spaceGenerationModelError(node.kind, catalog);
  if (unavailable) return { valid: false as const, reason: unavailable };
  const direct = prepareConnectedSpaceNode(document, port, node, catalog, runtime);
  const current = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config.modelKey : null;
  if (!spaceNodeModelType(node.kind) || direct.valid && spaceGenerationModels(node.kind, catalog).some(model => model.isActive && model.key === current)) return direct;
  const models = compatibleSpaceConnectionModels(document, port, node, catalog, runtime);
  const chosen = models.find(model => model.isDefault) ?? models[0];
  if (!chosen) {
    // A model can support the input while the graph itself rejects an edit.
    // Preserve those failures instead of claiming there are no compatible models.
    for (const model of spaceGenerationModels(node.kind, catalog).filter(model => model.isActive)) {
      const result = prepareConnectedSpaceNode(document, port, { ...node, config: spaceConnectionModelConfig(node, model) }, catalog, runtime);
      if (!result.valid && result.reason !== "PORT_UNSUPPORTED" && result.reason !== "ATTACHMENT_LIMIT") return result;
    }
    return { valid: false as const, reason: "INPUT_MODEL_UNSUPPORTED" };
  }
  return prepareConnectedSpaceNode(document, port, { ...node, config: spaceConnectionModelConfig(node, chosen) }, catalog, runtime);
}
