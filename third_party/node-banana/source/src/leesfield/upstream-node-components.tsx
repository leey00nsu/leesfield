"use client";

import { useCanvasTranslation } from "./localization";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNodes, type NodeProps } from "@xyflow/react";
import { ControlPanel } from "../components/nodes/ControlPanel";
import {
  AnnotationHostProvider,
  NodeBananaUpstreamHostProvider,
  type HostNodeData,
  type NodeBananaUpstreamHostValue,
  browseRegistry,
  expandRegistry,
  useWorkflowStore,
} from "./upstream-node-host";
import { AnnotationNode } from "../components/nodes/AnnotationNode";
import { AnnotationModal } from "../components/AnnotationModal";
import { PromptEditorModal } from "../components/modals/PromptEditorModal";
import { AudioInputNode } from "../components/nodes/AudioInputNode";
import { EaseCurveNode } from "../components/nodes/EaseCurveNode";
import { GenerateAudioNode } from "../components/nodes/GenerateAudioNode";
import { GenerateImageNode } from "../components/nodes/GenerateImageNode";
import { GenerateVideoNode } from "../components/nodes/GenerateVideoNode";
import { GifEncoderNode } from "../components/nodes/GifEncoderNode";
import { ImageCompareNode } from "../components/nodes/ImageCompareNode";
import { ImageInputNode } from "../components/nodes/ImageInputNode";
import { ImageResizeNode } from "../components/nodes/ImageResizeNode";
import { OutputGalleryNode } from "../components/nodes/OutputGalleryNode";
import { OutputNode } from "../components/nodes/OutputNode";
import { PromptConstructorNode } from "../components/nodes/PromptConstructorNode";
import { PromptConstructorEditorModal } from "../components/modals/PromptConstructorEditorModal";
import { parseVarTags } from "../utils/parseVarTags";
import { PromptNode } from "../components/nodes/PromptNode";
import { RemoveBackgroundNode } from "../components/nodes/RemoveBackgroundNode";
import { SplitGridNode } from "../components/nodes/SplitGridNode";
import { VideoFrameGrabNode } from "../components/nodes/VideoFrameGrabNode";
import { VideoInputNode } from "../components/nodes/VideoInputNode";
import { VideoStitchNode } from "../components/nodes/VideoStitchNode";
import { VideoTrimNode } from "../components/nodes/VideoTrimNode";
import { FloatingNodeHeader } from "../components/nodes/FloatingNodeHeader";
import { commentNavigationForNode } from "./upstream-node-host";

export const nodeBananaUpstreamComponents = {
  "input.image": ImageInputNode,
  "input.audio": AudioInputNode,
  "input.video": VideoInputNode,
  "input.prompt": PromptNode,
  "process.promptConstructor": PromptConstructorNode,
  "generate.image": GenerateImageNode,
  "generate.audio": GenerateAudioNode,
  "generate.video": GenerateVideoNode,
  "edit.image.annotation": AnnotationNode,
  "edit.image.resize": ImageResizeNode,
  "edit.image.removeBackground": RemoveBackgroundNode,
  "edit.image.splitGrid": SplitGridNode,
  "edit.image.gif": GifEncoderNode,
  "edit.video.stitch": VideoStitchNode,
  "edit.video.trim": VideoTrimNode,
  "edit.video.frameGrab": VideoFrameGrabNode,
  "edit.video.easeCurve": EaseCurveNode,
  "output.single": OutputNode,
  "output.gallery": OutputGalleryNode,
  "inspect.imageCompare": ImageCompareNode,
} as const;

export type NodeBananaUpstreamCanonicalKind = keyof typeof nodeBananaUpstreamComponents;

export const nodeBananaUpstreamComponentNames = {
  "input.image": "ImageInputNode",
  "input.audio": "AudioInputNode",
  "input.video": "VideoInputNode",
  "input.prompt": "PromptNode",
  "process.promptConstructor": "PromptConstructorNode",
  "generate.image": "GenerateImageNode",
  "generate.audio": "GenerateAudioNode",
  "generate.video": "GenerateVideoNode",
  "edit.image.annotation": "AnnotationNode",
  "edit.image.resize": "ImageResizeNode",
  "edit.image.removeBackground": "RemoveBackgroundNode",
  "edit.image.splitGrid": "SplitGridNode",
  "edit.image.gif": "GifEncoderNode",
  "edit.video.stitch": "VideoStitchNode",
  "edit.video.trim": "VideoTrimNode",
  "edit.video.frameGrab": "VideoFrameGrabNode",
  "edit.video.easeCurve": "EaseCurveNode",
  "output.single": "OutputNode",
  "output.gallery": "OutputGalleryNode",
  "inspect.imageCompare": "ImageCompareNode",
} as const;

function objectValue(value: unknown): HostNodeData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as HostNodeData
    : {};
}

const annotationOpeners = new Map<string, () => void>();

function dataUrlMediaType(kind: string): "image" | "audio" | "video" | null {
  if (kind === "input.image") return "image";
  if (kind === "input.audio") return "audio";
  if (kind === "input.video") return "video";
  return null;
}

function dataUrlField(kind: string): "image" | "audioFile" | "video" | null {
  if (kind === "input.image") return "image";
  if (kind === "input.audio") return "audioFile";
  if (kind === "input.video") return "video";
  return null;
}

