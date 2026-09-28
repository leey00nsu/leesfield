"use client";

import { useCanvasTranslation } from "../leesfield/localization";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useWorkflowStore } from "../leesfield/upstream-node-host";
import { useShallow } from "zustand/shallow";
import { type NodeType, type ProviderType } from "../leesfield/upstream-node-host";
import { useReactFlow } from "@xyflow/react";
import { ModelSearchDialog } from "./modals/ModelSearchDialog";

type TutorialStep = { id?: string; [key: string]: unknown };

// The hosted runtime renders the prop-driven action bar below. Keep the
// upstream standalone tutorial path importable without pulling in the app's
// FTUX Zustand store, which is not part of the host bundle.
const useFTUXStore = {
  subscribe: (listener: (state: {
    tutorialActive: boolean;
    lockedFeatures: boolean;
    currentTutorialStep: number;
    tutorialSteps: TutorialStep[];
  }) => void) => {
    void listener;
    return () => undefined;
  },
  getState: () => ({
    tutorialActive: false,
    lockedFeatures: false,
    currentTutorialStep: 0,
    tutorialSteps: [] as TutorialStep[],
  }),
};

type StandaloneWorkflowNode = {
  id: string;
  type?: string;
  selected?: boolean;
  data?: { customTitle?: string };
};

type StandaloneWorkflowState = {
  nodes: StandaloneWorkflowNode[];
  isRunning: boolean;
  currentNodeIds: string[];
  executeWorkflow: (nodeId?: string) => void;
  regenerateNode: (nodeId: string) => void;
  executeSelectedNodes: (nodeIds: string[]) => void;
  stopWorkflow: () => void;
  mockTutorialExecution: () => void;
  validateWorkflow: () => { valid: boolean; errors: string[] };
  edgeStyle: "angular" | "curved";
  setEdgeStyle: (style: "angular" | "curved") => void;
  setModelSearchOpen: (open: boolean) => void;
  modelSearchOpen: boolean;
  modelSearchProvider?: ProviderType | null;
};

const useStandaloneWorkflowStore = useWorkflowStore as unknown as <T>(
  selector: (state: StandaloneWorkflowState) => T,
) => T;

// All nodes menu categories
const ALL_NODES_CATEGORIES: { label: string; nodes: { type: NodeType; label: string }[] }[] = [
  {
    label: "Input",
    nodes: [
      { type: "imageInput", label: "Image Input" },
      { type: "audioInput", label: "Audio Input" },
      { type: "videoInput", label: "Video Input" },
      { type: "glbViewer", label: "3D Viewer" },
    ],
  },
  {
    label: "Text",
    nodes: [
      { type: "prompt", label: "Prompt" },
      { type: "promptConstructor", label: "Prompt Constructor" },
      { type: "array", label: "Array" },
    ],
  },
  {
    label: "Generate",
    nodes: [
      { type: "nanoBanana", label: "Generate Image" },
      { type: "generateVideo", label: "Generate Video" },
      { type: "generate3d", label: "Generate 3D" },
      { type: "generateAudio", label: "Generate Audio" },
      { type: "llmGenerate", label: "LLM Generate" },
    ],
  },
  {
    label: "Process",
    nodes: [
      { type: "annotation", label: "Annotate" },
      { type: "splitGrid", label: "Split Grid" },
      { type: "videoStitch", label: "Video Stitch" },
      { type: "videoTrim", label: "Video Trim" },
      { type: "easeCurve", label: "Ease Curve" },
      { type: "videoFrameGrab", label: "Frame Grab" },
      { type: "removeBackground", label: "Remove Background" },
      { type: "imageCompare", label: "Image Compare" },
    ],
  },
  {
    label: "Route",
    nodes: [
      { type: "router", label: "Router" },
      { type: "switch", label: "Switch" },
      { type: "conditionalSwitch", label: "Conditional Switch" },
    ],
  },
  {
    label: "Output",
    nodes: [
      { type: "output", label: "Output" },
      { type: "outputGallery", label: "Output Gallery" },
    ],
  },
];

