"use client";
import { CanvasTextarea } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";

/**
 * Node components for the split-grid cell template editor (the mini canvas).
 * Each card mirrors the real node it will instantiate — same fullBleed card
 * chrome, floating uppercase header, handle ids/positions, and (for the
 * generate node) the same settings surface as GenerateImageNode: gemini
 * controls, external-provider ModelParameters, and the ModelSearchDialog
 * browser for the full multi-provider model catalog.
 */

import { createContext, memo, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  getBezierPath,
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import {
  GEMINI_IMAGE_MODELS,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";
import type {
  AspectRatio,
  LLMModelType,
  LLMProvider,
  ModelType,
  NodeType,
  ProviderModel,
  Resolution,
  SelectedModel,
} from "../../leesfield/upstream-node-host";
import { ModelSearchDialog } from "../modals/ModelSearchDialog";
import { ModelParameters } from "../nodes/ModelParameters";
import { InlineParameterPanel } from "../nodes/InlineParameterPanel";
import { ProviderBadge } from "../nodes/ProviderBadge";
import { getTemplateEntry, getTemplateNodeIcon, type TemplateHandleDef } from "./templateCatalog";

export interface TemplateNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  overrides: Record<string, unknown>;
  isBase: boolean;
  sourceImage?: string | null;
  /** Measured settings-panel height, subtracted when persisting node size */
  _editorPanelHeight?: number;
}

export type TemplateRFNode = Node<TemplateNodeData, "splitGridTemplateNode">;

interface TemplateEditorContextValue {
  setOverrides: (nodeId: string, overrides: Record<string, unknown>) => void;
}

export const TemplateEditorContext = createContext<TemplateEditorContextValue>({
  setOverrides: () => {},
});

/**
 * Editor connection ("noodle") — a curved bezier with a wide invisible hit
 * path, exactly like the main canvas. Deletion is handled the same way too: the
 * modal shows a floating toolbar above the cursor when a noodle is clicked (see
 * SplitGridTemplateModal), so the edge itself carries no inline control.
 */
export function TemplateEditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Wide invisible hit path — makes the noodle easy to click */}
      <path d={edgePath} fill="none" strokeWidth={16} stroke="transparent" className="react-flow__edge-interaction" />
    </>
  );
}

const BASE_ASPECT_RATIOS: AspectRatio[] = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const EXTENDED_ASPECT_RATIOS: AspectRatio[] = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];
const RESOLUTIONS_PRO: Resolution[] = ["1K", "2K", "4K"];
const RESOLUTIONS_NB2: Resolution[] = ["512", "1K", "2K", "4K"];

// Mirrors LLMGenerateNode's provider/model lists
const LLM_PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: "google", label: "Google" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];
const LLM_MODELS: Record<LLMProvider, { value: LLMModelType; label: string }[]> = {
  google: [
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-3-pro-preview", label: "Gemini 3.0 Pro" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  ],
  openai: [
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  ],
  anthropic: [
    { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4.6", label: "Claude Opus 4.6" },
  ],
};

// Same select/slider styling as the main nodes' inline controls
const GEMINI_SELECT_CLASS =
  "nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white";
const SLIDER_CLASS =
  "nodrag nopan w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500";

/**
 * Grows/shrinks the node to follow its settings panel's measured height —
 * the same behavior BaseNode gives inline parameter panels on the main
 * canvas — so panel content is never clipped or scrolled. The measured
 * height is stashed in node data so persistence can subtract it.
 */
function useAutoGrowPanel(nodeId: string) {
  const { setNodes } = useReactFlow();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const height = el.offsetHeight;
      if (height === 0) return;
      const delta = height - lastHeightRef.current;
      if (Math.abs(delta) < 2) return;
      lastHeightRef.current = height;
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== nodeId) return node;
          const currentHeight =
            (node.height as number) ??
            (node.style?.height as number) ??
            node.measured?.height ??
            0;
          const newHeight = currentHeight + delta;
          return {
            ...node,
            height: newHeight,
            style: { ...node.style, height: newHeight },
            data: { ...node.data, _editorPanelHeight: height },
          };
        })
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [nodeId, setNodes]);

  return panelRef;
}

function handleOffset(handle: TemplateHandleDef, index: number, count: number): string {
  if (handle.top) return handle.top;
  if (count <= 1) return "50%";
  return `${Math.round(((index + 1) / (count + 1)) * 100)}%`;
}

