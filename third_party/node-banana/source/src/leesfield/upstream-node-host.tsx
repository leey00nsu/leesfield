"use client";

import { useCanvasTranslation } from "./localization";

/**
 * Host boundary for Node Banana's visual node components.
 *
 * The upstream nodes are intentionally kept as the rendered implementation,
 * but their application stores, provider clients, and browser persistence are
 * not part of the hosted runtime.  This module supplies the small surface the
 * components need and routes mutations back to the host through context.
 * Nothing in this file reads browser persistence, provider keys, or an
 * upstream API route.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReactFlow, useStore as useFlowStore } from "@xyflow/react";

export type HostNodeData = {
  [key: string]: any;
  images?: string[];
  videos?: string[];
  inputSchema?: ModelInputDef[];
  clipOrder?: string[];
};
/** The edge data contract consumed by Node Banana's actual edge presenters. */
export type WorkflowEdgeData = HostNodeData & {
  hasPause?: boolean;
  createdAt?: number;
  isLoop?: boolean;
  loopCount?: number;
};
export type HostOutputGalleryMedia = {
  type: "image" | "video" | "audio";
  src: string;
  assetId?: string | null;
};
export type HostOutputGalleryRemoveInput = {
  nodeId: string;
  index: number;
  item: HostOutputGalleryMedia;
};
export type HostOutputGalleryExtractInput = {
  nodeId: string;
  items: HostOutputGalleryMedia[];
};
export type ImageInputNodeData = HostNodeData;
export type AudioInputNodeData = HostNodeData;
export type VideoInputNodeData = HostNodeData;
export type AnnotationNodeData = HostNodeData;
export type PromptNodeData = HostNodeData;
export type PromptConstructorNodeData = HostNodeData & { template: string; outputText: string | null };
export type AvailableVariable = { name: string; value: string; nodeId: string };
export type NanoBananaNodeData = HostNodeData;
export type GenerateVideoNodeData = HostNodeData;
export type GenerateAudioNodeData = HostNodeData;
export type SplitGridNodeData = HostNodeData;
export type OutputNodeData = HostNodeData;
export type OutputGalleryNodeData = HostNodeData;
export type ImageCompareNodeData = HostNodeData;
export type VideoStitchNodeData = HostNodeData;
export type VideoTrimNodeData = HostNodeData;
export type VideoFrameGrabNodeData = HostNodeData;
export type EaseCurveNodeData = HostNodeData;
export type RemoveBackgroundNodeData = HostNodeData;
export type ImageResizeNodeData = HostNodeData;
export type GifEncoderNodeData = HostNodeData;
export type WorkflowNode = HostNodeData;

export type AnnotationShape = HostNodeData;
export type RectangleShape = HostNodeData;
export type CircleShape = HostNodeData;
export type ArrowShape = HostNodeData;
export type FreehandShape = HostNodeData;
export type TextShape = HostNodeData;
export type ToolType = string;
export type NodeType = string;
export type BackgroundRemovalModel = string;
export type ImageResizeFit = string;
export type ImageResizeFormat = string;
export type ImageResizeMode = string;

export type AspectRatio = string;
export type Resolution = string;
export type ModelType = string;
export type ProviderType = "gemini" | "openai" | "anthropic" | "replicate" | "fal" | "kie" | "wavespeed" | "hf_space" | "codex_cli" | "codex_bridge" | "openai_compatible";
export type ModelCapability =
  | "text-to-text"
  | "image-to-text"
  | "video-to-text"
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "text-to-3d"
  | "image-to-3d"
  | "text-to-audio"
  | "audio-to-video";
export type ModelInputDef = {
  name: string;
  type: "image" | "text" | "audio" | "video";
  required: boolean;
  label: string;
  description?: string;
  isArray?: boolean;
};
export type ModelParameter = {
  name: string;
  label?: string;
  type: "string" | "number" | "integer" | "boolean" | "array" | "json";
  nullable?: boolean;
  multipleOf?: number;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  required?: boolean;
};
export type SelectedModel = {
  provider: ProviderType;
  modelId: string;
  displayName: string;
  pricing?: { type: "per-run" | "per-second"; amount: number };
  capabilities?: ModelCapability[];
};
export type ProviderModel = {
  id: string;
  /** Display-only hosted metadata; id remains the catalog selection key. */
  modelId?: string;
  providerLabel?: string;
  name: string;
  description: string | null;
  provider: ProviderType;
  capabilities: ModelCapability[];
  coverImage?: string;
  pricing?: { type: "per-run" | "per-second"; amount: number; currency: string };
  pageUrl?: string;
};
export type RecentModel = {
  provider: ProviderType;
  modelId: string;
  displayName: string;
  timestamp: number;
};
export type LLMProvider = "google" | "openai" | "anthropic";
export type LLMModelType =
  | "gemini-2.5-flash"
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview"
  | "gemini-3.1-pro-preview"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano"
  | "claude-opus-4.6"
  | "claude-sonnet-4.5"
  | "claude-haiku-4.5";