export function upstreamDataForNode(data: HostNodeData): HostNodeData {
  const config = objectValue(data.config);
  const parameters = objectValue(config.parameters);
  const presentation = objectValue(config.presentation);
  const kind = String(data.canonicalKind ?? "");
  const rawStatus = String(data.executionStatus ?? "idle");
  const status = ["pending", "processing", "uploading"].includes(rawStatus)
    ? "loading"
    : ["failed", "cancelled"].includes(rawStatus)
      ? "error"
      : rawStatus === "completed"
        ? "idle"
        : rawStatus;
  const upstream: HostNodeData = {
    // Keep host-projected runtime metadata (duration, dimensions, encoder
    // capability, durable asset refs) available to the actual upstream
    // component. Canonical config is still overwritten below and remains the
    // only persisted source of authoring values.
    ...data,
    ...parameters,
    parameters,
    clipOrder: Array.isArray(parameters.clipOrder) ? parameters.clipOrder : [],
    canonicalKind: kind,
    config,
    status,
    error: data.error ?? null,
    progress: data.executionProgress ?? 0,
    customTitle: presentation.customTitle,
    comment: presentation.comment,
    isOptional: presentation.isOptional,
  };

  switch (kind) {
    case "input.image":
      return { ...upstream, image: data.image ?? null, filename: data.filename ?? config.filename ?? null };
    case "input.audio":
      return { ...upstream, audioFile: data.audioFile ?? null, filename: data.filename ?? config.filename ?? null };
    case "input.video":
      return { ...upstream, video: data.video ?? null, filename: data.filename ?? config.filename ?? null };
    case "process.promptConstructor":
      return { ...upstream, template: config.template ?? "", outputText: data.outputText ?? null };
    case "input.prompt":
      return { ...upstream, prompt: data.prompt ?? config.text ?? "", variableName: config.variableName ?? "" };
    case "generate.image":
      return {
        ...upstream,
        prompt: data.prompt ?? config.prompt ?? "",
        internalPrompt: data.internalPrompt ?? config.prompt ?? "",
        promptConnected: data.promptConnected === true,
        supportsImageInput: data.supportsImageInput === true,
        // A null model key is an intentional upstream placeholder. Do not
        // synthesize the old Gemini default here: doing so makes a cleared
        // external selection reappear as a stale model on the next render.
        model: Object.hasOwn(config, "modelKey") ? config.modelKey : data.model,
        inputSchema: Array.isArray(parameters.inputSchema) ? parameters.inputSchema : undefined,
        outputImage: data.outputImage ?? null,
        imageHistory: Array.isArray(data.imageHistory) ? data.imageHistory : [],
        selectedHistoryIndex: Number.isInteger(data.selectedHistoryIndex) ? data.selectedHistoryIndex : undefined,
        selectedModel: data.selectedModel,
      };
    case "generate.audio":
      return {
        ...upstream,
        prompt: data.prompt ?? config.prompt ?? "",
        internalPrompt: data.internalPrompt ?? config.prompt ?? "",
        promptConnected: data.promptConnected === true,
        inputSchema: Array.isArray(parameters.inputSchema) ? parameters.inputSchema : undefined,
        outputAudio: data.outputAudio ?? null,
        audioHistory: Array.isArray(data.audioHistory) ? data.audioHistory : [],
        selectedAudioHistoryIndex: Number.isInteger(data.selectedAudioHistoryIndex) ? data.selectedAudioHistoryIndex : undefined,
        selectedModel: data.selectedModel,
      };
    case "generate.video":
      return {
        ...upstream,
        prompt: data.prompt ?? config.prompt ?? "",
        internalPrompt: data.internalPrompt ?? config.prompt ?? "",
        promptConnected: data.promptConnected === true,
        inputSchema: Array.isArray(parameters.inputSchema) ? parameters.inputSchema : undefined,
        supportsImageInput: data.supportsImageInput === true,
        outputVideo: data.outputVideo ?? null,
        videoHistory: Array.isArray(data.videoHistory) ? data.videoHistory : [],
        selectedVideoHistoryIndex: Number.isInteger(data.selectedVideoHistoryIndex) ? data.selectedVideoHistoryIndex : undefined,
        selectedModel: data.selectedModel,
      };
    case "edit.image.annotation":
      return {
        ...upstream,
        sourceImage: data.sourceImage ?? null,
        annotations: Array.isArray(parameters.shapes) ? parameters.shapes : [],
        outputImage: data.outputImage ?? null,
      };
    case "edit.image.resize":
      return {
        ...upstream,
        sourceImage: data.sourceImage ?? null,
        outputImage: data.outputImage ?? null,
        mode: parameters.mode ?? "exact",
        width: parameters.width ?? 128,
        height: parameters.height ?? 128,
        maxEdge: parameters.maxEdge ?? 128,
        scalePct: parameters.scalePct ?? 100,
        fit: parameters.fit ?? "contain",
        padColor: parameters.padColor ?? "#00000000",
        format: parameters.format ?? "png",
        quality: parameters.quality ?? 0.9,
        outputDimensions: data.outputDimensions ?? null,
        outputBytes: data.outputBytes ?? null,
      };
    case "edit.image.removeBackground":
      return { ...upstream, outputImage: data.outputImage ?? null, model: parameters.model ?? "isnet_fp16" };
    case "edit.image.splitGrid":
      return {
        ...upstream,
        sourceImage: data.sourceImage ?? null,
        gridRows: parameters.rows ?? 2,
        gridCols: parameters.cols ?? 2,
        colOffsets: parameters.colOffsets ?? [],
        rowOffsets: parameters.rowOffsets ?? [],
      };
    case "edit.image.gif":
      return {
        ...upstream,
        frames: data.frames ?? [],
        frameGroups: data.frameGroups,
        clipOrder: parameters.clipOrder ?? [],
        outputGif: data.outputGif ?? null,
        fps: parameters.fps ?? 8,
        loopCount: parameters.loopCount ?? 0,
        colorCount: parameters.colorCount ?? 128,
        dither: parameters.dither ?? false,
        targetMaxBytes: parameters.targetMaxBytes ?? 128 * 1024,
        outputDimensions: data.outputDimensions ?? null,
        outputBytes: data.outputBytes ?? null,
      };
    case "edit.video.stitch":
      return {
        ...upstream,
        encoderSupported: typeof data.encoderSupported === "boolean" ? data.encoderSupported : null,
        clipOrder: parameters.clipOrder ?? [],
        loopCount: parameters.repeat ?? 1,
        stripAudio: parameters.stripAudio ?? false,
        outputVideo: data.outputVideo ?? null,
      };
    case "edit.video.trim":
      return {
        ...upstream,
        encoderSupported: typeof data.encoderSupported === "boolean" ? data.encoderSupported : null,
        duration: typeof data.duration === "number" ? data.duration : null,
        startTime: typeof parameters.startMs === "number" ? parameters.startMs / 1_000 : 0,
        endTime: typeof parameters.endMs === "number" ? parameters.endMs / 1_000 : 5,
        stripAudio: parameters.stripAudio ?? false,
        outputVideo: data.outputVideo ?? null,
      };
    case "edit.video.frameGrab":
      return { ...upstream, framePosition: parameters.position ?? "first", outputImage: data.outputImage ?? null };
    case "edit.video.easeCurve":
      return {
        ...upstream,
        encoderSupported: typeof data.encoderSupported === "boolean" ? data.encoderSupported : null,
        bezierHandles: parameters.bezier ?? [0.42, 0, 0.58, 1],
        easingPreset: parameters.easingPreset ?? "easeInOutSine",
        outputDuration: typeof parameters.outputDurationMs === "number" ? parameters.outputDurationMs / 1_000 : 1.5,
        outputVideo: data.outputVideo ?? null,
      };
    case "output.single":
      return { ...upstream, image: data.image ?? null, video: data.video ?? null, audio: data.audio ?? null };
    case "output.gallery":
      return {
        ...upstream,
        images: data.images ?? [],
        imageRefs: data.imageRefs ?? [],
        videos: data.videos ?? [],
        videoRefs: data.videoRefs ?? [],
        audios: data.audios ?? [],
        audioRefs: data.audioRefs ?? [],
      };
    case "inspect.imageCompare":
      return { ...upstream, imageA: data.imageA ?? null, imageB: data.imageB ?? null };
    default:
      return upstream;
  }
}

