"use client";

import { useCallback, useMemo, useState } from "react";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { useSpacePreferences } from "../hook/use-space-preferences";
import { projectGenerationModelSelectionDefaults } from "../model/generation-model-selection-defaults";
import { createSpaceAuthoringNode, updateSpaceNodeAuthoringConfig } from "../model/space-editor-authoring";
import type { SpaceNewNode } from "../model/space-editor-command-types";
import { useSpaceEditor, useSpaceInputRevision, useSpaceSelector, useSpaceViewSelector, type SpaceEditorScope } from "./space-editor-provider";
import { SpaceModelBrowser, type SpaceBrowserModel } from "./space-model-browser";

type ModelType = "image" | "video" | "audio" | "llm";
export function spaceNodeModelType(kind: string | undefined): ModelType | null {
  return kind === "generate.image" ? "image" : kind === "generate.video" ? "video" : kind === "generate.audio" ? "audio" : kind === "generate.assistant" ? "llm" : null;
}
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
type ModelRequest = { scope: SpaceEditorScope; nodeId?: string; kind?: string; config?: CanonicalJsonValue; revision?: number; epoch: number };

export function useSpaceModelServices(scope: SpaceEditorScope) {
  const [request, setRequest] = useState<ModelRequest | null>(null), preferences = useSpacePreferences();
  const defaults = preferences?.data?.defaults;
  const createNode = useCallback((kind: CanonicalNodeKind, position: { x: number; y: number }): SpaceNewNode => {
    return createSpaceAuthoringNode(kind, position, scope.view.getState().catalog, defaults);
  }, [scope, defaults]);
  const browseModel = useCallback((nodeId?: string) => {
    const state = scope.session.getSnapshot(), node = nodeId ? state.nodeById.get(nodeId) : undefined;
    if (!state.writable || state.disposed || (nodeId && (!node || !spaceNodeModelType(node.kind)))) return;
    setRequest({ scope, nodeId, kind: node?.kind, config: node?.config, revision: nodeId ? scope.inputs.inputRevision(nodeId) : undefined, epoch: scope.view.getState().epoch });
  }, [scope]);
  const close = useCallback(() => setRequest(null), []);
  return useMemo(() => ({ createNode, browseModel, tools: <SpaceModelTools request={request} onClose={close} /> }), [createNode, browseModel, request, close]);
}

function SpaceModelTools({ request, onClose }: { request: ModelRequest | null; onClose: () => void }) {
  const scope = useSpaceEditor(), preferences = useSpacePreferences();
  const writable = useSpaceSelector(state => state.writable), graphId = useSpaceSelector(state => state.id);
  const node = useSpaceSelector(state => request?.nodeId ? state.nodeById.get(request.nodeId) : undefined);
  const catalog = useSpaceViewSelector(state => state.catalog), epoch = useSpaceViewSelector(state => state.epoch);
  const inputRevision = useSpaceInputRevision(request?.nodeId ?? "");
  const models = useMemo<SpaceBrowserModel[]>(() => [...catalog.imageModels, ...(catalog.videoModels ?? []), ...(catalog.audioModels ?? []), ...(catalog.llmModels ?? [])], [catalog]);
  const valid = Boolean(request && request.scope === scope && request.epoch === epoch && writable
    && (!request.nodeId || (node?.kind === request.kind && request.revision === inputRevision)));
  const select = (key: string, type: ModelType) => {
    if (!request || !valid || scope.session.getSnapshot().id !== graphId || !scope.session.getSnapshot().writable) return;
    const chosen = models.find(model => model.key === key && model.type === type && model.isActive);
    if (!chosen || (request.nodeId && spaceNodeModelType(request.kind) !== type)) return;
    if (request.nodeId) {
      if (scope.inputs.inputRevision(request.nodeId) !== request.revision || !request.config) return;
      const base = record(request.config), family = type === "image" ? catalog.imageModels : type === "video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
      const next = type === "llm" ? { ...base, modelKey: key } : projectGenerationModelSelectionDefaults(base, { ...base, modelKey: key, parameters: {} }, family);
      const result = scope.session.transact(document => updateSpaceNodeAuthoringConfig(document, request.nodeId!, request.config!, next as CanonicalJsonValue, catalog), { origin: "user", label: "node.model.select" });
      if (!result.ok) { scope.view.getState().services.onError?.(new Error(result.message)); return; }
    } else {
      const state = scope.session.getSnapshot(), viewport = state.viewport;
      const canvas = document.querySelector("[data-space-canvas]")?.getBoundingClientRect();
      const position = { x: ((canvas?.width ?? innerWidth) / 2 - viewport.x) / viewport.zoom - 160, y: ((canvas?.height ?? innerHeight) / 2 - viewport.y) / viewport.zoom - 140 };
      const kind = `generate.${type === "llm" ? "assistant" : type}` as CanonicalNodeKind;
      const base = defaultConfigForKind(kind), family = type === "image" ? catalog.imageModels : type === "video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
      const config = type === "llm" ? { ...base, modelKey: key } : projectGenerationModelSelectionDefaults({}, { ...base, modelKey: key, parameters: {} }, family);
      const id = crypto.randomUUID(), result = scope.session.dispatch({ type: "node.add", node: { id, kind, position, config: config as CanonicalJsonValue } });
      if (!result.ok) { scope.view.getState().services.onError?.(new Error(result.message)); return; }
      scope.session.select([id]);
    }
    preferences?.trackModel(key); onClose();
  };
  return <SpaceModelBrowser open={valid} onOpenChange={open => { if (!open) onClose(); }} models={models}
    initialType={spaceNodeModelType(request?.kind) ?? undefined} selectedKey={typeof record(node?.config).modelKey === "string" ? String(record(node?.config).modelKey) : null}
    disabled={!writable} loading={catalog.isLoading} error={catalog.error} onRefresh={catalog.refresh ?? catalog.retry}
    recentKeys={preferences?.data?.recentModelKeys} onSelect={select} />;
}