export type WorkflowNodeData = HostNodeData;
export type SplitGridTemplateNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  data?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
};
export type SplitGridTemplateEdge = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};
export type SplitGridTemplateRouterConnection = {
  source: string;
  sourceHandle: string;
  targetHandle: string;
};
export type SplitGridTemplate = {
  baseNodeId: string;
  nodes: SplitGridTemplateNode[];
  edges: SplitGridTemplateEdge[];
  router?: SplitGridTemplateRouterConnection[];
};
export type LLMGenerateNodeData = HostNodeData;
export type Generate3DNodeData = HostNodeData;
export type SavedComfyNode = HostNodeData & {
  id: string;
  name: string;
  app: {
    inputs: Array<{ type: string }>;
    outputs: Array<{ type: string }>;
  };
};
export type CanvasNavigationSettings = {
  panMode: string;
  zoomMode: string;
  selectionMode: string;
};

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "nano-banana": "Nano Banana",
  "nano-banana-pro": "Nano Banana Pro",
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-2-lite": "Nano Banana 2 Lite",
};

export const GEMINI_IMAGE_MODELS = [
  { value: "nano-banana", label: "Nano Banana" },
  { value: "nano-banana-2", label: "Nano Banana 2" },
  { value: "nano-banana-2-lite", label: "Nano Banana 2 Lite" },
  { value: "nano-banana-pro", label: "Nano Banana Pro" },
] as const;

type HostConnectedInputs = HostNodeData & {
  images: string[];
  videos: string[];
  audio?: string[];
  audios: string[];
  text: string | null;
};

type HostWorkflowState = {
  focusedCommentNodeId?: string | null;
  hostedModelsLoading?: boolean;
  hostedModelsError?: string | null;
  refreshHostedModels?: () => Promise<void>;
  onHostError?: (error: Error) => void;
  writable: boolean;
  inlineParametersEnabled: boolean;
  hostedModels: ProviderModel[];
  nodes: HostNodeData[];
  edges: HostNodeData[];
  currentNodeIds: string[];
  isRunning: boolean;
  updateNodeData: (nodeId: string, patch: HostNodeData) => void;
  regenerateNode: (nodeId: string) => void;
  getConnectedInputs: (nodeId: string) => HostConnectedInputs;
  removeEdge: (edgeId: string) => void;
  commitNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
  addNode: (...args: any[]) => string;
  materializeSplitGridCells: (...args: any[]) => void;
  beginGroupInteraction: () => void;
  endGroupInteraction: () => void;
  updateGroup: (id: string, patch: Partial<NodeGroup>) => void;
  deleteGroup: (id: string) => void;
  moveGroupNodes: (id: string, delta: { x: number; y: number }) => void;
  toggleGroupLock: (id: string) => void;
  incrementModalCount: () => void;
  decrementModalCount: () => void;
  recentModels: RecentModel[];
  trackModelUsage: (...args: any[]) => void;
  canvasNavigationSettings: CanvasNavigationSettings;
  edgeStyle: "angular" | "curved";
  setEdgeStyle: (style: "angular" | "curved") => void;
  onConnect: (...args: any[]) => void;
  onNodesChange: (...args: any[]) => void;
  createGroup: (...args: any[]) => void;
  removeNodesFromGroup: (...args: any[]) => void;
  toggleEdgePause: (...args: any[]) => void;
  setLoopCount: (...args: any[]) => void;
  getNodesWithComments: () => HostNodeData[];
  markCommentViewed: (...args: any[]) => void;
  setNavigationTarget: (...args: any[]) => void;
  groups: Record<string, HostNodeData>;
  setNodeGroupId: (...args: any[]) => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (nodeId: string | null) => void;
  renderInputHistory: (
    nodeId: string,
    mediaType: "image" | "audio" | "video",
    selectedAssetId: string | null,
    options?: { open: boolean; onOpenChange: (open: boolean) => void },
  ) => ReactNode;
  onOutputGalleryRemove?: (input: HostOutputGalleryRemoveInput) => void;
  onOutputGalleryExtract?: (input: HostOutputGalleryExtractInput) => void;
};

export type NodeBananaUpstreamHostValue = Partial<HostWorkflowState> & {
  nodeId?: string;
  resolveNodeData?: (nodeId: string) => HostNodeData | null | undefined;
  onUpdateNodeData?: (nodeId: string, patch: HostNodeData) => void;
  onRegenerateNode?: (nodeId: string) => void;
  onOpenAnnotation?: (nodeId: string) => void;
  onInputMediaUpload?: (input: {
    nodeId: string;
    mediaType: "image" | "audio" | "video";
    dataUrl: string;
    filename: string | null;
    mimeType: string | null;
  }) => Promise<{ assetId: string }>;
  onAnnotationOutput?: (input: {
    nodeId: string;
    dataUrl: string;
    annotations: HostNodeData[];
  }) => Promise<{ assetId: string }>;
  onHostError?: (error: Error) => void;
  getNodeRunReadiness?: (nodeId: string) => {
    ready: boolean;
    reason?: string | null;
    reasons?: readonly string[];
  };
};

const noop = (..._args: any[]): void => {};