function setDefined(target: HostNodeData, key: string, value: unknown) {
  if (value !== undefined) target[key] = value;
}

function setOrDelete(target: HostNodeData, key: string, value: unknown) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function secondsToMilliseconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1_000)
    : undefined;
}

export function canonicalPatchForNode(data: HostNodeData, patch: HostNodeData): HostNodeData {
  const currentConfig = objectValue(data.config);
  const currentParameters = objectValue(currentConfig.parameters);
  const kind = String(data.canonicalKind ?? "");
  // A generation `parameters` patch is a complete snapshot from the upstream
  // ModelParameters control. Treat it as replacement data: merging here
  // resurrects fields from the previous model after a parameter is deleted or
  // after the model/provider changes. Other upstream presenters use partial
  // parameter patches (for example, Split Grid's row/column controls), so
  // those retain the canonical merge behavior below.
  const hasParametersPatch = kind.startsWith("generate.") && Object.hasOwn(patch, "parameters");
  const nextParameters: HostNodeData = hasParametersPatch
    ? { ...objectValue(patch.parameters) }
    : { ...currentParameters };
  // The image-generation contract serializes seed as a string, including
  // numeric defaults returned by provider schemas (for example Gradio's
  // default seed of 42). Keep this invariant at the upstream/canonical
  // boundary regardless of which upstream control emitted the snapshot.
  if (kind === "generate.image" && typeof nextParameters.seed === "number" && Number.isFinite(nextParameters.seed)) {
    nextParameters.seed = String(nextParameters.seed);
  }
  const nextConfig: HostNodeData = { ...currentConfig };

  if (kind === "process.promptConstructor") {
    if (typeof patch.template === "string") nextConfig.template = patch.template;
  } else if (kind === "input.prompt") {
    if (typeof patch.prompt === "string") nextConfig.text = patch.prompt;
    if (Object.hasOwn(patch, "variableName")) {
      const variableName = typeof patch.variableName === "string" ? patch.variableName.trim() : "";
      if (variableName) nextConfig.variableName = variableName;
      else delete nextConfig.variableName;
    }
  } else if (["input.image", "input.audio", "input.video"].includes(kind)) {
    const field = dataUrlField(kind);
    if (field && Object.hasOwn(patch, field) && patch[field] == null) {
      nextConfig.assetId = null;
      delete nextConfig.filename;
    }
  } else if (kind.startsWith("generate.")) {
    if (typeof patch.prompt === "string") nextConfig.prompt = patch.prompt;
    // `selectedModel` is present for both a real model and the upstream
    // "Select model..." placeholder. The latter must clear the canonical key;
    // falling back to the old `modelKey` leaves a stale external model alive.
    if (Object.hasOwn(patch, "selectedModel")) {
      const selectedModel = objectValue(patch.selectedModel);
      const modelId = typeof selectedModel.modelId === "string" && selectedModel.modelId.length > 0
        ? selectedModel.modelId
        : null;
      nextConfig.modelKey = modelId;
    } else if (Object.hasOwn(patch, "model")) {
      nextConfig.modelKey = typeof patch.model === "string" && patch.model.length > 0
        ? patch.model
        : null;
    }
    for (const key of ["aspectRatio", "resolution", "useGoogleSearch", "useImageSearch", "inputSchema"]) {
      if (Object.hasOwn(patch, key)) setOrDelete(nextParameters, key, patch[key]);
    }
  } else if (kind === "edit.image.annotation") {
    if (Array.isArray(patch.annotations)) nextParameters.shapes = patch.annotations;
  } else if (kind === "edit.image.resize") {
    for (const key of ["mode", "width", "height", "maxEdge", "scalePct", "fit", "padColor", "format", "quality"]) {
      setDefined(nextParameters, key, patch[key]);
    }
  } else if (kind === "edit.image.removeBackground") {
    setDefined(nextParameters, "model", patch.model);
  } else if (kind === "edit.image.splitGrid") {
    setDefined(nextParameters, "rows", patch.gridRows ?? patch.rows);
    setDefined(nextParameters, "cols", patch.gridCols ?? patch.cols);
    if (Object.hasOwn(patch, "colOffsets")) {
      nextParameters.colOffsets = Array.isArray(patch.colOffsets) ? patch.colOffsets : [];
    }
    if (Object.hasOwn(patch, "rowOffsets")) {
      nextParameters.rowOffsets = Array.isArray(patch.rowOffsets) ? patch.rowOffsets : [];
    }
  } else if (kind === "edit.image.gif") {
    for (const key of ["fps", "loopCount", "colorCount", "dither", "targetMaxBytes", "clipOrder"]) {
      setDefined(nextParameters, key, patch[key]);
    }
  } else if (kind === "edit.video.stitch") {
    setDefined(nextParameters, "repeat", patch.loopCount ?? patch.repeat);
    setDefined(nextParameters, "stripAudio", patch.stripAudio);
    setDefined(nextParameters, "clipOrder", patch.clipOrder);
  } else if (kind === "edit.video.trim") {
    setDefined(nextParameters, "startMs", patch.startMs ?? secondsToMilliseconds(patch.startTime));
    setDefined(nextParameters, "endMs", patch.endMs ?? secondsToMilliseconds(patch.endTime));
    setDefined(nextParameters, "stripAudio", patch.stripAudio);
  } else if (kind === "edit.video.frameGrab") {
    setDefined(nextParameters, "position", patch.framePosition ?? patch.position);
  } else if (kind === "edit.video.easeCurve") {
    setDefined(nextParameters, "outputDurationMs", patch.outputDurationMs ?? secondsToMilliseconds(patch.outputDuration));
    setDefined(nextParameters, "easingPreset", patch.easingPreset);
    setDefined(nextParameters, "bezier", patch.bezier ?? patch.bezierHandles);
  }

  if (kind.startsWith("generate.") || Object.keys(nextParameters).length > 0 || currentConfig.parameters !== undefined) {
    nextConfig.parameters = nextParameters;
  }

  const currentPresentation = objectValue(currentConfig.presentation);
  const nextPresentation = { ...currentPresentation };
  if (Object.hasOwn(patch, "customTitle")) nextPresentation.customTitle = patch.customTitle;
  if (Object.hasOwn(patch, "comment")) nextPresentation.comment = patch.comment;
  if (Object.hasOwn(patch, "isOptional")) nextPresentation.isOptional = patch.isOptional;
  if (Object.keys(nextPresentation).length > 0 || currentConfig.presentation !== undefined) {
    nextConfig.presentation = nextPresentation;
  }
  const transientPatch: HostNodeData = {};
  for (const key of ["encoderSupported", "duration", "outputDimensions", "outputBytes", "parametersExpanded"]) {
    if (Object.hasOwn(patch, key)) transientPatch[key] = patch[key];
  }
  const outputField = kind === "generate.image" || kind === "edit.image.annotation" || kind === "edit.image.resize"
    || kind === "edit.image.removeBackground" || kind === "edit.video.frameGrab"
    ? "outputImage"
    : kind === "edit.image.gif"
      ? "outputGif"
    : kind === "generate.video" || kind === "edit.video.stitch" || kind === "edit.video.trim" || kind === "edit.video.easeCurve"
      ? "outputVideo"
      : kind === "generate.audio"
        ? "outputAudio"
        : null;
  const outputWasCleared = outputField !== null
    && Object.hasOwn(patch, outputField)
    && patch[outputField] == null;
  return {
    config: nextConfig,
    ...(Object.hasOwn(patch, "selectedOutputAssetId")
      ? { selectedOutputAssetId: patch.selectedOutputAssetId ?? null }
      : outputWasCleared
        ? { selectedOutputAssetId: null }
      : {}),
    ...(Object.keys(transientPatch).length > 0
      ? { __upstreamTransient: transientPatch }
      : {}),
  };
}

