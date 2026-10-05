"use client";

import { useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { useNodes } from "@xyflow/react";
import { ModelSearchDialog, NodeBananaUpstreamControlPanel } from "@node-banana-runtime/runtime-entry";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import { useSpacePreferences } from "../../hook/use-space-preferences";
import { nodeBananaCatalogModels } from "../../runtime/node-banana/node-banana-model-catalog";
import { record } from "../../model/node-prompt-presets";
import { GenerationNodeParameterControls } from "./generation-node-parameter-controls";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { projectGenerationModelSelectionDefaults } from "../../model/generation-model-selection-defaults";
type NodeBananaUpstreamHostValue = ComponentProps<typeof NodeBananaUpstreamControlPanel>["host"];

/** Generation presenters stay upstream; preset settings are composed in the host. */
export function SpaceGenerationControlPanel({ host }: { host: NodeBananaUpstreamHostValue }) {
  const nodes = useNodes().filter(node => node.selected);
  const node = nodes.length === 1 ? nodes[0] : null;
  const modality = node?.data.canonicalKind === "generate.image" ? "image"
    : node?.data.canonicalKind === "generate.video" ? "video"
    : node?.data.canonicalKind === "generate.audio" ? "audio" : null;
  if (!node || !modality) return <NodeBananaUpstreamControlPanel host={host} />;
  if (host.writable === false) return null;
  const data = { ...node.data, ...host.resolveNodeData?.(node.id) };
  return <GenerationPresetInspector key={node.id} id={node.id} modality={modality} config={record(data.config)} />;
}

export function ImagePresetInspector({ id, config }: { id: string; config: Record<string, unknown> }) {
  return <GenerationPresetInspector id={id} config={config} modality="image" />;
}

export function GenerationPresetInspector({ id, config, modality }: { id: string; config: Record<string, unknown>; modality: "image" | "video" | "audio" }) {
  const authoring = useNodeAuthoring();
  const preferences = useSpacePreferences();
  const availableModels = modality === "image" ? authoring.imageModels : modality === "video" ? authoring.videoModels ?? [] : authoring.audioModels ?? [];
  const model = availableModels.find(model => model.key === config.modelKey);
  const title = modality === "image" ? "이미지 생성 설정" : modality === "video" ? "비디오 생성 설정" : "오디오 생성 설정";
  const parameters = record(config.parameters);
  const [browsing, setBrowsing] = useState(false);
  const writable = authoring.writable !== false;
  const publish = (next: Record<string, unknown>) => authoring.updateCanonicalNodeConfig?.(id, next as CanonicalJsonValue);
  const models = nodeBananaCatalogModels(authoring);

  return typeof document === "undefined" ? null : createPortal(
    <aside data-leesfield-component="GenerationPresetInspector" role="region" aria-label={title}
      className="fixed right-3 top-0 z-[90] flex h-screen items-center pointer-events-none sm:right-6" onPointerDown={event => event.stopPropagation()}>
      <div className="nodrag nopan nowheel pointer-events-auto max-h-[80vh] w-80 max-w-[calc(100vw-24px)] space-y-4 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 p-4 text-neutral-200 shadow-lg">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="space-y-2"><label className="block text-xs text-neutral-400">모델</label>
          <button type="button" disabled={!writable} onClick={() => setBrowsing(true)} className="w-full truncate rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-xs hover:border-neutral-500">{model?.label ?? "모델 선택..."}</button>
        </div>
        {model ? <GenerationNodeParameterControls model={model} values={parameters} disabled={!writable} onChange={next => publish({ ...config, parameters: next })} /> : null}
        <ModelSearchDialog isOpen={browsing} onClose={() => setBrowsing(false)} initialCapabilityFilter={modality}
          hosted={{ hostedModels: models, selectedModelId: model?.key ?? null, disabled: !writable, isLoading: authoring.isLoading, error: authoring.error,
            onRefresh: async () => { if (authoring.refresh) await authoring.refresh(); else authoring.retry(); },
            onTrackModelUsage: model => preferences?.trackModel(model.modelId),
            onHostedModelSelected: next => {
              publish(projectGenerationModelSelectionDefaults(config, { ...config, modelKey: next.id, parameters: {} }, availableModels));
              setBrowsing(false);
            } }} />
      </div>
    </aside>, document.querySelector('[data-node-banana-component="Home"]') ?? document.body);
}