const defaultWorkflowState: HostWorkflowState = {
  writable: true,
  inlineParametersEnabled: false,
  hostedModels: [],
  nodes: [],
  edges: [],
  currentNodeIds: [],
  isRunning: false,
  updateNodeData: noop,
  regenerateNode: noop,
  getConnectedInputs: () => ({ images: [], videos: [], audios: [], text: null }),
  removeEdge: noop,
  commitNodePositions: noop,
  addNode: () => crypto.randomUUID(),
  materializeSplitGridCells: noop,
  beginGroupInteraction: noop,
  endGroupInteraction: noop,
  updateGroup: noop,
  deleteGroup: noop,
  moveGroupNodes: noop,
  toggleGroupLock: noop,
  incrementModalCount: noop,
  decrementModalCount: noop,
  recentModels: [],
  trackModelUsage: noop,
  canvasNavigationSettings: { panMode: "space", zoomMode: "altScroll", selectionMode: "click" },
  edgeStyle: "angular",
  setEdgeStyle: noop,
  onConnect: noop,
  onNodesChange: noop,
  createGroup: noop,
  removeNodesFromGroup: noop,
  toggleEdgePause: noop,
  setLoopCount: noop,
  getNodesWithComments: () => [],
  markCommentViewed: noop,
  setNavigationTarget: noop,
  groups: {},
  setNodeGroupId: noop,
  hoveredNodeId: null,
  setHoveredNodeId: noop,
  renderInputHistory: () => null,
};

const WorkflowContext = createContext<HostWorkflowState>(defaultWorkflowState);

const defaultAnnotationState = {
  isModalOpen: false,
  sourceNodeId: null as string | null,
  sourceImage: null as string | null,
  annotations: [] as AnnotationShape[],
  selectedShapeId: null as string | null,
  currentTool: "select" as ToolType,
  toolOptions: {
    strokeColor: "#ef4444",
    strokeWidth: 4,
    fillColor: null as string | null,
    fontSize: 24,
    opacity: 1,
  },
  closeModal: noop,
  openModal: noop,
  addAnnotation: noop,
  updateAnnotation: noop,
  deleteAnnotation: noop,
  clearAnnotations: noop,
  selectShape: noop,
  setCurrentTool: noop,
  setToolOptions: noop,
  undo: noop,
  redo: noop,
};

const AnnotationContext = createContext<typeof defaultAnnotationState>(defaultAnnotationState);

function makeWorkflowState(value: NodeBananaUpstreamHostValue): HostWorkflowState {
  return {
    ...defaultWorkflowState,
    ...value,
    updateNodeData: (nodeId, patch) => {
      if (value.writable === false) return;
      value.onUpdateNodeData?.(nodeId, patch);
      value.updateNodeData?.(nodeId, patch);
    },
    regenerateNode: (nodeId) => {
      if (value.writable === false) return;
      value.onRegenerateNode?.(nodeId);
      value.regenerateNode?.(nodeId);
    },
    removeEdge: (edgeId) => {
      if (value.writable === false) return;
      value.removeEdge?.(edgeId);
    },
  };
}

export function NodeBananaUpstreamHostProvider({
  value,
  children,
}: {
  value?: NodeBananaUpstreamHostValue;
  children: ReactNode;
}) {
  const parent = useContext(WorkflowContext);
  const [localHoveredNodeId, setLocalHoveredNodeId] = useState<string | null>(null);
  const hoveredNodeId = parent === defaultWorkflowState
    ? localHoveredNodeId : parent.hoveredNodeId;
  const setHoveredNodeId = parent === defaultWorkflowState
    ? setLocalHoveredNodeId : parent.setHoveredNodeId;
  // Nested per-node adapters share the canvas hover state, never a no-op copy.
  const workflow = useMemo(() => makeWorkflowState({
    ...parent,
    ...value,
    hoveredNodeId,
    setHoveredNodeId,
  }), [parent, value, hoveredNodeId, setHoveredNodeId]);
  return <WorkflowContext.Provider value={workflow}>{children}</WorkflowContext.Provider>;
}

export function useWorkflowStore<T = HostWorkflowState>(
  selector?: (state: HostWorkflowState) => T,
): T {
  const state = useContext(WorkflowContext);
  return selector ? selector(state) : (state as T);
}

export function HostedGenerationPrompt({
  nodeId,
  value,
  connectedValue,
  connected = false,
}: {
  nodeId: string;
  value?: string | null;
  connectedValue?: string | null;
  connected?: boolean;
}) {
  const tc = useCanvasTranslation();
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const writable = useWorkflowStore((state) => state.writable);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    if (!connected) setDraft(value ?? "");
  }, [connected, value]);
  const displayed = connected ? connectedValue ?? "" : draft;
  return (
    <label className="nodrag nopan block shrink-0 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-500">{tc("Prompt")}</span>
      <textarea
        aria-label={tc("Prompt")}
        value={displayed}
        disabled={connected || !writable}
        placeholder={connected ? tc("Prompt supplied by connected Prompt node") : tc("Describe what to generate")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (writable && !connected && draft !== (value ?? "")) updateNodeData(nodeId, { prompt: draft });
        }}
        className="nodrag nopan min-h-16 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950/70 px-2 py-1.5 text-xs text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950/40 disabled:text-neutral-500"
      />
      {connected ? (
        <span className="mt-1 block text-[9px] text-neutral-500">{tc("Controlled by connected Prompt node")}</span>
      ) : null}
    </label>
  );
}