function TemplateHandles({ handles, side }: { handles: TemplateHandleDef[]; side: "in" | "out" }) {
  return (
    <>
      {handles.map((handle, index) => (
        <Handle
          key={`${side}-${handle.id}`}
          type={side === "in" ? "target" : "source"}
          position={side === "in" ? Position.Left : Position.Right}
          id={handle.id}
          data-handletype={handle.id}
          title={handle.label}
          style={{ top: handleOffset(handle, index, handles.length), zIndex: 10 }}
        />
      ))}
    </>
  );
}

/** Floating uppercase title above the card — parity with FloatingNodeHeader */
function MiniFloatingHeader({
  title,
  provider,
  right,
}: {
  title: string;
  provider?: SelectedModel["provider"];
  right?: React.ReactNode;
}) {
  return (
    <div className="absolute left-0 right-0 -top-[26px] px-1 py-1 flex items-center justify-between pointer-events-none">
      {/* Title strip doubles as a drag handle (bodies are nodrag). No `nodrag`
          class + pointer-events-auto lets React Flow start a node drag here,
          mirroring the main-canvas FloatingNodeHeader. */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 pl-2 pointer-events-auto cursor-grab active:cursor-grabbing">
        {provider && <ProviderBadge provider={provider} />}
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400 truncate select-none">
          {title}
        </span>
      </div>
      {right && <div className="shrink-0 flex items-center gap-1 pr-1 pointer-events-auto">{right}</div>}
    </div>
  );
}

/** Card chrome — parity with BaseNode's fullBleed variant */
function MiniCard({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`h-full w-full flex flex-col overflow-visible relative rounded-lg bg-neutral-800/50 border border-neutral-700/40 ${
        selected ? "ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/25" : ""
      }`}
    >
      <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
  );
}

function BaseImageBody({ sourceImage }: { sourceImage?: string | null }) {
  const tc = useCanvasTranslation();
  return (
    <div className="relative w-full h-full overflow-clip rounded-lg">
      {sourceImage ? (
        <>
          <img src={sourceImage} alt={tc("Source")} className="w-full h-full object-cover rounded-lg opacity-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-2 py-1 rounded bg-neutral-950/80 text-[10px] text-neutral-300">{tc("One slice of this image per cell")}</span>
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center rounded-lg">
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">{tc("Split image lands here")}</span>
        </div>
      )}
    </div>
  );
}

function PromptBody({ nodeId, overrides }: { nodeId: string; overrides: Record<string, unknown> }) {
  const tc = useCanvasTranslation();
  const { setOverrides } = useContext(TemplateEditorContext);
  const prompt = typeof overrides.prompt === "string" ? overrides.prompt : "";
  return (
    <CanvasTextarea
      value={prompt}
      onChange={(event) => setOverrides(nodeId, { ...overrides, prompt: event.target.value })}
      placeholder={tc("Describe what to generate...")}
      className="nodrag nopan nowheel w-full h-full p-3 text-xs leading-relaxed text-neutral-100 bg-neutral-800 rounded-lg resize-none focus:outline-none placeholder:text-neutral-500"
    />
  );
}

/**
 * Generate node — same settings surface as the main canvas GenerateImageNode:
 * gemini selects, external-provider ModelParameters, ModelSearchDialog browse.
 */
