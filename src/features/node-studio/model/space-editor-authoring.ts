import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import type { SpaceEditorDocument } from "./space-editor-types";
import { spaceEditorValueEqual } from "./space-editor-history";
import { reconcileSpaceModelEdges, type SpaceModelCatalog } from "./space-editor-ports";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { validSpaceDefaultParameters, type SpaceDefaults } from "@/shared/generation-graph/space-preferences";
import type { SpaceNewNode, SpacePosition } from "./space-editor-command-types";
import { projectGenerationModelSelectionDefaults } from "./generation-model-selection-defaults";
import { cinemaAuthoringSettingsSchema, cinemaImageAuthoringSettingsSchema, readCinemaSettings } from "@/shared/cinema/cinema-contract";

function object(value: CanonicalJsonValue | undefined): value is Record<string, CanonicalJsonValue> {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}
export function createSpaceAuthoringNode(kind: CanonicalNodeKind, position: SpacePosition, catalog: SpaceModelCatalog, defaults?: SpaceDefaults): SpaceNewNode {
  const modality = kind === "generate.image" ? "image" : kind === "generate.video" ? "video" : kind === "generate.audio" ? "audio" : null;
  const models = modality === "image" ? catalog.imageModels : modality === "video" ? catalog.videoModels ?? [] : modality === "audio" ? catalog.audioModels ?? [] : [];
  const saved = modality ? defaults?.[modality] : undefined;
  const model = saved && models.find(candidate => candidate.isActive && candidate.key === saved.modelKey && validSpaceDefaultParameters(candidate.parameters, saved.parameters));
  const config = defaultConfigForKind(kind);
  return { kind, position, config: model && saved ? projectGenerationModelSelectionDefaults({}, { ...config, modelKey: model.key, parameters: saved.parameters }, models) as CanonicalJsonValue : config };
}

/** Apply only authored differences; unrelated late config fields stay current. */
function mergeChanges(before: CanonicalJsonValue, requested: CanonicalJsonValue, current: CanonicalJsonValue): CanonicalJsonValue {
  if (spaceEditorValueEqual(before, requested)) return current;
  if (!object(before) || !object(requested) || !object(current)) return requested;
  const next = { ...current };
  for (const key of new Set([...Object.keys(before), ...Object.keys(requested)])) {
    if (!Object.hasOwn(requested, key)) { delete next[key]; continue; }
    if (Object.hasOwn(before, key) && spaceEditorValueEqual(before[key], requested[key])) continue;
    const value = !Object.hasOwn(before, key) && object(requested[key]) && object(current[key])
      ? mergeChanges({}, requested[key], current[key])
      : Object.hasOwn(before, key) && Object.hasOwn(current, key) ? mergeChanges(before[key], requested[key], current[key]) : requested[key];
    Object.defineProperty(next, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return next;
}

export function updateSpaceNodeAuthoringConfig(document: SpaceEditorDocument, nodeId: string, renderedConfig: CanonicalJsonValue,
  requestedConfig: CanonicalJsonValue, catalog: SpaceModelCatalog): SpaceEditorDocument {
  const node = document.nodes.find(node => node.id === nodeId);
  if (!node) throw new Error("NODE_NOT_FOUND");
  const base = object(renderedConfig) ? renderedConfig : {}, requested = object(requestedConfig) ? requestedConfig : {};
  const current = object(node.config) ? node.config : {};
  if (current.modelKey !== base.modelKey) throw new Error("INPUT_TARGET_CHANGED");
  let config = mergeChanges(renderedConfig, requestedConfig, node.config);
  if (object(config) && (node.kind === "generate.image" || node.kind === "generate.video")
    && Object.hasOwn(requested, "cinema") && !spaceEditorValueEqual(base.cinema, requested.cinema)) {
    // Controls emit complete current settings, including implicit defaults. Diff
    // their effective values so stale snapshots neither reset another control
    // nor retain legacy-only fields in a current-version settings object.
    const schema = node.kind === "generate.image" ? cinemaImageAuthoringSettingsSchema : cinemaAuthoringSettingsSchema;
    const settings = schema.parse(requested.cinema);
    const before = readCinemaSettings(base.cinema), latest = readCinemaSettings(current.cinema);
    config = { ...config, cinema: before.status === "unsupported" || latest.status === "unsupported" ? settings
      : schema.parse(mergeChanges(before.settings, settings, latest.settings)) };
  }
  const modelChanged = requested.modelKey !== base.modelKey;
  if (modelChanged && object(config) && ["generate.image", "generate.audio", "generate.video"].includes(node.kind)) {
    // Switching model intentionally resets its parameter namespace. A late option
    // from the previous model cannot be retained as a newly supported parameter.
    config = { ...config, parameters: requested.parameters ?? {} };
  }
  if (spaceEditorValueEqual(config, node.config)) return document;
  const edges = modelChanged ? reconcileSpaceModelEdges(document, nodeId, config, catalog) : document.edges;
  return { ...document, edges: edges === document.edges ? document.edges : [...edges], nodes: document.nodes.map(candidate => candidate.id === nodeId ? { ...candidate, config } : candidate) };
}