// Get the center of the React Flow pane in screen coordinates
function getPaneCenter() {
  const pane = document.querySelector('.react-flow');
  if (pane) {
    const rect = pane.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

interface NodeButtonProps {
  type: NodeType;
  label: string;
  dataTutorial?: string;
}

function NodeButton({ type, label, dataTutorial }: NodeButtonProps) {
  const addNode = useWorkflowStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const handleClick = () => {
    const center = getPaneCenter();
    const position = screenToFlowPosition({
      x: center.x,
      y: center.y,
    });

    // Nodes are created empty - tutorial will populate after connection
    addNode(type, position);
  };

  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("application/node-type", type);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <button
      onClick={handleClick}
      draggable
      onDragStart={handleDragStart}
      data-tutorial={dataTutorial}
      className="px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 rounded transition-colors cursor-grab active:cursor-grabbing"
    >
      {label}
    </button>
  );
}

function GenerateComboButton() {
  const tc = useCanvasTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const addNode = useWorkflowStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleAddNode = (type: NodeType) => {
    const center = getPaneCenter();
    const position = screenToFlowPosition({
      x: center.x + Math.random() * 100 - 50,
      y: center.y + Math.random() * 100 - 50,
    });

    addNode(type, position);
    setIsOpen(false);
  };

  const handleDragStart = (event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData("application/node-type", type);
    event.dataTransfer.effectAllowed = "copy";
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 rounded transition-colors flex items-center gap-1"
      >{tc("Generate")}<svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
          <button
            onClick={() => handleAddNode("nanoBanana")}
            draggable
            onDragStart={(e) => handleDragStart(e, "nanoBanana")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-grab active:cursor-grabbing"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>{tc("Image")}</button>
          <button
            onClick={() => handleAddNode("generateVideo")}
            draggable
            onDragStart={(e) => handleDragStart(e, "generateVideo")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-grab active:cursor-grabbing"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>{tc("Video")}</button>
          <button
            onClick={() => handleAddNode("generate3d")}
            draggable
            onDragStart={(e) => handleDragStart(e, "generate3d")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-grab active:cursor-grabbing"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            3D
          </button>
          <button
            onClick={() => handleAddNode("llmGenerate")}
            draggable
            onDragStart={(e) => handleDragStart(e, "llmGenerate")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-grab active:cursor-grabbing"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>{tc("Text (LLM)")}</button>
        </div>
      )}
    </div>
  );
}


function AllNodesMenu() {
  const tc = useCanvasTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const addNode = useWorkflowStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleAddNode = useCallback((type: NodeType) => {
    const center = getPaneCenter();
    const position = screenToFlowPosition({
      x: center.x + Math.random() * 100 - 50,
      y: center.y + Math.random() * 100 - 50,
    });

    addNode(type, position);
    setIsOpen(false);
  }, [addNode, screenToFlowPosition]);

  const handleDragStart = useCallback((event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData("application/node-type", type);
    event.dataTransfer.effectAllowed = "copy";
    setIsOpen(false);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 rounded transition-colors flex items-center gap-1"
      >{tc("All nodes")}<svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl overflow-hidden min-w-[180px] max-h-[400px] overflow-y-auto">
          {ALL_NODES_CATEGORIES.map((category, catIndex) => (
            <div key={tc(category.label)}>
              <div className={`px-3 py-1 text-[10px] text-neutral-500 uppercase tracking-wide${catIndex > 0 ? " border-t border-neutral-700" : ""}`}>
                {tc(category.label)}
              </div>
              {category.nodes.map((node) => (
                <button
                  key={node.type}
                  onClick={() => handleAddNode(node.type)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                  className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-grab active:cursor-grabbing"
                >
                  {tc(node.label)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type FloatingActionBarHostedItem = {
  kind: string;
  label: string;
  description?: string;
  mediaType?: "text" | "image" | "audio" | "video" | "media";
  category?: "Input" | "Text" | "Generate" | "Process" | "Output";
};

export type FloatingActionBarHostedProps = {
  ariaLabel?: string;
  writable: boolean;
  items: readonly FloatingActionBarHostedItem[];
  selectedNodeCount: number;
  runEnabled: boolean;
  onAddItem: (item: FloatingActionBarHostedItem) => void;
  onBrowseModels: () => void;
  onRunSelected: () => void;
  edgeStyle: "angular" | "curved";
  onToggleEdgeStyle: () => void;
};

export type FloatingActionBarProps = {
  /** Explicit host dependencies. Omit to retain the standalone store-backed bar. */
  hosted?: FloatingActionBarHostedProps;
};

function HostedFloatingActionBar({
  ariaLabel = "Node Banana Canvas",
  writable,
  items,
  selectedNodeCount,
  runEnabled,
  onAddItem,
  onBrowseModels,
  onRunSelected,
  edgeStyle,
  onToggleEdgeStyle,
}: FloatingActionBarHostedProps) {
  const tc = useCanvasTranslation();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [allNodesOpen, setAllNodesOpen] = useState(false);
  const generateRef = useRef<HTMLDivElement>(null);
  const allNodesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!generateOpen && !allNodesOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!generateRef.current?.contains(target)) setGenerateOpen(false);
      if (!allNodesRef.current?.contains(target)) setAllNodesOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = generateOpen ? generateRef.current : allNodesRef.current;
      setGenerateOpen(false);
      setAllNodesOpen(false);
      active?.querySelector("button")?.focus();
    };
    // Capture also sees events that React Flow stops while panning/selecting.
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [generateOpen, allNodesOpen]);
  const buttonClass = "node-banana-runtime__action";
  const find = (kind: string) => items.find((item) => item.kind === kind);
  const add = (kind: string) => {
    const item = find(kind);
    if (item) onAddItem(item);
    setGenerateOpen(false);
    setAllNodesOpen(false);
  };
  const categoryFor = (item: FloatingActionBarHostedItem) => item.category ?? (
    item.kind.startsWith("input.") ? (item.kind === "input.prompt" ? "Text" : "Input")
      : item.kind.startsWith("generate.") ? "Generate"
        : item.kind.startsWith("output.") ? "Output"
          : "Process"
  );
  const categories = ["Input", "Text", "Generate", "Process", "Output"] as const;
  const handleDragStart = (event: React.DragEvent, item: FloatingActionBarHostedItem) => {
    event.dataTransfer.setData("application/node-type", item.kind);
    event.dataTransfer.effectAllowed = "copy";
    setGenerateOpen(false);
    setAllNodesOpen(false);
  };

  return (
    <div
      className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 node-banana-runtime__floating-bar"
      role="toolbar"
      aria-label={ariaLabel}
      data-node-banana-component="FloatingActionBar"
    >
      <button
        className={buttonClass}
        type="button"
        onClick={() => add("input.image")}
        draggable={Boolean(find("input.image"))}
        onDragStart={(event) => {
          const item = find("input.image");
          if (item) handleDragStart(event, item);
        }}
        disabled={!writable || !find("input.image")}
        data-tutorial="image-button"
      >{tc("Image")}</button>
      <button
        className={buttonClass}
        type="button"
        onClick={() => add("input.video")}
        draggable={Boolean(find("input.video"))}
        onDragStart={(event) => {
          const item = find("input.video");
          if (item) handleDragStart(event, item);
        }}
        disabled={!writable || !find("input.video")}
      >{tc("Video")}</button>
      <button
        className={buttonClass}
        type="button"
        onClick={() => add("input.prompt")}
        draggable={Boolean(find("input.prompt"))}
        onDragStart={(event) => {
          const item = find("input.prompt");
          if (item) handleDragStart(event, item);
        }}
        disabled={!writable || !find("input.prompt")}
        data-tutorial="prompt-button"
      >{tc("Prompt")}</button>
      <div ref={generateRef} className="node-banana-runtime__popover-anchor">
        <button
          className={buttonClass}
          type="button"
          onClick={() => { setAllNodesOpen(false); setGenerateOpen((open) => !open); }}
          disabled={!writable}
          aria-expanded={generateOpen}
        >{tc("Generate")}<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 15 7-7 7 7" /></svg>
        </button>
        {generateOpen ? (
          <div className="node-banana-runtime__quick-menu">
            {items.filter((item) => item.kind.startsWith("generate.")).map((item) => (
              <button
                key={item.kind}
                type="button"
                draggable
                onClick={() => add(item.kind)}
                onDragStart={(event) => handleDragStart(event, item)}
              >
                {tc(item.label)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        className={buttonClass}
        type="button"
        onClick={() => add("output.single")}
        draggable={Boolean(find("output.single"))}
        onDragStart={(event) => {
          const item = find("output.single");
          if (item) handleDragStart(event, item);
        }}
        disabled={!writable || !find("output.single")}
        data-tutorial="output-button"
      >{tc("Output")}</button>
      <div ref={allNodesRef} className="node-banana-runtime__popover-anchor">
        <button
          className={buttonClass}
          type="button"
          onClick={() => { setGenerateOpen(false); setAllNodesOpen((open) => !open); }}
          disabled={!writable}
          aria-expanded={allNodesOpen}
        >{tc("All nodes")}<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 15 7-7 7 7" /></svg>
        </button>
        {allNodesOpen ? (
          <div className="node-banana-runtime__all-nodes-menu" role="menu" aria-label={tc("All nodes")} data-node-banana-component="AllNodesMenu">
            {categories.map((category, categoryIndex) => {
              const categoryItems = items.filter((item) => categoryFor(item) === category);
              if (!categoryItems.length) return null;
              return (
                <section key={category}>
                  <h3 className={categoryIndex > 0 ? "node-banana-runtime__section-heading--divided" : undefined}>{tc(category)}</h3>
                  {categoryItems.map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      role="menuitem"
                      draggable
                      onClick={() => add(item.kind)}
                      onDragStart={(event) => handleDragStart(event, item)}
                    >
                      {tc(item.label)}
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
      <span className="node-banana-runtime__separator" aria-hidden="true" />
      <button className={buttonClass} type="button" onClick={onBrowseModels} disabled={!writable} title={tc("Browse models")}>{tc("All models")}</button>
      <span className="node-banana-runtime__separator" aria-hidden="true" />
      <button
        className="node-banana-runtime__icon-action"
        type="button"
        onClick={onToggleEdgeStyle}
        disabled={!writable}
        aria-label={tc(edgeStyle === "angular" ? "Switch to curved connectors" : "Switch to angular connectors")}
        title={tc(edgeStyle === "angular" ? "Switch to curved connectors" : "Switch to angular connectors")}
      >
        {edgeStyle === "angular" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h4l4-8 4 8h4" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12c0 0 4-8 8-8s8 8 8 8" /></svg>
        )}
      </button>
      <span className="node-banana-runtime__separator" aria-hidden="true" />
      <div className="node-banana-runtime__run-group">
        <button
          type="button"
          onClick={onRunSelected}
          disabled={!writable || selectedNodeCount !== 1 || !runEnabled}
          title={!runEnabled ? tc("Select a runnable node first") : tc("Run selected node")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="node-banana-runtime__play"><path d="m8 5 11 7-11 7z" /></svg>{tc("Run")}</button>
        <button type="button" disabled aria-label={tc("Run options")}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 9 7 7 7-7" /></svg>
        </button>
      </div>
    </div>
  );
}

function StandaloneFloatingActionBar() {
  const tc = useCanvasTranslation();
  const {
    nodes,
    isRunning,
    currentNodeIds,
    executeWorkflow,
    regenerateNode,
    executeSelectedNodes,
    stopWorkflow,
    mockTutorialExecution,
    validateWorkflow,
    edgeStyle,
    setEdgeStyle,
    setModelSearchOpen,
    modelSearchOpen,
    modelSearchProvider,
  } = useStandaloneWorkflowStore(useShallow((state) => ({
    nodes: state.nodes,
    isRunning: state.isRunning,
    currentNodeIds: state.currentNodeIds,
    executeWorkflow: state.executeWorkflow,
    regenerateNode: state.regenerateNode,
    executeSelectedNodes: state.executeSelectedNodes,
    stopWorkflow: state.stopWorkflow,
    mockTutorialExecution: state.mockTutorialExecution,
    validateWorkflow: state.validateWorkflow,
    edgeStyle: state.edgeStyle,
    setEdgeStyle: state.setEdgeStyle,
    setModelSearchOpen: state.setModelSearchOpen,
    modelSearchOpen: state.modelSearchOpen,
    modelSearchProvider: state.modelSearchProvider,
  })));

  // FTUX tutorial state (client-side only to avoid SSR hydration issues)
  const [tutorialActive, setTutorialActive] = useState(false);
  const [lockedFeatures, setLockedFeatures] = useState(false);
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>([]);

  useEffect(() => {
    // Subscribe to FTUX store on client-side only
    const unsubscribe = useFTUXStore.subscribe((state) => {
      setTutorialActive(state.tutorialActive);
      setLockedFeatures(state.lockedFeatures);
      setCurrentTutorialStep(state.currentTutorialStep);
      setTutorialSteps(state.tutorialSteps);
    });

    // Initialize with current state
    const currentState = useFTUXStore.getState();
    setTutorialActive(currentState.tutorialActive);
    setLockedFeatures(currentState.lockedFeatures);
    setCurrentTutorialStep(currentState.currentTutorialStep);
    setTutorialSteps(currentState.tutorialSteps);

    return unsubscribe;
  }, []);

  // Get display text for running nodes
  const runningNodeCount = currentNodeIds.length;
  const getRunningLabel = () => {
    if (runningNodeCount === 0) return "Running...";
    if (runningNodeCount === 1) {
      const node = nodes.find((n) => n.id === currentNodeIds[0]);
      const nodeName = node?.data?.customTitle || node?.type || "node";
      return `Running ${nodeName}...`;
    }
    return `Running ${runningNodeCount} nodes...`;
  };
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const runMenuRef = useRef<HTMLDivElement>(null);
  const { valid, errors } = validateWorkflow();

  // Get the selected nodes
  const selectedNodes = useMemo(() => {
    return nodes.filter((n) => n.selected);
  }, [nodes]);

  // Get the selected node (if exactly one is selected)
  const selectedNode = useMemo(() => {
    return selectedNodes.length === 1 ? selectedNodes[0] : null;
  }, [selectedNodes]);

  // Check if we're on the run options tutorial step
  const isRunOptionsTutorialStep = useMemo(() => {
    if (!tutorialActive || tutorialSteps.length === 0) return false;
    const currentStep = tutorialSteps[currentTutorialStep];
    return currentStep?.id === "explain-run-options";
  }, [tutorialActive, currentTutorialStep, tutorialSteps]);

  // Close run menu when clicking outside (but not during tutorial step)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(event.target as Node)) {
        // Don't close menu during the run options tutorial step
        if (!isRunOptionsTutorialStep) {
          setRunMenuOpen(false);
        }
      }
    };

    if (runMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [runMenuOpen, isRunOptionsTutorialStep]);

  // Open run menu when tutorial step is "explain-run-options"
  useEffect(() => {
    if (isRunOptionsTutorialStep) {
      setRunMenuOpen(true);
    }
  }, [isRunOptionsTutorialStep]);

  // Close run menu when tutorial advances past run options
  useEffect(() => {
    if (tutorialActive && tutorialSteps.length > 0) {
      const currentStep = tutorialSteps[currentTutorialStep];
      // Close menu when we're on run-workflow or later steps
      if (currentStep?.id === "run-workflow" || currentStep?.id === "demonstrate-downstream" || currentStep?.id === "demonstrate-complete") {
        setRunMenuOpen(false);
      }
    }
  }, [tutorialActive, currentTutorialStep, tutorialSteps]);

  const toggleEdgeStyle = () => {
    setEdgeStyle(edgeStyle === "angular" ? "curved" : "angular");
  };

  const handleRunClick = useCallback(() => {
    // Check if we're in tutorial mode
    const ftuxState = useFTUXStore.getState();
    const currentStep = ftuxState.tutorialSteps[ftuxState.currentTutorialStep];

    if (isRunning) {
      stopWorkflow();
    } else if (ftuxState.tutorialActive && currentStep?.id === "run-workflow") {
      // Use mock execution for tutorial
      mockTutorialExecution();
    } else {
      // Normal execution. Resume-from-pause (pause edges) is handled inside
      // executeWorkflow when no explicit start node is given.
      executeWorkflow();
    }
  }, [isRunning, stopWorkflow, executeWorkflow, mockTutorialExecution]);

  const handleRunFromSelected = () => {
    if (selectedNode) {
      executeWorkflow(selectedNode.id);
      setRunMenuOpen(false);
    }
  };

  const handleRunSelectedOnly = () => {
    if (selectedNode) {
      regenerateNode(selectedNode.id);
      setRunMenuOpen(false);
    }
  };

  const handleRunSelectedNodes = () => {
    if (selectedNodes.length > 0) {
      executeSelectedNodes(selectedNodes.map((n) => n.id));
      setRunMenuOpen(false);
    }
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-0.5 bg-neutral-800/95 rounded-lg shadow-lg border border-neutral-700/80 px-1.5 py-1">
        <NodeButton type="imageInput" label={tc("Image")} dataTutorial="image-button" />
        <NodeButton type="videoInput" label={tc("Video")} />
        <NodeButton type="prompt" label={tc("Prompt")} dataTutorial="prompt-button" />
        <GenerateComboButton />
        <NodeButton type="output" label={tc("Output")} dataTutorial="output-button" />
        <AllNodesMenu />

        {/* All models button */}
        <div className="w-px h-5 bg-neutral-600 mx-1.5" />
        <button
          onClick={() => setModelSearchOpen(true)}
          title={tc("Browse models")}
          className="px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 rounded transition-colors"
        >{tc("All models")}</button>

        <div className="w-px h-5 bg-neutral-600 mx-1.5" />

        <button
          onClick={toggleEdgeStyle}
          title={tc(edgeStyle === "angular" ? "Switch to curved connectors" : "Switch to angular connectors")}
          className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 rounded transition-colors"
        >
          {edgeStyle === "angular" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h4l4-8 4 8h4" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12c0 0 4-8 8-8s8 8 8 8" />
            </svg>
          )}
        </button>

        <div className="w-px h-5 bg-neutral-600 mx-1.5" />

        <div className="relative flex items-center" ref={runMenuRef}>
          <button
            onClick={handleRunClick}
            disabled={!valid && !isRunning}
            title={!valid ? errors.join("\n") : isRunning ? tc("Stop") : tc("Run")}
            data-tutorial="floating-run-button"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors ${
              isRunning
                ? "bg-white text-neutral-900 hover:bg-neutral-200 rounded"
                : valid
                ? "bg-white text-neutral-900 hover:bg-neutral-200 rounded-l"
                : "bg-neutral-700 text-neutral-500 cursor-not-allowed rounded"
            }`}
          >
            {isRunning ? (
              <>
                <svg
                  className="w-3 h-3 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="max-w-[150px] truncate" title={getRunningLabel()}>
                  {runningNodeCount > 1 ? `${runningNodeCount} nodes` : tc("Stop")}
                </span>
              </>
            ) : (
              <>
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>{tc("Run")}</span>
              </>
            )}
          </button>

          {/* Dropdown chevron button */}
          {!isRunning && valid && (
            <button
              onClick={() => setRunMenuOpen(!runMenuOpen)}
              data-tutorial="floating-run-dropdown"
              className="flex items-center self-stretch px-1.5 rounded-r bg-white text-neutral-900 hover:bg-neutral-200 border-l border-neutral-200 transition-colors"
              title={tc("Run options")}
            >
              <svg
                className={`w-2.5 h-2.5 transition-transform ${runMenuOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Dropdown menu */}
          {runMenuOpen && !isRunning && (
            <div
              data-tutorial="floating-run-menu"
              className="absolute bottom-full right-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-[180px]"
            >
              <button
                onClick={() => {
                  executeWorkflow();
                  setRunMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>{tc("Run entire workflow")}</button>
              <button
                onClick={handleRunFromSelected}
                disabled={!selectedNode}
                className={`w-full px-3 py-2 text-left text-[11px] font-medium transition-colors flex items-center gap-2 ${
                  selectedNode
                    ? "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                    : "text-neutral-500 cursor-not-allowed"
                }`}
                title={!selectedNode ? tc("Select a single node first") : undefined}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>{tc("Run from selected node")}</button>
              <button
                onClick={handleRunSelectedOnly}
                disabled={!selectedNode}
                className={`w-full px-3 py-2 text-left text-[11px] font-medium transition-colors flex items-center gap-2 ${
                  selectedNode
                    ? "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                    : "text-neutral-500 cursor-not-allowed"
                }`}
                title={!selectedNode ? tc("Select a single node first") : undefined}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                </svg>{tc("Run selected node only")}</button>
              <button
                onClick={handleRunSelectedNodes}
                disabled={selectedNodes.length === 0}
                className={`w-full px-3 py-2 text-left text-[11px] font-medium transition-colors flex items-center gap-2 ${
                  selectedNodes.length > 0
                    ? "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                    : "text-neutral-500 cursor-not-allowed"
                }`}
                title={selectedNodes.length === 0 ? tc("Select one or more nodes first") : `Run ${selectedNodes.length} selected node${selectedNodes.length > 1 ? 's' : ''}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V9.653z" />
                </svg>
                {selectedNodes.length > 0
                  ? `Run ${selectedNodes.length} selected node${selectedNodes.length !== 1 ? 's' : ''}`
                  : tc("Run selected nodes")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Model search dialog */}
      <ModelSearchDialog
        isOpen={modelSearchOpen}
        onClose={() => setModelSearchOpen(false)}
        initialProvider={modelSearchProvider}
      />
    </div>
  );
}

/**
 * The original Node Banana bar remains the default. The optional hosted
 * branch receives every dependency explicitly, so embedded runtimes do not
 * reach into the upstream Zustand store.
 */
export function FloatingActionBar({ hosted }: FloatingActionBarProps = {}) {
  return hosted ? <HostedFloatingActionBar {...hosted} /> : <StandaloneFloatingActionBar />;
}