const upstreamHeaderTypeForKind: Record<string, string> = {
  "input.image": "imageInput",
  "input.audio": "audioInput",
  "input.video": "videoInput",
  "input.prompt": "prompt",
  "process.promptConstructor": "promptConstructor",
  "generate.image": "nanoBanana",
  "generate.audio": "generateAudio",
  "generate.video": "generateVideo",
  "edit.image.annotation": "annotation",
  "edit.image.resize": "imageResize",
  "edit.image.removeBackground": "removeBackground",
  "edit.image.splitGrid": "splitGrid",
  "edit.image.gif": "gifEncoder",
  "edit.video.stitch": "videoStitch",
  "edit.video.trim": "videoTrim",
  "edit.video.frameGrab": "videoFrameGrab",
  "edit.video.easeCurve": "easeCurve",
  "output.single": "output",
  "output.gallery": "outputGallery",
  "inspect.imageCompare": "imageCompare",
};

const upstreamHeaderTitleForKind: Record<string, string> = {
  "input.image": "Image Input",
  "input.audio": "Audio Input",
  "input.video": "Video Input",
  "input.prompt": "Prompt",
  "process.promptConstructor": "Prompt Constructor",
  "generate.image": "Generate Image",
  "generate.audio": "Generate Audio",
  "generate.video": "Generate Video",
  "edit.image.annotation": "Annotation",
  "edit.image.resize": "Resize Image",
  "edit.image.removeBackground": "Remove Background",
  "edit.image.splitGrid": "Split Grid",
  "edit.image.gif": "GIF Encoder",
  "edit.video.stitch": "Video Stitch",
  "edit.video.trim": "Video Trim",
  "edit.video.frameGrab": "Video Frame Grab",
  "edit.video.easeCurve": "Ease Curve",
  "output.single": "Output",
  "output.gallery": "Output Gallery",
  "inspect.imageCompare": "Image Compare",
};