export function HostedInputHistory({
  nodeId,
  mediaType,
  selectedAssetId,
  open,
  onOpenChange,
}: {
  nodeId: string;
  mediaType: "image" | "audio" | "video";
  selectedAssetId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const host = useWorkflowStore();
  return host.renderInputHistory(nodeId, mediaType, selectedAssetId ?? null,
    open === undefined ? undefined : { open, onOpenChange: onOpenChange ?? (() => {}) });
}

export function useAnnotationStore<T = typeof defaultAnnotationState>(
  selector?: (state: typeof defaultAnnotationState) => T,
): T {
  const state = useContext(AnnotationContext);
  return selector ? selector(state) : (state as T);
}

export function useAdaptiveImageSrc(src: string | null | undefined, nodeId: string): string | null {
  // Original Node Banana threshold: effective width < 200 (not its stale 300px comment).
  const small = useFlowStore(useCallback((state) => {
    const node = state.nodeLookup.get(nodeId);
    return (node?.measured?.width ?? node?.width ?? 350) * state.transform[2] < 200;
  }, [nodeId]));
  const roles = useFlowStore(useCallback(state => src ? (state.nodeLookup.get(nodeId)?.data.imagePresentations as Record<string, {list: string[]; display: string[]}> | undefined)?.[src] : undefined, [nodeId, src]));
  const candidates: string[] | undefined = roles?.[small ? "list" : "display"];
  const signature = candidates?.join("|");
  const [selected, setSelected] = useState<{key: string; url: string} | null>(null);
  useEffect(() => {
    if (!candidates?.length || !signature) return;
    let active = true;
    let index = 0;
    const image = new Image();
    const load = () => { image.src = candidates[index]; };
    image.onerror = () => { if (active && index + 1 < candidates.length) {index += 1; setSelected({key: signature, url: candidates[index]}); load();} };
    load();
    return () => {active = false; image.onerror = null; image.onload = null; image.src = "";};
  }, [signature]);
  const [thumbnail, setThumbnailState] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    if (!src || candidates?.length) return;
    let active = true;
    const cached = getThumbnail(src);
    let promise = cached ? Promise.resolve(cached) : getPending(src);
    if (!promise) {
      const generation = thumbnailGeneration;
      promise = generateThumbnail(src).then((url) => {
        if (generation === thumbnailGeneration) setThumbnail(src, url);
        return url;
      }).finally(() => { if (generation === thumbnailGeneration) removePending(src); });
      setPending(src, promise);
    }
    void promise.then((url) => { if (active) setThumbnailState({ source: src, url }); }).catch(() => undefined);
    return () => { active = false; };
  }, [src, signature]);
  if (candidates?.length) return selected && selected.key === signature ? selected.url : candidates[0];
  return src ? (small && thumbnail?.source === src ? thumbnail.url : src) : null;
}

export function useVideoBlobUrl(src: string | null | undefined, ..._args: any[]): string | null {
  return src ?? null;
}

export { useVideoAutoplay } from "../hooks/useVideoAutoplay";

export { useShowHandleLabels } from "../hooks/useShowHandleLabels";

export function useCommentNavigation(nodeId: string) {
  const state = useWorkflowStore();
  return commentNavigationForNode(nodeId, state);
}

export function commentNavigationForNode(nodeId: string, state?: NodeBananaUpstreamHostValue) {
  const comments = state?.getNodesWithComments?.() ?? [];
  const index = comments.findIndex((node) => node.id === nodeId);
  if (index < 0) return null;
  const navigate = (offset: number) => {
    const target = comments[(index + offset + comments.length) % comments.length];
    state?.markCommentViewed?.(target.id);
    state?.setNavigationTarget?.(target.id);
  };
  return { currentIndex: index + 1, totalCount: comments.length, onPrevious: () => navigate(-1), onNext: () => navigate(1) };
}