function GenerateBody({ nodeId, overrides }: { nodeId: string; overrides: Record<string, unknown> }) {
  const tc = useCanvasTranslation();
  const { setOverrides } = useContext(TemplateEditorContext);
  const [isParamsExpanded, setIsParamsExpanded] = useState(true);
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);
  const panelRef = useAutoGrowPanel(nodeId);

  // While the browse dialog is open, Escape must close only the dialog — not
  // bubble to the template modal's own close/discard handler
  useEffect(() => {
    if (!isBrowseDialogOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsBrowseDialogOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isBrowseDialogOpen]);

  const selectedModel = overrides.selectedModel as SelectedModel | undefined;
  const catalog = useWorkflowStore((state) => state.hostedModels) ?? [];
  const currentProvider = catalog.find((model) => model.id === selectedModel?.modelId)?.provider ?? selectedModel?.provider ?? "hf_space";
  // Same shape as GenerateImageNode.handleBrowseModelSelect
  const handleBrowseModelSelect = useCallback(
    (model: ProviderModel) => {
      const newSelectedModel: SelectedModel = {
        provider: model.provider,
        modelId: model.id,
        displayName: model.name,
        capabilities: model.capabilities,
      };
      setOverrides(nodeId, { ...overrides, selectedModel: newSelectedModel, parameters: {} });
      setIsBrowseDialogOpen(false);
    },
    [nodeId, overrides, setOverrides]
  );

  const handleParametersChange = useCallback(
    (parameters: Record<string, unknown>) => {
      setOverrides(nodeId, { ...overrides, parameters });
    },
    [nodeId, overrides, setOverrides]
  );

  return (
    <>
      {/* Browse button — parity with the floating header's Browse action */}
      <div className="absolute -top-[26px] right-1 pointer-events-auto z-10">
        <button
          onClick={() => setIsBrowseDialogOpen(true)}
          className="nodrag nopan text-[10px] py-0.5 px-1.5 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded text-neutral-300 transition-colors"
        >{tc("Browse")}</button>
      </div>

      <div className="flex flex-col h-full">
        {/* Preview area — parity with GenerateImageNode's empty state */}
        <div className="relative flex-1 min-h-[64px] overflow-hidden rounded-t-lg">
          <div className="w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center">
            <span className="text-neutral-500 text-[10px]">{tc("Run to generate")}</span>
          </div>
        </div>

        {/* Settings panel in-flow so the selection ring wraps the whole node */}
        <div ref={panelRef} className="shrink-0 rounded-b-lg overflow-hidden">
          <InlineParameterPanel
            expanded={isParamsExpanded}
            onToggle={() => setIsParamsExpanded((prev) => !prev)}
            nodeId={`tmpl-${nodeId}`}
          >
            <div>
          {
            selectedModel?.modelId && (
              <ModelParameters
                modelId={selectedModel.modelId}
                provider={currentProvider}
                parameters={(overrides.parameters as Record<string, unknown>) || {}}
                onParametersChange={handleParametersChange}
              />
            )
          }
            </div>
          </InlineParameterPanel>
        </div>
      </div>

      {/* Model browse dialog — the full multi-provider catalog */}
      {isBrowseDialogOpen && (
        <ModelSearchDialog
          isOpen={isBrowseDialogOpen}
          onClose={() => setIsBrowseDialogOpen(false)}
          onModelSelected={handleBrowseModelSelect}
          initialCapabilityFilter="image"
        />
      )}
    </>
  );
}

/**
 * LLM node — same inline controls as the main canvas LLMGenerateNode:
 * provider, model, temperature, and max tokens.
 */
function GenericBody({ nodeType, description }: { nodeType: NodeType; description: string }) {
  const icon = getTemplateNodeIcon(nodeType);
  return (
    <div className="w-full h-full bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center gap-1.5">
      <span className="text-neutral-600 [&>svg]:w-8 [&>svg]:h-8">{icon}</span>
      <span className="text-xs text-neutral-500 text-center px-4">{description}</span>
    </div>
  );
}

function TemplateNodeComponent({ id, data, selected }: NodeProps<TemplateRFNode>) {
  const tc = useCanvasTranslation();
  const entry = getTemplateEntry(data.nodeType);
  const isGenerate = data.nodeType === "nanoBanana";
  const selectedModel = data.overrides.selectedModel as SelectedModel | undefined;
  const title = isGenerate
    ? selectedModel?.displayName ??
      GEMINI_IMAGE_MODELS.find((m) => m.value === data.overrides.model)?.label ??
      entry.title
    : entry.title;

  return (
    <div className="relative h-full w-full">
      {/* Same invisible-handle resizer as BaseNode on the main canvas */}
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-transparent"
        handleClassName="!w-5 !h-5 !bg-transparent !border-none"
      />
      <MiniFloatingHeader
        title={title}
        provider={isGenerate ? selectedModel?.provider ?? "gemini" : undefined}
        right={
          data.isBase ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">{tc("1 per cell")}</span>
          ) : undefined
        }
      />
      <MiniCard selected={selected}>
        <TemplateHandles handles={entry.inputs} side="in" />
        <TemplateHandles handles={entry.outputs} side="out" />

        {data.isBase ? (
          <BaseImageBody sourceImage={data.sourceImage} />
        ) : data.nodeType === "prompt" ? (
          <PromptBody nodeId={id} overrides={data.overrides} />
        ) : isGenerate ? (
          <GenerateBody nodeId={id} overrides={data.overrides} />

        ) : (
          <GenericBody nodeType={data.nodeType} description={entry.description} />
        )}
      </MiniCard>
    </div>
  );
}

export const SplitGridTemplateNode = memo(TemplateNodeComponent);