function adaptedHostNodes(
  host: NodeBananaUpstreamHostValue | undefined,
): HostNodeData[] {
  if (!Array.isArray(host?.nodes)) return [];
  return host.nodes.map((node) => {
    const rawNode = objectValue(node);
    const id = typeof rawNode.id === "string" ? rawNode.id : "";
    const rawData = objectValue(rawNode.data);
    const resolved = host?.resolveNodeData?.(id) ?? {};
    return { ...rawNode, data: upstreamDataForNode({ ...rawData, ...resolved }) };
  });
}

export type NodeBananaUpstreamNodeProps = NodeProps & {
  host?: NodeBananaUpstreamHostValue;
  onUpdateNodeData?: (nodeId: string, patch: HostNodeData) => void;
  onRegenerateNode?: (nodeId: string) => void;
  onOpenAnnotation?: (nodeId: string) => void;
  onCloseAnnotation?: (nodeId: string) => void;
};

export type NodeBananaUpstreamHeaderProps = {
  runtimeData: HostNodeData;
  position: { x: number; y: number };
  width: number;
  selected?: boolean;
  isExecuting?: boolean;
  host?: NodeBananaUpstreamHostValue;
  onUpdateNodeData?: (nodeId: string, patch: HostNodeData) => void;
  onRegenerateNode?: (nodeId: string) => void;
  onOpenAnnotation?: (nodeId: string) => void;
  onExpandNode?: (nodeId: string, nodeType: string) => void;
  onCloseAnnotation?: (nodeId: string) => void;
  runReady?: boolean;
  runDisabledReason?: string | null;
  onCancelNode?: (nodeId: string) => Promise<void>;
};

/**
 * Renders the actual upstream floating header in the host canvas overlay.
 * `BaseNode` intentionally does not include this overlay; upstream's
 * WorkflowCanvas owns it, so the adapter provides the same ownership boundary.
 */