export function useAudioVisualization(audio: Blob | File | null | undefined, ..._args: any[]) {
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (!audio || typeof AudioContext === "undefined") {
      setWaveformData(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const context = new AudioContext();
    setIsLoading(true);
    void audio.arrayBuffer()
      .then((buffer) => context.decodeAudioData(buffer))
      .then((decoded) => {
        if (cancelled) return;
        const samples = decoded.getChannelData(0);
        const buckets = 160;
        const step = Math.max(1, Math.floor(samples.length / buckets));
        const peaks = Array.from({ length: buckets }, (_, index) => {
          let peak = 0;
          const start = index * step;
          for (let offset = 0; offset < step && start + offset < samples.length; offset += 1) {
            peak = Math.max(peak, Math.abs(samples[start + offset] ?? 0));
          }
          return peak;
        });
        setWaveformData(peaks);
      })
      .catch(() => { if (!cancelled) setWaveformData(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => {
      cancelled = true;
      void context.close();
    };
  }, [audio]);
  return { waveformData, isLoading };
}

export function useAudioPlayback({
  audioSrc,
  waveformData,
}: {
  audioSrc?: string | null;
  waveformData?: number[] | null;
  [key: string]: any;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!audioSrc || typeof Audio === "undefined") {
      audioRef.current = null;
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }
    const audio = new Audio(audioSrc);
    audio.preload = "metadata";
    audioRef.current = audio;
    const sync = () => {
      setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const paused = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("pause", paused);
    audio.addEventListener("ended", paused);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", sync);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", paused);
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioSrc]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData?.length) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const progress = duration > 0 ? currentTime / duration : 0;
    const barWidth = canvas.width / waveformData.length;
    waveformData.forEach((peak, index) => {
      const height = Math.max(2 * ratio, peak * canvas.height * 0.9);
      context.fillStyle = index / waveformData.length <= progress ? "#a78bfa" : "#52525b";
      context.fillRect(index * barWidth, (canvas.height - height) / 2, Math.max(1, barWidth - ratio), height);
    });
  }, [currentTime, duration, waveformData]);
  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);
  const handleSeek = useCallback((event: { clientX: number }) => {
    const audio = audioRef.current;
    const container = waveformContainerRef.current;
    if (!audio || !container || !Number.isFinite(audio.duration)) return;
    const rect = container.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * audio.duration;
    setCurrentTime(audio.currentTime);
  }, []);
  return {
    audioRef,
    canvasRef,
    waveformContainerRef,
    isPlaying,
    currentTime,
    duration,
    audioSrc: audioSrc ?? null,
    handlePlayPause,
    handleSeek,
    formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`,
  };
}

export function useInlineParameters() {
  const enabled = useWorkflowStore((state) => state.inlineParametersEnabled);
  const writable = useWorkflowStore((state) => state.writable);
  return { inlineParametersEnabled: enabled && writable !== false };
}

export function useLoadGenerationById(..._args: any[]) {
  return useCallback(async (item: unknown) => {
    if (typeof item === "string") return item.startsWith("/") || item.startsWith("http") || item.startsWith("data:") || item.startsWith("blob:")
      ? item
      : `/api/media-assets/${encodeURIComponent(item)}/content`;
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (typeof record.url === "string") return record.url;
      if (typeof record.id === "string") return `/api/media-assets/${encodeURIComponent(record.id)}/content`;
    }
    return null;
  }, []);
}

export function useGenerationCarousel(options?: {
  nodeId?: string;
  history?: unknown[];
  currentIndex?: number;
  loadFn?: (item: unknown) => Promise<unknown>;
  buildUpdate?: (value: any, index: number) => any;
  [key: string]: any;
}) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [isLoading, setIsLoading] = useState(false);
  const move = useCallback(async (delta: number) => {
    const history = options?.history ?? [];
    if (!options?.nodeId || history.length < 2 || !options.loadFn || !options.buildUpdate) return;
    const current = Math.max(0, Math.min(history.length - 1, options.currentIndex ?? 0));
    const nextIndex = (current + delta + history.length) % history.length;
    setIsLoading(true);
    try {
      const value = await options.loadFn(history[nextIndex]);
      if (value != null) updateNodeData(options.nodeId, options.buildUpdate(value, nextIndex));
    } finally {
      setIsLoading(false);
    }
  }, [options, updateNodeData]);
  return {
    isLoading,
    handlePrevious: () => { void move(-1); },
    handleNext: () => { void move(1); },
  };
}

export function useErrorToast(status: string | undefined, error: string | null | undefined, title: string) {
  const report = useWorkflowStore((state) => state.onHostError);
  const previous = useRef(status);
  useEffect(() => {
    if (status === "error" && previous.current !== "error" && error) report?.(new Error(`${title}: ${error}`));
    previous.current = status;
  }, [status, error, title, report]);
}

export function useAutoResizeOnMedia(
  nodeId: string,
  mediaUrl: string | null | undefined,
  getDimensions: (url: string) => Promise<{ width: number; height: number } | null>,
) {
  const { setNodes } = useReactFlow();
  const previousUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mediaUrl || mediaUrl === previousUrlRef.current) {
      previousUrlRef.current = mediaUrl ?? null;
      return;
    }
    previousUrlRef.current = mediaUrl;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void getDimensions(mediaUrl).then((dimensions) => {
        if (cancelled || !dimensions || dimensions.height <= 0) return;
        const aspectRatio = dimensions.width / dimensions.height;
        if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
        setNodes((nodes) => nodes.map((node) => {
          if (node.id !== nodeId) return node;
          const currentHeight = typeof node.style?.height === "number" && node.style.height >= 200
            ? node.style.height
            : 300;
          const contentHeight = Math.max(100, currentHeight - 100);
          const width = Math.round(Math.max(200, Math.min(500, contentHeight * aspectRatio)));
          if (node.style?.width === width && node.style?.height === currentHeight) return node;
          return { ...node, style: { ...node.style, width, height: currentHeight } };
        }));
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [getDimensions, mediaUrl, nodeId, setNodes]);
}

export function useProviderApiKeys() {
  return {
    geminiApiKey: null,
    replicateApiKey: null,
    falApiKey: null,
    kieApiKey: null,
    wavespeedApiKey: null,
    openaiApiKey: null,
    replicateEnabled: false,
    falEnabled: false,
    kieEnabled: false,
    wavespeedEnabled: false,
    openaiEnabled: false,
  };
}

export function saveNanoBananaDefaults(..._args: any[]): void {
  // Provider/model defaults intentionally belong to the host catalog, not the
  // vendored runtime.  This is a no-op compatibility surface.
}

const hostFetchCache = new Map<string, Promise<Response>>();

function modelCapabilities(item: HostNodeData): ModelCapability[] {
  if (item.type === "image") {
    return Number(item.meta?.max_input_images ?? 0) > 0
      ? ["text-to-image", "image-to-image"]
      : ["text-to-image"];
  }
  if (item.type === "video") {
    return item.meta?.supports_init_image === true
      ? ["text-to-video", "image-to-video"]
      : ["text-to-video"];
  }
  if (item.type === "audio") return ["text-to-audio"];
  return [];
}

function providerModel(item: HostNodeData): ProviderModel {
  return {
    id: String(item.key ?? item.id ?? ""),
    name: String(item.label ?? item.key ?? "Model"),
    description: typeof item.description === "string" ? item.description : null,
    provider: (item.provider ?? "hf_space") as ProviderType,
    capabilities: modelCapabilities(item),
  };
}

function modelInputs(item: HostNodeData): ModelInputDef[] {
  if(item.inputContract) return item.inputContract.inputs.flatMap((field:HostNodeData)=>field.canonical==="prompt"?[{name:"prompt",type:"text",label:field.label,required:field.required}]:["file","files","gallery"].includes(field.kind)?[{name:field.media+"-field-"+field.name,type:field.media,label:field.label,required:field.required}]:[]);

  const parameters = item.parameters && typeof item.parameters === "object" ? item.parameters as HostNodeData : {};
  const inputs: ModelInputDef[] = [{ name: "prompt", type: "text", required: parameters.prompt?.required !== false, label: parameters.prompt?.label ?? "Prompt" }];
  if (item.type === "image" && Number(item.meta?.max_input_images ?? 0) > 0) {
    inputs.unshift({ name: "image", type: "image", required: false, label: "Image" });
  }
  if (item.type === "video" && item.meta?.supports_init_image === true) {
    inputs.unshift({ name: "image", type: "image", required: parameters.initImage?.required === true, label: parameters.initImage?.label ?? "Image" });
  }
  if (item.type === "audio" && item.meta?.supports_input_audio === true) {
    inputs.unshift({ name: "audio", type: "audio", required: parameters.inputAudio?.required === true, label: parameters.inputAudio?.label ?? "Audio" });
  }
  return inputs;
}

function modelParameters(item: HostNodeData): ModelParameter[] {
  if(item.inputContract) return item.inputContract.inputs.filter((f:HostNodeData)=>!f.canonical && !["file","files","gallery"].includes(f.kind)).map((field:HostNodeData)=>({
    name:field.name,label:field.label,description:field.schema.description,
    type:field.nullable||field.kind==="json"?"json":field.kind==="number"?(field.schema.type==="integer"?"integer":"number"):field.kind,
    default:field.default,nullable:field.nullable,minimum:field.min,maximum:field.max,multipleOf:field.schema.multipleOf,
    enum:field.nullable?undefined:field.choices,required:field.required,
  }));

  const parameters = item.parameters && typeof item.parameters === "object" ? item.parameters as HostNodeData : {};
  return Object.entries(parameters).flatMap(([name, raw]) => {
    if (name === "prompt" || name === "initImage" || name === "inputAudio") return [];
    const config = raw && typeof raw === "object" ? raw as HostNodeData : {};
    if (config.ui === "hidden" || config.ui === "upload") return [];
    const values = Array.isArray(config.options)
      ? config.options.map((option: unknown) => option && typeof option === "object" ? (option as HostNodeData).value : option)
      : undefined;
    const inferredType: ModelParameter["type"] = config.ui === "toggle" || typeof config.default === "boolean"
      ? "boolean"
      : typeof config.default === "number" || typeof config.min === "number" || typeof config.max === "number"
        ? Number.isInteger(config.step) && Number.isInteger(config.default) ? "integer" : "number"
        : "string";
    return [{
      name,
      type: inferredType,
      label: typeof config.label === "string" ? config.label : undefined,
      description: typeof config.label === "string" ? config.label : undefined,
      default: config.default,
      minimum: typeof config.min === "number" ? config.min : undefined,
      maximum: typeof config.max === "number" ? config.max : undefined,
      enum: values,
      required: config.required === true,
    }];
  });
}

async function fetchLeesfieldModels(): Promise<HostNodeData[]> {
  const response = await fetch("/api/models", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load models (${response.status})`);
  const payload = await response.json() as HostNodeData;
  return Array.isArray(payload.items) ? payload.items : [];
}

