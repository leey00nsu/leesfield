"use client";

import { useCanvasTranslation } from "../../leesfield/localization";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Node } from "@xyflow/react";
import type { NodeType, SelectedModel } from "../../leesfield/upstream-node-host";
import { useWorkflowStore, useInlineParameters } from "../../leesfield/upstream-node-host";
import { ModelSearchDialog } from "../modals/ModelSearchDialog";
import { ModelParameters } from "./ModelParameters";
const CONFIGURABLE_NODE_TYPES: NodeType[] = ["nanoBanana", "generateVideo", "generateAudio"];
const GENERATION_NODE_TYPES = CONFIGURABLE_NODE_TYPES;
/**
 * Fixed-position control panel on the right side of viewport
 * Displays controls for the currently selected node
 */
export function ControlPanel() {
  const tc = useCanvasTranslation();
  const selectedNode = useWorkflowStore((state) => {
    const selected = state.nodes.filter((n) => n.selected);
    return selected.length === 1 ? selected[0] : null;
  });
  const { inlineParametersEnabled } = useInlineParameters();
  const writable = useWorkflowStore((state) => state.writable);

  // Check if the selected node is configurable
  const isConfigurable = selectedNode && CONFIGURABLE_NODE_TYPES.includes(selectedNode.type as NodeType);

  // If no single node selected or not configurable, hide panel
  if (!selectedNode || !isConfigurable || writable === false) {
    return null;
  }

  // Check if this is a generation node
  const isGenerationNode = selectedNode &&
    GENERATION_NODE_TYPES.includes(selectedNode.type as NodeType);

  // Hide for generation nodes when inline parameters enabled
  if (isGenerationNode && inlineParametersEnabled) {
    return null;
  }

  return createPortal(
    <div data-node-banana-component="ControlPanel" role="region" aria-label={tc(getNodeTypeTitle(selectedNode.type as NodeType))} className="fixed top-0 right-3 sm:right-6 h-screen z-[90] flex items-center pointer-events-none">
      <div
        className="w-80 max-w-[calc(100vw-24px)] bg-neutral-800 border border-neutral-700 rounded-xl max-h-[80vh] overflow-y-auto pointer-events-auto transition-opacity duration-200 nowheel"
        style={{
          boxShadow: [
            '-1px 0 2px rgba(0,0,0,0.18)',
            '-2px 0 4px rgba(0,0,0,0.15)',
            '-4px 0 8px rgba(0,0,0,0.12)',
            '-8px 0 16px rgba(0,0,0,0.10)',
            '-16px 0 32px rgba(0,0,0,0.08)',
            '-32px 0 64px rgba(0,0,0,0.06)',
          ].join(', '),
        }}
      >
        <div className="p-4">
          {/* Header */}
          <h3 className="text-sm font-medium text-neutral-200">
            {tc(getNodeTypeTitle(selectedNode.type as NodeType))}
          </h3>

          {/* Node-specific controls */}
          <div className="space-y-4 mt-4">
            <HostedGenerationControls key={selectedNode.id} node={selectedNode as unknown as Node} />
          </div>
        </div>
      </div>
    </div>, document.querySelector('[data-node-banana-component="Home"]') ?? document.body
  );
}


function getNodeTypeTitle(type: NodeType): string {
  return type === "nanoBanana" ? "Generate Image Settings" : type === "generateVideo" ? "Generate Video Settings" : "Generate Audio Settings";
}

// Keep the upstream side-panel composition; Leesfield owns catalog and schema.
function HostedGenerationControls({ node }: { node: Node }) {
  const tc = useCanvasTranslation();
  const [browsing, setBrowsing] = useState(false);
  const update = useWorkflowStore((state) => state.updateNodeData);
  const selectedModel = node.data.selectedModel as SelectedModel | undefined;
  const mediaType = node.type === "nanoBanana" ? "image" : node.type === "generateVideo" ? "video" : "audio";
  return <>
    <div className="space-y-2">
      <label className="text-xs text-neutral-400">{tc("Model")}</label>
      <button type="button" onClick={() => setBrowsing(true)} className="w-full px-3 py-2 text-left text-xs bg-neutral-900 border border-neutral-700 rounded-lg hover:border-neutral-500">
        {selectedModel?.displayName || "Browse models"}
      </button>
    </div>
    {selectedModel?.modelId && <ModelParameters key={selectedModel.modelId} modelId={selectedModel.modelId} provider={selectedModel.provider}
      parameters={(node.data.parameters ?? {}) as Record<string, unknown>}
      onParametersChange={(parameters) => update(node.id, { parameters })} />}
    <ModelSearchDialog isOpen={browsing} onClose={() => setBrowsing(false)} initialCapabilityFilter={mediaType}
      onModelSelected={(model) => { update(node.id, { selectedModel: { provider: model.provider, modelId: model.id, displayName: model.name }, parameters: {} }); setBrowsing(false); }} />
  </>;
}