export function NodeBananaUpstreamHeader({
  runtimeData,
  position,
  width,
  selected = false,
  isExecuting = false,
  host,
  onUpdateNodeData,
  onRegenerateNode,
  onOpenAnnotation,
  onExpandNode,
  onCloseAnnotation: _onCloseAnnotation,
  runReady,
  runDisabledReason,
  onCancelNode,
}: NodeBananaUpstreamHeaderProps): ReactNode {
  const tc = useCanvasTranslation();
  const [promptOpen, setPromptOpen] = useState(false);
  const [constructorOpen, setConstructorOpen] = useState(false);
  const parentHost = useWorkflowStore();
  const kind = String(runtimeData.canonicalKind ?? "");
  const type = upstreamHeaderTypeForKind[kind];
  if (!type) return null;
  const upstreamData = upstreamDataForNode({
    ...runtimeData,
    ...(host?.resolveNodeData?.(String(runtimeData.id ?? "")) ?? {}),
  });
  const nodeId = String(runtimeData.id ?? "");
  const constructorVariables = (() => {
    const sources = (host?.edges ?? parentHost.edges).filter((edge) => edge.target === nodeId && edge.targetHandle === "text" && !edge.data?.hasPause)
      .map((edge) => adaptedHostNodes(host ?? parentHost).find((node) => node.id === edge.source)).filter(Boolean);
    const variables = new Map<string, { name: string; value: string; nodeId: string }>();
    for (const source of sources) if (source?.type === "prompt" && source.data.variableName) {
      const name = String(source.data.variableName); variables.set(name, { name, value: String(source.data.resolvedPrompt ?? source.data.prompt ?? ""), nodeId: source.id });
    }
    for (const source of sources) for (const variable of parseVarTags(String(source?.data.outputText ?? source?.data.resolvedPrompt ?? source?.data.prompt ?? ""))) {
      if (!variables.has(variable.name)) variables.set(variable.name, { ...variable, nodeId: String(source?.id) });
    }
    return [...variables.values()];
  })();
  const hostReadiness = host?.getNodeRunReadiness?.(nodeId);
  const writable = (host?.writable ?? parentHost.writable) !== false;
  const promptConnected = kind === "input.prompt" && (host?.edges ?? parentHost.edges).some(
    (edge) => edge.target === nodeId && edge.targetHandle === "text" && !edge.data?.hasPause,
  );
  const promptReadOnly = !writable || promptConnected;
  const expandedPrompt = promptConnected
    ? (host?.getConnectedInputs ?? parentHost.getConnectedInputs)(nodeId).text ?? ""
    : typeof upstreamData.prompt === "string" ? upstreamData.prompt : "";
  const resolvedRunReady = writable && (runReady ?? hostReadiness?.ready ?? runtimeData.runReady !== false);
  const resolvedRunDisabledReason = resolvedRunReady
    ? null
    : !writable
      ? "This workflow is read-only."
      : runDisabledReason
      ?? hostReadiness?.reason
      ?? hostReadiness?.reasons?.[0]
      ?? "This node is not ready to run.";
  const splitGridTemplateEditingDisabled = kind === "edit.image.splitGrid"
    && upstreamData.disableSplitGridTemplateEditor === true;
  const commit = onUpdateNodeData ?? host?.onUpdateNodeData;
  const update = (nodeId: string, patch: HostNodeData) => {
    if (!writable) return;
    const latestData = {
      ...runtimeData,
      ...(host?.resolveNodeData?.(nodeId) ?? {}),
    };
    commit?.(nodeId, canonicalPatchForNode(latestData, patch));
  };
  const isInput = kind === "input.image" || kind === "input.audio" || kind === "input.video" || kind === "input.prompt";
  const isOptional = upstreamData.isOptional === true;
  const headerButtons = isInput ? (
    <button
      type="button"
      onClick={() => update(String(runtimeData.id ?? ""), { isOptional: !isOptional })}
      disabled={!writable}
      className={`nodrag nopan rounded px-1.5 py-0.5 text-[10px] transition-colors ${
        isOptional
          ? "border border-amber-500/50 bg-amber-600/80 text-white"
          : "border border-neutral-600 bg-neutral-700 text-neutral-400 hover:text-neutral-200"
      }`}
      title={isOptional ? tc("This input is optional") : tc("Mark input as optional")}
    >
      {isOptional ? tc("Optional") : tc("Required")}
    </button>
  ) : isExecuting && kind.startsWith("edit.") && onCancelNode ? (
    <button type="button" aria-label={tc("Cancel operation")} title={tc("Cancel operation")}
      disabled={!writable}
      onClick={() => { if (writable) void onCancelNode(nodeId); }}
      className="nodrag nopan rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-neutral-700">{tc("Cancel")}</button>
  ) : undefined;
  const isGeneration = kind === "generate.image" || kind === "generate.audio" || kind === "generate.video";
  const headerAction = isGeneration ? (
    <button
      type="button"
      aria-label={tc("Browse models")}
      title={tc("Browse models")}
      disabled={!writable}
      onClick={(event) => {
        event.stopPropagation();
        if (writable) browseRegistry.open(nodeId);
      }}
      className="nodrag nopan rounded border border-neutral-600 bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
    >{tc("Browse")}</button>
  ) : undefined;

  return (
    <NodeBananaUpstreamHostProvider
      value={{
        ...host,
        nodes: adaptedHostNodes(host),
        onUpdateNodeData: update,
        onRegenerateNode,
        onOpenAnnotation,
      }}
    >
      <FloatingNodeHeader
        id={String(runtimeData.id ?? "")}
        type={type}
        isExecuting={isExecuting}
        position={position}
        width={width}
        selected={selected}
        title={upstreamHeaderTitleForKind[kind] ?? kind}
        runReady={resolvedRunReady}
        runDisabledReason={resolvedRunDisabledReason}
        customTitle={upstreamData.customTitle}
        comment={upstreamData.comment}
        focusedCommentNodeId={host?.focusedCommentNodeId}
        commentNavigation={commentNavigationForNode(nodeId, host) ?? undefined}
        provider={upstreamData.selectedModel?.provider}
        headerAction={headerAction}
        headerButtons={headerButtons}
        onCustomTitleChange={(nodeId, title) => update(nodeId, { customTitle: title })}
        onCommentChange={(nodeId, comment) => update(nodeId, { comment })}
        onRunNode={(nodeId) => { if (writable) onRegenerateNode?.(nodeId); }}
        onExpandNode={splitGridTemplateEditingDisabled ? undefined : (nodeId, nodeType) => {
          if (nodeType === "annotation") {
            if (!writable) return;
            annotationOpeners.get(nodeId)?.();
            onOpenAnnotation?.(nodeId);
            return;
          }
          if (nodeType === "promptConstructor") {
            setConstructorOpen(true);
            return;
          }
          if (nodeType === "prompt") {
            setPromptOpen(true);
            return;
          }
          if (expandRegistry.open(nodeId)) {
            return;
          }
          onExpandNode?.(nodeId, nodeType);
        }}
      />
      <PromptConstructorEditorModal isOpen={constructorOpen} initialTemplate={String(upstreamData.template ?? "")}
        availableVariables={constructorVariables} readOnly={!writable}
        onSubmit={(template) => update(nodeId, { template })} onClose={() => setConstructorOpen(false)} />
      <PromptEditorModal
        isOpen={promptOpen}
        initialPrompt={expandedPrompt}
        readOnly={promptReadOnly}
        onSubmit={(prompt) => { if (!promptReadOnly) update(nodeId, { prompt }); }}
        onClose={() => setPromptOpen(false)}
      />
    </NodeBananaUpstreamHostProvider>
  );
}