export function deduplicatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(rawUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  const key = `${url.pathname}${url.search}`;
  const cached = hostFetchCache.get(key);
  if (cached) return cached.then((response) => response.clone());
  const request = (async () => {
    if (url.pathname === "/api/models") {
      const items = await fetchLeesfieldModels();
      const requestedProvider = url.searchParams.get("provider");
      const models = items
        .filter((item) => !requestedProvider || requestedProvider === "all" || item.provider === requestedProvider)
        .map(providerModel);
      return new Response(JSON.stringify({
        success: true,
        models,
        availableProviders: Array.from(new Set(items.map((item) => String(item.provider)))),
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const detail = /^\/api\/models\/([^/]+)$/.exec(url.pathname);
    if (detail) {
      const items = await fetchLeesfieldModels();
      const modelId = decodeURIComponent(detail[1]);
      const item = items.find((candidate) => candidate.key === modelId || candidate.id === modelId);
      if (!item) return new Response(JSON.stringify({ error: "Model not found" }), { status: 404, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({
        parameters: modelParameters(item),
        inputs: modelInputs(item),
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return fetch(input, init);
  })();
  hostFetchCache.set(key, request);
  void request.catch(() => hostFetchCache.delete(key));
  return request.then((response) => response.clone());
}

export function clearFetchCache(): void {
  hostFetchCache.clear();
}

export function useSavedComfyNodes() {
  return [] as SavedComfyNode[];
}

export function useWheelPanZoom(..._args: any[]): void {
  // Canvas navigation is provided by the Leesfield canvas host.
}

export const browseRegistry = {
  callbacks: new Map<string, () => void>(),
  register(id: string, callback: () => void) {
    this.callbacks.set(id, callback);
  },
  unregister(id: string) {
    this.callbacks.delete(id);
  },
  open(id: string) {
    const callback = this.callbacks.get(id);
    if (!callback) return false;
    callback();
    return true;
  },
};

export const expandRegistry = {
  callbacks: new Map<string, () => void>(),
  register(id: string, callback: () => void) {
    this.callbacks.set(id, callback);
  },
  unregister(id: string) {
    this.callbacks.delete(id);
  },
  open(id: string) {
    const callback = this.callbacks.get(id);
    if (!callback) return false;
    callback();
    return true;
  },
};

export type GroupColor = "neutral" | "blue" | "green" | "purple" | "orange" | "red";
export type HandleType = string;
export type WorkflowEdge = HostNodeData;
export type NodeGroup = { id: string; name: string; color: GroupColor; position: { x: number; y: number }; size: { width: number; height: number }; locked?: boolean; isNbpInput?: boolean };
export type SplitGridCell = { baseImageNodeId: string; nodeIds: string[]; groupId?: string };
export const SPLIT_GRID_BASE_NODE_ID = "cell-image";
export const GROUP_COLORS: Record<string, string> = { neutral: "#262626", blue: "#1e3a5f", green: "#1a3d2e", purple: "#2d2458", orange: "#3d2a1a", red: "#3d1a1a" };
export const defaultNodeDimensions: Record<string, { width: number; height: number }> = {
  imageInput: { width: 300, height: 280 },
  audioInput: { width: 300, height: 200 },
  videoInput: { width: 300, height: 280 },
  annotation: { width: 300, height: 280 },
  prompt: { width: 320, height: 220 },
  promptConstructor: { width: 340, height: 280 },
  nanoBanana: { width: 300, height: 300 },
  generateVideo: { width: 300, height: 300 },
  generateAudio: { width: 300, height: 280 },
  splitGrid: { width: 300, height: 400 },
  output: { width: 320, height: 320 },
  outputGallery: { width: 320, height: 360 },
  imageCompare: { width: 400, height: 360 },
  videoStitch: { width: 400, height: 280 },
  videoTrim: { width: 360, height: 360 },
  videoFrameGrab: { width: 320, height: 320 },
  easeCurve: { width: 340, height: 280 },
  removeBackground: { width: 320, height: 320 },
  imageResize: { width: 320, height: 360 },
  gifEncoder: { width: 480, height: 380 },
};

export function createDefaultNodeData(_type: NodeType): HostNodeData {
  return { model: "nano-banana-pro", prompt: "", parameters: {} };
}

export function createDefaultSplitGridTemplate(): SplitGridTemplate {
  return {
    baseNodeId: "cell-image",
    nodes: [{ id: "cell-image", type: "imageInput", position: { x: 0, y: 0 } }],
    edges: [],
  };
}

export function createClassicSplitGridTemplate(prompt = "", _settings?: unknown): SplitGridTemplate {
  return {
    ...createDefaultSplitGridTemplate(),
    nodes: [
      { id: "cell-image", type: "imageInput", position: { x: 0, y: 0 } },
      { id: "cell-prompt", type: "prompt", position: { x: 380, y: 0 }, data: { prompt } },
      { id: "cell-generate", type: "nanoBanana", position: { x: 760, y: 0 }, data: (_settings as Record<string, unknown> | undefined) ?? {} },
    ],
    edges: [
      { id: "cell-image-generate", source: "cell-image", sourceHandle: "image", target: "cell-generate", targetHandle: "image" },
      { id: "cell-prompt-generate", source: "cell-prompt", sourceHandle: "text", target: "cell-generate", targetHandle: "text" },
    ],
  };
}

export function getImageDimensions(src: string, ..._args: any[]) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    if (typeof Image === "undefined") return resolve(null);
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function getVideoDimensions(src: string, ..._args: any[]) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => resolve(null);
    video.src = src;
  });
}

export async function downloadMedia(src: string, mediaType: MediaType = "image", filename?: string): Promise<void> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const extension = blob.type.split("/")[1]?.split(";")[0] || (mediaType === "image" ? "png" : mediaType === "video" ? "mp4" : "mp3");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || `leesfield-${Date.now()}.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type MediaType = "image" | "video" | "audio";

const thumbnailCache = new Map<string, string>();
const pendingThumbnails = new Map<string, Promise<string>>();

let thumbnailGeneration = 0;
const thumbnailDisposers = new Set<() => void>();
export function clearThumbnailCache() {
  thumbnailGeneration += 1;
  for (const dispose of thumbnailDisposers) dispose();
  thumbnailDisposers.clear();
  thumbnailCache.clear();
  pendingThumbnails.clear();
}

export async function generateThumbnail(src: string, maxDim = 256, quality = 0.6): Promise<string> {
  if (!src) return src;
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null; img.onerror = null;
      thumbnailDisposers.delete(cancel);
      img.removeAttribute("src");
      resolve(result);
    };
    const cancel = () => finish(src);
    const timer = setTimeout(cancel, 15_000);
    thumbnailDisposers.add(cancel);
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      if (!width || !height || (width <= maxDim && height <= maxDim)) { finish(src); return; }
      const scale = Math.min(maxDim / width, maxDim / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      try {
        const context = canvas.getContext("2d");
        if (!context) { finish(src); return; }
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", quality));
      } catch { finish(src); }
      finally { canvas.width = 0; canvas.height = 0; }
    };
    img.onerror = cancel;
    img.src = src;
  });
}

export function getThumbnail(src: string) {
  return thumbnailCache.get(src);
}

export function setThumbnail(src: string, thumbnail: string) {
  thumbnailCache.delete(src);
  thumbnailCache.set(src, thumbnail);
  if (thumbnailCache.size > 500) thumbnailCache.delete(thumbnailCache.keys().next().value!);
}

export function getPending(src: string): Promise<string> | undefined {
  return pendingThumbnails.get(src);
}

export function setPending(src: string, promise: Promise<string>) {
  pendingThumbnails.set(src, promise);
}

export function removePending(src: string) {
  pendingThumbnails.delete(src);
}

export const MIN_GRID_DIMENSION = 1;
export const MAX_GRID_DIMENSION = 20;
export const MIN_SLICE_GAP = 0.001;

export function clampGridDimension(value: number) {
  return Math.min(MAX_GRID_DIMENSION, Math.max(MIN_GRID_DIMENSION, Math.round(value || 1)));
}

export function resolveGridOffsets(count: number, offsets?: unknown) {
  const normalizedCount = clampGridDimension(count);
  const expected = Math.max(0, normalizedCount - 1);
  const uniform = Array.from({ length: expected }, (_, index) => (index + 1) / normalizedCount);
  if (expected === 0) return [] as number[];
  if (!Array.isArray(offsets) || offsets.length !== expected) return uniform;
  const values = offsets.map(Number);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const previous = index > 0 ? values[index - 1] : 0;
    if (!Number.isFinite(value) || value <= 0 || value >= 1 || value - previous < MIN_SLICE_GAP) {
      return uniform;
    }
  }
  if (1 - values[values.length - 1] < MIN_SLICE_GAP) return uniform;
  return values;
}

export function gridFractions(count: number, offsets?: number[]) {
  const values = [0, ...(offsets ?? []), 1];
  return values.slice(1).map((value, index) => value - values[index]);
}

export function getSplitGridCells(data: HostNodeData, ..._args: any[]) {
  return Array.isArray(data.cells) ? data.cells : [];
}

export function getSplitGridTemplate(data: HostNodeData, ..._args: any[]) {
  return data.template && typeof data.template === "object" ? data.template : createDefaultSplitGridTemplate();
}

export function needsMaterialization(data: HostNodeData, existingIds?: Set<string>, ..._args: any[]) {
  const rows = clampGridDimension(Number(data.gridRows ?? 2));
  const cols = clampGridDimension(Number(data.gridCols ?? 2));
  const cells = Array.isArray(data.cells) ? data.cells : [];
  if (cells.length !== rows * cols) return true;
  return existingIds ? cells.every((cell) => !existingIds.has(String(cell?.baseImageNodeId ?? ""))) : false;
}

export function checkEncoderSupport() {
  return Promise.resolve(typeof VideoEncoder !== "undefined");
}

export const isPanningRef = { current: false };
export const isDraggingNodeRef = { current: false };

export function AnnotationHostProvider({
  value,
  children,
}: {
  value?: Partial<typeof defaultAnnotationState>;
  children: ReactNode;
}) {
  const state = useMemo(() => ({ ...defaultAnnotationState, ...value }), [value]);
  return <AnnotationContext.Provider value={state}>{children}</AnnotationContext.Provider>;
}

export function useNodeBananaHostDebugValue() {
  return useContext(WorkflowContext);
}