type AnnotationSessionProps = {
  nodeId: string;
  sourceImage: string | null;
  initialAnnotations: HostNodeData[];
  hostValue: NodeBananaUpstreamHostValue;
  onOpenAnnotation?: (nodeId: string) => void;
  onCloseAnnotation?: (nodeId: string) => void;
  children: ReactNode;
};

function AnnotationSession({
  nodeId,
  sourceImage,
  initialAnnotations,
  hostValue,
  onOpenAnnotation,
  onCloseAnnotation,
  children,
}: AnnotationSessionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [annotations, setAnnotations] = useState<HostNodeData[]>(initialAnnotations);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState("select");
  const [toolOptions, setToolOptions] = useState({
    strokeColor: "#ef4444",
    strokeWidth: 4,
    fillColor: null as string | null,
    fontSize: 24,
    opacity: 1,
  });
  const [past, setPast] = useState<HostNodeData[][]>([]);
  const [future, setFuture] = useState<HostNodeData[][]>([]);

  useEffect(() => {
    if (!isModalOpen) setAnnotations(initialAnnotations);
  }, [initialAnnotations, isModalOpen]);

  const commitAnnotations = useCallback((update: (current: HostNodeData[]) => HostNodeData[]) => {
    setAnnotations((current) => {
      const next = update(current);
      if (next === current) return current;
      setPast((history) => [...history, current]);
      setFuture([]);
      return next;
    });
  }, []);
  const openModal = useCallback(() => {
    if (!sourceImage) return;
    setAnnotations(initialAnnotations);
    setPast([]);
    setFuture([]);
    setSelectedShapeId(null);
    setCurrentTool("select");
    setIsModalOpen(true);
    onOpenAnnotation?.(nodeId);
  }, [initialAnnotations, nodeId, onOpenAnnotation, sourceImage]);
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    onCloseAnnotation?.(nodeId);
  }, [nodeId, onCloseAnnotation]);

  useEffect(() => {
    annotationOpeners.set(nodeId, openModal);
    return () => { annotationOpeners.delete(nodeId); };
  }, [nodeId, openModal]);

  const annotationValue = useMemo(() => ({
    isModalOpen,
    sourceNodeId: nodeId,
    sourceImage,
    annotations,
    selectedShapeId,
    currentTool,
    toolOptions,
    openModal: (_sourceNodeId?: string, _sourceImage?: string, _annotations?: HostNodeData[]) => openModal(),
    closeModal,
    addAnnotation: (shape: HostNodeData) => commitAnnotations((current) => [...current, shape]),
    updateAnnotation: (shapeId: string, patch: HostNodeData) => commitAnnotations((current) =>
      current.map((shape) => shape.id === shapeId ? { ...shape, ...patch } : shape),
    ),
    deleteAnnotation: (shapeId: string) => commitAnnotations((current) => current.filter((shape) => shape.id !== shapeId)),
    clearAnnotations: () => commitAnnotations(() => []),
    selectShape: setSelectedShapeId,
    setCurrentTool,
    setToolOptions: (patch: HostNodeData) => setToolOptions((current) => ({ ...current, ...patch })),
    undo: () => setPast((history) => {
      const previous = history.at(-1);
      if (!previous) return history;
      setAnnotations((current) => {
        setFuture((redoHistory) => [current, ...redoHistory]);
        return previous;
      });
      return history.slice(0, -1);
    }),
    redo: () => setFuture((history) => {
      const next = history[0];
      if (!next) return history;
      setAnnotations((current) => {
        setPast((undoHistory) => [...undoHistory, current]);
        return next;
      });
      return history.slice(1);
    }),
  }), [annotations, closeModal, commitAnnotations, currentTool, isModalOpen, nodeId, openModal, selectedShapeId, sourceImage, toolOptions]);

  return (
    <NodeBananaUpstreamHostProvider value={hostValue}>
      <AnnotationHostProvider value={annotationValue}>
        {children}
        {typeof document !== "undefined" ? createPortal(<AnnotationModal />, document.body) : null}
      </AnnotationHostProvider>
    </NodeBananaUpstreamHostProvider>
  );
}

export function NodeBananaUpstreamNode({
  data,
  id,
  host,
  onUpdateNodeData,
  onRegenerateNode,
  onOpenAnnotation,
  onCloseAnnotation,
  ...nodeProps
}: NodeBananaUpstreamNodeProps) {
  const uploadEpoch = useRef(0);
  useEffect(() => () => { uploadEpoch.current += 1; }, []);
  const runtimeData = data as HostNodeData;
  const kind = String(runtimeData.canonicalKind ?? "");
  const Component = nodeBananaUpstreamComponents[kind as NodeBananaUpstreamCanonicalKind] as ComponentType<any> | undefined;
  const commit = onUpdateNodeData ?? host?.onUpdateNodeData;
  const update = useCallback((nodeId: string, patch: HostNodeData) => {
    const epoch = ++uploadEpoch.current;
    const mediaType = dataUrlMediaType(kind);
    const mediaField = dataUrlField(kind);
    const mediaValue = mediaField && typeof patch[mediaField] === "string" ? patch[mediaField] as string : null;
    if (mediaType && mediaValue?.startsWith("data:") && host?.onInputMediaUpload) {
      void host.onInputMediaUpload({
        nodeId,
        mediaType,
        dataUrl: mediaValue,
        filename: typeof patch.filename === "string" ? patch.filename : null,
        mimeType: mediaValue.slice(5, mediaValue.indexOf(";")) || null,
      }).then(({ assetId }) => {
        // Only the current mounted input may publish through the Canvas writer.
        if (epoch !== uploadEpoch.current) return;
        commit?.(nodeId, {
          __mergeCanonicalConfig: {
            assetId,
            ...(typeof patch.filename === "string" ? { filename: patch.filename } : {}),
          },
        });
      }).catch((error) => {
        if (error?.name !== "AbortError" && epoch === uploadEpoch.current) host.onHostError?.(error instanceof Error ? error : new Error(String(error)));
      });
      return;
    }
    if (kind === "edit.image.annotation" && typeof patch.outputImage === "string" && patch.outputImage.startsWith("data:") && host?.onAnnotationOutput) {
      // AnnotationModal has already flattened the exact upstream canvas here.
      // Project it immediately while the canonical asset is uploaded so Done
      // never appears to discard the edit.
      commit?.(nodeId, {
        __upstreamTransient: { optimisticAnnotationOutput: patch.outputImage },
      });
      void host.onAnnotationOutput({
        nodeId,
        dataUrl: patch.outputImage,
        annotations: Array.isArray(patch.annotations) ? patch.annotations : [],
      }).then(({ assetId }) => {
        commit?.(nodeId, {
          __mergeCanonicalConfig: {
            parameters: { shapes: Array.isArray(patch.annotations) ? patch.annotations : [] },
          },
          selectedOutputAssetId: assetId,
          __upstreamTransient: { optimisticAnnotationOutput: undefined },
        });
      }).catch((error) => {
        commit?.(nodeId, {
          __upstreamTransient: { optimisticAnnotationOutput: undefined },
        });
        host.onHostError?.(error instanceof Error ? error : new Error(String(error)));
      });
      return;
    }
    const latestData = {
      ...runtimeData,
      ...(host?.resolveNodeData?.(nodeId) ?? {}),
    };
    commit?.(nodeId, canonicalPatchForNode(latestData, patch));
  }, [commit, host, kind, runtimeData]);
  const regenerate = useCallback((nodeId: string) => {
    (onRegenerateNode ?? host?.onRegenerateNode)?.(nodeId);
  }, [host?.onRegenerateNode, onRegenerateNode]);
  const adaptedNodes = useMemo(() => adaptedHostNodes(host), [host]);
  const hostValue: NodeBananaUpstreamHostValue = useMemo(() => ({
    ...host,
    inlineParametersEnabled: host?.inlineParametersEnabled === true,
    nodes: adaptedNodes,
    onUpdateNodeData: update,
    onRegenerateNode: regenerate,
    onOpenAnnotation,
  }), [adaptedNodes, host, kind, onOpenAnnotation, regenerate, update]);
  const upstreamData = upstreamDataForNode({
    ...runtimeData,
    ...(host?.resolveNodeData?.(id) ?? {}),
  });

  if (!Component) {
    return (
      <div
        data-node-banana-component="LeesfieldExtensionNode"
        data-canonical-kind={kind}
        data-node-id={id}
      />
    );
  }

  const body = (
    <div
      className="h-full w-full"
      data-node-banana-component={nodeBananaUpstreamComponentNames[kind as NodeBananaUpstreamCanonicalKind]}
      data-canonical-kind={kind}
      data-node-id={id}
    >
      <Component {...nodeProps} id={id} data={upstreamData} />
    </div>
  );
  if (kind === "edit.image.annotation") {
    return (
      <AnnotationSession
        nodeId={id}
        sourceImage={upstreamData.sourceImage ?? null}
        initialAnnotations={Array.isArray(upstreamData.annotations) ? upstreamData.annotations : []}
        hostValue={hostValue}
        onOpenAnnotation={onOpenAnnotation}
        onCloseAnnotation={onCloseAnnotation}
      >
        {body}
      </AnnotationSession>
    );
  }
  return <NodeBananaUpstreamHostProvider value={hostValue}>{body}</NodeBananaUpstreamHostProvider>;
}

/** Original selected-node side panel, projected through the canonical writer. */
export function NodeBananaUpstreamControlPanel({ host }: { host: NodeBananaUpstreamHostValue }) {
  const selected = useNodes().filter((node) => node.selected);
  const node = selected.length === 1 ? selected[0] : null;
  const typeByKind: Record<string, string> = { "generate.image": "nanoBanana", "generate.video": "generateVideo", "generate.audio": "generateAudio" };
  const latest = node ? { ...node.data, ...(host.resolveNodeData?.(node.id) ?? {}) } : {};
  const type = typeByKind[String(latest.canonicalKind ?? "")];
  const value: NodeBananaUpstreamHostValue = {
    ...host,
    nodes: node && type ? [{ ...node, type, data: upstreamDataForNode(latest) }] : [],
    onUpdateNodeData: (nodeId, patch) => {
      if (host.writable === false || node?.id !== nodeId) return;
      host.onUpdateNodeData?.(nodeId, canonicalPatchForNode({ ...latest, ...(host.resolveNodeData?.(nodeId) ?? {}) }, patch));
    },
  };
  return <NodeBananaUpstreamHostProvider value={value}><ControlPanel /></NodeBananaUpstreamHostProvider>;
}
