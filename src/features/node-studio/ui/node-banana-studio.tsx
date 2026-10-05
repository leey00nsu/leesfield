"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Loader2, X } from "lucide-react";
import { AppMediaOpenButton } from "@/shared/ui/app-media-open-button";
import { NodeTextEditorScope } from "@/shared/ui/node-text-editor";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { SpaceInputMediaChooser } from "./nodes/space-input-media-chooser";
import { useQueryClient } from "@tanstack/react-query";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import type { NodeProps, NodeTypes } from "@xyflow/react";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import { useTranslations } from "next-intl";

import {
  NodeBananaCanvasErrorBoundary,
  NodeBananaCanvasRuntime,
  NodeBananaUpstreamHeader,
  NodeBananaUpstreamNode,
  NodeBananaUpstreamHostProvider,
  GroupBackgroundsPortal,
  GroupControlsOverlay,
  type NodeBananaCanvasProps,
  type NodeBananaCanvasSettings,
  type NodeBananaRuntimeGraph,
  type NodeBananaRuntimeModelItem,
  type NodeBananaRuntimePaletteItem,
  type NodeBananaProviderModel,
} from "@node-banana-runtime/runtime-entry";
import { findNodeDefinition, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { canonicalGroupSchema, type CanonicalGroup, type CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { projectGenerationModelSelectionDefaults } from "../model/generation-model-selection-defaults";
import { applySplitTemplate, materializeSplitResult, splitCellGroups, splitMaterialization, type SplitCellGroup } from "../model/split-grid-materialization";
import { canonicalSplitTemplate, hostedSplitTemplate, type HostedSplitTemplate } from "../model/split-grid-template-adapter";
import { splitTemplateSchema } from "@/shared/generation-graph/split-grid-template";
import { remapSplitClipboardNodes } from "../model/split-grid-clipboard";
import {
  resolveRuntimeImageMaxInputImages,
  resolveRuntimeVideoSupportsInitImage,
} from "@/shared/model-catalog/runtime-utils";

import type { GraphDraft } from "../hook/use-graph-autosave";
import {
  emptyImageNodeInputReadiness,
  resolveImageNodeInputReadiness,
} from "../model/node-input-readiness";
import type { NodeAuthoringCatalogState } from "../model/node-authoring-context";
import { NodeAuthoringProvider } from "../model/node-authoring-context";
import { nodeBananaNodeInventory } from "../model/node-banana-node-inventory";
import { resolveNodeRunReadiness } from "../model/node-run-readiness";
import { resolveNodeInputAssetId, resolveNodeInputAssetIds, resolveNodePromptInput } from "../model/node-graph-inputs";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import type { GenerationGraphFlowEdge, ImageGenerationFlowNode } from "../model/flow-types";
import {
  canonicalDocumentToRuntimeGraph,
  canonicalDocumentToV3Draft,
  connectCreatedRuntimeNode,
  createCanonicalRuntimeNode,
  filterPaletteForConnection,
  graphSnapshotToCanonicalDocument,
  isRuntimeConnectionValid,
  nodeBananaPaletteKinds,
  nodeBananaRuntimeAdapter,
  reconcileRuntimeEdgesForModelChange,
  runtimeGraphToCanonicalDocument,
} from "../runtime/node-banana/node-banana-runtime-adapter";
import { adaptNodeBananaHostGraph } from "../runtime/node-banana/node-banana-host-adapter";
import { CanonicalNode, UnsupportedCanonicalNode } from "./nodes/canonical-node";
import { NodeBananaInputHistoryControl } from "./nodes/node-banana-input-history-control";

import styles from "./node-banana-studio.module.css";
import { downloadImageZip, selectedImageAssetIds } from "../lib/image-zip-download";
import { getMediaAsset, uploadMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { useSpacePreferences } from "../hook/use-space-preferences";
import { useSpaceComments } from "../hook/use-space-comments";
import { validSpaceDefaultParameters } from "@/shared/generation-graph/space-preferences";
import { nodeBananaCatalogModels } from "../runtime/node-banana/node-banana-model-catalog";
import { usePromptPresetCatalog } from "@/entities/prompt-preset/model/use-prompt-preset-catalog";
import { applyNodePromptPreset, presetCanonicalKind, projectNodePromptPresetInputs } from "../model/node-prompt-presets";
import { SpaceGenerationControlPanel } from "./nodes/space-generation-control-panel";
import { SpaceGenerationPrompt } from "./nodes/space-generation-prompt";
import { generationAttachmentSlots, replaceGenerationAttachments, type GenerationAttachmentSlot } from "../model/generation-prompt-attachments";

const NodeBananaHostedRuntimeContext = createContext<object | null>(null);

function withNodeErrorBoundary(
  label: string,
  NodeComponent: ComponentType<NodeProps>,
): ComponentType<NodeProps> {
  function GuardedNode(props: NodeProps) {
    const t = useTranslations("nodeStudio");
    return (
      <NodeBananaCanvasErrorBoundary
        onError={(error) => {
          console.error(`[node-studio] ${label} node render failed`, error);
        }}
        fallback={
          <article className="w-72 rounded-2xl border border-red-300/30 bg-red-950/35 p-4 text-sm text-red-100" role="alert">
            <strong>{t("runtime.nodeFailureTitle")}</strong>
            <p className="mt-2 text-xs text-red-100/65">
              {t("runtime.nodeFailureDescription", { node: label })}
            </p>
          </article>
        }
      >
        <NodeComponent {...props} />
      </NodeBananaCanvasErrorBoundary>
    );
  }
  GuardedNode.displayName = `NodeBananaBoundary(${label})`;
  return GuardedNode;
}

type NodeBananaStudioProps = {
  graph: GenerationGraphSnapshotDto;
  persistedNodeIds?: ReadonlySet<string>;
  onDraftChange: (draft: GraphDraft) => void;
  prepareImageNodeExecution: () => Promise<number>;
  catalog: NodeAuthoringCatalogState;
  writable: boolean;
  readOnlyReason: string | null;
  canvasSettings?: NodeBananaCanvasSettings;
  /** Host callback invoked by an upstream header's Run control. */
  onRegenerateNode?: (nodeId: string) => void | Promise<import("../model/server-execution-tracking").NodeExecutionSubmission>;
  onCancelNode?: (nodeId: string) => Promise<void>;
  /** Host callback invoked by an upstream annotation editor/Expand control. */
  onOpenAnnotation?: (nodeId: string) => void;
  /** Host callback after the upstream annotation modal is closed. */
  onCloseAnnotation?: (nodeId: string) => void;
  /** Persists a browser-selected input file in the Leesfield asset repository. */
  onInputMediaUpload?: (input: {
    nodeId: string;
    mediaType: "image" | "audio" | "video";
    dataUrl: string;
    filename: string | null;
    mimeType: string | null;
  }) => Promise<{ assetId: string }>;
  /** Persists the upstream annotation flatten result in the asset repository. */
  onAnnotationOutput?: (input: {
    nodeId: string;
    dataUrl: string;
    annotations: Record<string, unknown>[];
  }) => Promise<{ assetId: string }>;
  onHostError?: (error: Error) => void;
  /** Host callback invoked by an upstream expandable-node header control. */
  onExpandNode?: (nodeId: string, nodeType: string) => void;
  /** Supplies resolved media/output fields without coupling the vendored runtime to app stores. */
  resolveUpstreamNodeData?: (
    nodeId: string,
    runtimeData: Record<string, unknown>,
  ) => Record<string, unknown> | null | undefined;
};

function imageNodes(graph: NodeBananaRuntimeGraph) {
  return graph.nodes.filter(
    (node) => node.type === "generationNode" && node.data.canonicalKind === "generate.image",
  ) as unknown as ImageGenerationFlowNode[];
}

function imageEdges(graph: NodeBananaRuntimeGraph, nodes: readonly ImageGenerationFlowNode[]) {
  const ids = new Set(nodes.map((node) => node.id));
  return graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) as GenerationGraphFlowEdge[];
}

function focusedPromptConstructorEditor(container: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement
    && container.contains(active)
    && active.matches("input, textarea, [contenteditable='true'], [role='textbox']")
    && active.closest('[data-node-banana-component="PromptConstructorNode"]')
    && !active.closest("[role='dialog'], [role='alertdialog']")
      ? active
      : null;
}

function focusHostedCanvas(container: HTMLElement, selectEditedNode = false) {
  const editor = focusedPromptConstructorEditor(container);
  const editedNode = selectEditedNode ? editor?.closest<HTMLElement>(".react-flow__node") : null;
  editor?.blur();
  editedNode?.click();
  container.querySelector<HTMLElement>('[data-node-banana-component="WorkflowCanvas"][role="application"]')
    ?.focus({ preventScroll: true });
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
}

function graphDraftSignature(graph: ReturnType<typeof canonicalDocumentToV3Draft>) {
  return JSON.stringify(stableJsonValue(graph));
}

function isActiveExecutionStatus(status: unknown) {
  return status === "pending" || status === "processing" || status === "uploading" || status === "loading";
}

const runReadinessMessages: Record<string, string> = {
  NODE_NOT_FOUND: "This node no longer exists.",
  NODE_NOT_EXECUTABLE: "This node does not have a runnable operation.",
  NODE_CONFIG_INVALID: "Fix the node configuration before running.",
  MODEL_REQUIRED: "Select a model before running.",
  PROMPT_REQUIRED: "Enter a prompt or connect a Prompt node.",
  PARAMETERS_INVALID: "Complete or correct the model parameters.",
  INPUT_REQUIRED: "Connect the required input before running.",
  INPUT_NOT_READY: "A connected input does not have a usable result yet.",
  INPUT_UNSUPPORTED: "The selected model does not support this connected input.",
  PROCESSOR_UNAVAILABLE: "The required processor is unavailable.",
};

type OutputGalleryMedia = {
  type: "image" | "video" | "audio";
  src: string;
  assetId?: string | null;
};

function outputGalleryConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function outputGalleryExcludedAssetIds(config: unknown) {
  const excludedAssetIds = outputGalleryConfig(config).excludedAssetIds;
  return Array.isArray(excludedAssetIds)
    ? excludedAssetIds.filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0)
    : [];
}

export function NodeBananaStudio({
  graph,
  persistedNodeIds,
  onDraftChange,
  prepareImageNodeExecution,
  catalog,
  writable,
  readOnlyReason,
  canvasSettings = { panMode: "space", zoomMode: "altScroll", selectionMode: "click" },
  onRegenerateNode,
  onCancelNode,
  onOpenAnnotation,
  onCloseAnnotation,
  onInputMediaUpload,
  onAnnotationOutput,
  onHostError,
  onExpandNode,
  resolveUpstreamNodeData,
}: NodeBananaStudioProps) {
  const preferences = useSpacePreferences();
  const trackModel = preferences?.trackModel;
  const savedNodeDefaults = preferences?.data?.defaults;
  const presets = usePromptPresetCatalog("image", false, writable);
  const availablePresets = presets.data;
  const comments = useSpaceComments();
  const t = useTranslations("nodeStudio");
  const tPresets = useTranslations("promptPresets");
  const initialCanonical = useMemo(() => graphSnapshotToCanonicalDocument(graph), [graph]);
  const initialProjection = useMemo(
    () => nodeBananaRuntimeAdapter.project(initialCanonical),
    [initialCanonical],
  );
  const effectiveWritable = writable && initialProjection.writable;
  const effectiveReason = readOnlyReason ?? initialProjection.readOnlyReason;
  const [runtimeGraph, setRuntimeGraph] = useState(initialProjection.state);
  const [upstreamTransientData, setUpstreamTransientData] = useState<Record<string, Record<string, unknown>>>({});
  const transientGraphIdRef = useRef(graph.id);
  const canonicalRef = useRef(initialCanonical);
  const runtimeGraphRef = useRef(runtimeGraph);
  const onDraftChangeRef = useRef(onDraftChange);
  const prepareImageNodeExecutionRef = useRef(prepareImageNodeExecution);
  const publishedSignatureRef = useRef(
    graphDraftSignature(canonicalDocumentToV3Draft(initialCanonical)),
  );
  const runningNodeIdsRef = useRef(new Set<string>());
  const [submittingNodeIds, setSubmittingNodeIds] = useState<ReadonlySet<string>>(new Set());
  const imageDownloadRef = useRef<AbortController | null>(null);
  const [downloadingImages, setDownloadingImages] = useState(false);
  useEffect(() => {
    setDownloadingImages(false);
    return () => {
      imageDownloadRef.current?.abort();
      imageDownloadRef.current = null;
    };
  }, [graph.id, effectiveWritable]);
  const downloadSelectedImages = useCallback(async (nodeIds: string[]) => {
    if (!effectiveWritable || imageDownloadRef.current) return;
    const controller = new AbortController();
    imageDownloadRef.current = controller;
    setDownloadingImages(true);
    const timeout = setTimeout(() => controller.abort(new Error("Image ZIP download timed out. Please retry.")), 90_000);
    try {
      await downloadImageZip(selectedImageAssetIds(runtimeGraphRef.current, nodeIds), controller.signal);
    } catch (error) {
      if (imageDownloadRef.current === controller) {
        onHostError?.(error instanceof Error ? error : new Error("Image ZIP download failed."));
      }
    } finally {
      clearTimeout(timeout);
      if (imageDownloadRef.current === controller) {
        imageDownloadRef.current = null;
        setDownloadingImages(false);
      }
    }
  }, [effectiveWritable, onHostError]);
  const undoRecorderRef = useRef<((previous: NodeBananaRuntimeGraph) => void) | null>(null);
  const groupGestureRef = useRef<{ previous: NodeBananaRuntimeGraph | null } | null>(null);
  const registerUndoRecorder = useCallback((recorder: ((previous: NodeBananaRuntimeGraph) => void) | null) => {
    undoRecorderRef.current = recorder;
  }, []);

  useEffect(() => {
    if (transientGraphIdRef.current === graph.id) return;
    transientGraphIdRef.current = graph.id;
    setUpstreamTransientData({});
  }, [graph.id]);

  useEffect(() => {
    canonicalRef.current = {
      ...canonicalRef.current,
      title: graph.title,
      version: graph.version,
    };
    // publishRuntimeGraph updates this ref synchronously. A later effect from
    // an older render can otherwise restore stale node config (including
    // Stitch clipOrder) while canonicalRef already contains the new graph.
    onDraftChangeRef.current = onDraftChange;
    prepareImageNodeExecutionRef.current = prepareImageNodeExecution;
    publishedSignatureRef.current = graphDraftSignature(
      canonicalDocumentToV3Draft(canonicalRef.current),
    );
  }, [graph.title, graph.version, onDraftChange, prepareImageNodeExecution]);

  const publishRuntimeGraph = useCallback((nextRuntime: NodeBananaRuntimeGraph) => {
    const canonical = runtimeGraphToCanonicalDocument(canonicalRef.current, nextRuntime);
    const previousById = new Map(canonicalRef.current.nodes.map((node) => [node.id, node]));
    const unavailableIds = new Set(canonicalRef.current.nodes.filter((node) => isUnavailableEditNodeKind(node.kind)).map((node) => node.id));
    const previousEdges = new Map(canonicalRef.current.edges.map((edge) => [edge.id, edge]));
    if (canonical.nodes.some((node) => {
      const previous = previousById.get(node.id);
      return isUnavailableEditNodeKind(node.kind)
        ? !previous || previous.kind !== node.kind || previous.configVersion !== node.configVersion
          || JSON.stringify(stableJsonValue(previous.config)) !== JSON.stringify(stableJsonValue(node.config))
        : previous && isUnavailableEditNodeKind(previous.kind);
    }) || canonical.edges.some((edge) => {
      const previous = previousEdges.get(edge.id);
      return (unavailableIds.has(edge.sourceNodeId) || unavailableIds.has(edge.targetNodeId)
        || (previous && (unavailableIds.has(previous.sourceNodeId) || unavailableIds.has(previous.targetNodeId))))
        && (!previous || previous.sourceNodeId !== edge.sourceNodeId || previous.targetNodeId !== edge.targetNodeId
          || previous.sourcePortId !== edge.sourcePortId || previous.targetPortId !== edge.targetPortId
          || previous.sortOrder !== edge.sortOrder || Boolean(previous.hasPause) !== Boolean(edge.hasPause));
    })) {
      onHostError?.(new Error("This edit node is no longer available."));
      return;
    }
    const draft = canonicalDocumentToV3Draft(canonical);
    const signature = graphDraftSignature(draft);
    const nextGraph = canonicalDocumentToRuntimeGraph(canonical);
    // Generation geometry belongs to the mounted canvas. Reprojection of an
    // authored prompt must not reset a resize to the registry's default size.
    const incomingById = new Map(nextRuntime.nodes.map(node => [node.id, node]));
    nextGraph.nodes = nextGraph.nodes.map(node => {
      const incoming = incomingById.get(node.id);
      if (!String(node.data.canonicalKind).startsWith("generate.") || !incoming) return node;
      const width = incoming.width, height = incoming.height;
      return typeof width === "number" && Number.isFinite(width) && width > 0 &&
        typeof height === "number" && Number.isFinite(height) && height > 0
        ? { ...node, width, height, style: { ...node.style, width, height } } : node;
    });
    if (signature === publishedSignatureRef.current) {
      const geometryChanged = nextGraph.nodes.some(node => {
        const previous = runtimeGraphRef.current.nodes.find(candidate => candidate.id === node.id);
        return previous?.width !== node.width || previous?.height !== node.height;
      });
      if (geometryChanged) {
        runtimeGraphRef.current = nextGraph;
        setRuntimeGraph(nextGraph);
      }
      return;
    }
    canonicalRef.current = canonical;
    runtimeGraphRef.current = nextGraph;
    publishedSignatureRef.current = signature;
    setRuntimeGraph(nextGraph);
    onDraftChangeRef.current(draft);
  }, [onHostError]);

  const incomingGraphSignatureRef = useRef(graphDraftSignature(canonicalDocumentToV3Draft(initialCanonical)));
  useEffect(() => {
    const signature = graphDraftSignature(canonicalDocumentToV3Draft(initialCanonical));
    if (signature === incomingGraphSignatureRef.current) return;
    incomingGraphSignatureRef.current = signature;
    // The workspace also writes automatic result nodes and fixed assets.
    // Accept those snapshots without echoing them through the Canvas writer.
    if (signature === publishedSignatureRef.current) return;
    const next = canonicalDocumentToRuntimeGraph(initialCanonical);
    const previousById = new Map(runtimeGraphRef.current.nodes.map(node => [node.id, node]));
    next.nodes = next.nodes.map(node => {
      const previous = previousById.get(node.id);
      if (!previous || previous.data.canonicalKind !== node.data.canonicalKind) return node;
      const geometry = String(node.data.canonicalKind).startsWith("generate.")
        ? { width: previous.width, height: previous.height, style: previous.style } : {};
      return { ...node, ...geometry, selected: previous.selected, data: { ...previous.data, ...node.data } };
    });
    canonicalRef.current = initialCanonical;
    runtimeGraphRef.current = next;
    publishedSignatureRef.current = signature;
    setRuntimeGraph(next);
  }, [initialCanonical]);

  const prepareExecution = useCallback(
    () => prepareImageNodeExecutionRef.current(),
    [],
  );

  const resolveHostedNodeData = useCallback((
    nodeId: string,
    runtimeData: Record<string, unknown>,
  ): Record<string, unknown> => {
    const transient = upstreamTransientData[nodeId] ?? {};
    const resolved = resolveUpstreamNodeData?.(nodeId, runtimeData) ?? {};
    const config = outputGalleryConfig(runtimeData.config);
    const kind = String(runtimeData.canonicalKind ?? "");
    const models = kind === "generate.image" ? catalog.imageModels : kind === "generate.video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
    const presetInputs = projectNodePromptPresetInputs(config, kind, models.find(model => model.key === config.modelKey));
    const optimisticAnnotation = typeof transient.optimisticAnnotationOutput === "string"
      && transient.optimisticAnnotationOutput.startsWith("data:image/")
      && !(typeof resolved.outputImage === "string" && resolved.outputImage.length > 0)
        ? { outputImage: transient.optimisticAnnotationOutput }
        : {};
    return {
      ...transient,
      ...resolved,
      ...presetInputs,
      ...optimisticAnnotation,
      // Default cells/groups are persisted by the host. Custom template
      // authoring and router orchestration remain outside this execution scope.
      ...(runtimeData.canonicalKind === "edit.image.splitGrid"
        ? { disableSplitGridTemplateEditor: false, materializesSplitCells: true,
            template: (() => { const parsed = splitTemplateSchema.safeParse((runtimeData.config as Record<string, unknown> | undefined)?.template); return parsed.success ? hostedSplitTemplate(parsed.data) : undefined; })(),
            cells: splitMaterialization(runtimeData.config)?.cells.map((cell) => ({
              baseImageNodeId: cell.baseNodeId, nodeIds: cell.nodeIds, groupId: cell.groupId,
            })) ?? [] }
        : {}),
    };
  }, [catalog.imageModels, catalog.videoModels, catalog.audioModels, resolveUpstreamNodeData, upstreamTransientData]);

  const upstreamHostGraph = useMemo(() => {
    const graphWithResolvedData = {
      ...runtimeGraph,
      nodes: runtimeGraph.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ...resolveHostedNodeData(node.id, node.data as Record<string, unknown>),
        },
      })),
    };
    return adaptNodeBananaHostGraph(graphWithResolvedData as never, {
      assistantResults: catalog.assistantResults,
      modelCatalog: [
        ...catalog.imageModels,
        ...(catalog.videoModels ?? []),
        ...(catalog.audioModels ?? []),
      ].map((model) => ({
        id: model.key,
        modelId: model.key,
        provider: model.provider,
        name: model.label,
        displayName: model.label,
        parameters: model.parameters,
        meta: model.meta,
      })),
      resolveAsset: (assetId, context) => {
        const node = runtimeGraph.nodes.find((candidate) => candidate.id === context.nodeId);
        const projected = node
          ? resolveHostedNodeData(node.id, node.data as Record<string, unknown>)
          : null;
        if (!projected) return undefined;
        const fields = context.role === "input"
          ? context.kind === "input.image" ? ["image"]
            : context.kind === "input.audio" ? ["audioFile", "audio"]
              : context.kind === "input.video" ? ["video"]
                : []
          : context.kind === "edit.image.gif" ? ["outputGif"]
            : context.kind.startsWith("edit.image.") || context.kind === "edit.video.frameGrab" || context.kind === "inspect.imageCompare" ? ["outputImage"]
              : context.kind.startsWith("edit.video.") ? ["outputVideo"]
                : context.kind === "generate.image" ? ["outputImage"]
                  : context.kind === "generate.video" ? ["outputVideo"]
                    : context.kind === "generate.audio" ? ["outputAudio"]
                      : ["image", "video", "audio"];
        const url = fields
          .map((field) => projected[field])
          .find((value): value is string => typeof value === "string" && value.length > 0);
        return url ? { id: assetId, url } : undefined;
      },
    });
  }, [catalog.assistantResults, catalog.audioModels, catalog.imageModels, catalog.videoModels, resolveHostedNodeData, runtimeGraph]);

  const reconcileEdgesForConfig = useCallback((
    currentGraph: NodeBananaRuntimeGraph,
    nodeId: string,
    config: unknown,
  ) => reconcileRuntimeEdgesForModelChange(currentGraph, nodeId, config, {
    imageInputLimit: (modelKey) => {
      const model = catalog.imageModels.find((candidate) => candidate.key === modelKey);
      return model ? resolveRuntimeImageMaxInputImages(model) : 0;
    },
    videoSupportsInitImage: (modelKey) => {
      const model = (catalog.videoModels ?? []).find((candidate) => candidate.key === modelKey);
      return model ? resolveRuntimeVideoSupportsInitImage(model) : false;
    },
  }), [catalog.imageModels, catalog.videoModels]);

  const updateUpstreamNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (!effectiveWritable) return;
      const current = runtimeGraphRef.current;
      const currentNode = current.nodes.find((node) => node.id === nodeId);
      if (!currentNode) return;
      const transientPatch = outputGalleryConfig(patch.__upstreamTransient);
      if (Object.keys(transientPatch).length > 0) {
        setUpstreamTransientData((currentData) => {
          const previous = currentData[nodeId] ?? {};
          const next = { ...previous, ...transientPatch };
          if (JSON.stringify(previous) === JSON.stringify(next)) return currentData;
          return { ...currentData, [nodeId]: next };
        });
      }
      const canonicalPatch = { ...patch };
      delete canonicalPatch.__upstreamTransient;
      const mergeConfig = outputGalleryConfig(canonicalPatch.__mergeCanonicalConfig);
      delete canonicalPatch.__mergeCanonicalConfig;
      if (Object.keys(mergeConfig).length > 0) {
        const currentConfig = outputGalleryConfig(currentNode.data.config);
        const mergeParameters = outputGalleryConfig(mergeConfig.parameters);
        const mergePresentation = outputGalleryConfig(mergeConfig.presentation);
        canonicalPatch.config = {
          ...currentConfig,
          ...mergeConfig,
          ...(Object.keys(mergeParameters).length > 0
            ? { parameters: { ...outputGalleryConfig(currentConfig.parameters), ...mergeParameters } }
            : {}),
          ...(Object.keys(mergePresentation).length > 0
            ? { presentation: { ...outputGalleryConfig(currentConfig.presentation), ...mergePresentation } }
            : {}),
        };
      }

      if (Object.keys(canonicalPatch).length === 0) return;
      if (String(currentNode.data.canonicalKind).startsWith("generate.")) {
        const currentConfig = outputGalleryConfig(currentNode.data.config);
        const nextConfig = outputGalleryConfig(canonicalPatch.config);
        if (Object.hasOwn(canonicalPatch, "config")) {
          canonicalPatch.config = projectGenerationModelSelectionDefaults(
            currentConfig,
            nextConfig,
            currentNode.data.canonicalKind === "generate.image" ? catalog.imageModels
              : currentNode.data.canonicalKind === "generate.video" ? catalog.videoModels ?? []
                : catalog.audioModels ?? [],
          );
        }
      }
      const nextEdges = Object.hasOwn(canonicalPatch, "config")
        ? reconcileEdgesForConfig(current, nodeId, canonicalPatch.config)
        : current.edges;
      publishRuntimeGraph({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...canonicalPatch } } : node,
        ),
        edges: nextEdges,
      });
    },
    [catalog.imageModels, catalog.videoModels, catalog.audioModels, effectiveWritable, publishRuntimeGraph, reconcileEdgesForConfig],
  );

  const removeUpstreamEdge = useCallback((edgeId: string) => {
    if (!effectiveWritable) return;
    const current = runtimeGraphRef.current;
    if (!current.edges.some((edge) => edge.id === edgeId)) return;
    publishRuntimeGraph({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    });
  }, [effectiveWritable, publishRuntimeGraph]);

  const clearInputMedia = useCallback((nodeId: string) => {
    if (!effectiveWritable) return;
    const current = runtimeGraphRef.current;
    const node = current.nodes.find(node => node.id === nodeId);
    if (!node || !["input.image", "input.video", "input.audio"].includes(String(node.data.canonicalKind))) return;
    const resolved = resolveHostedNodeData(nodeId, node.data as Record<string, unknown>);
    if (isActiveExecutionStatus(resolved.resultStatus)) return;
    const config = { ...outputGalleryConfig(node.data.config), assetId: null };
    delete (config as Record<string, unknown>).resultSource;
    publishRuntimeGraph({
      ...current,
      nodes: current.nodes.map(candidate => candidate.id === nodeId ? { ...candidate,
        data: { ...candidate.data, config: config as CanonicalJsonValue, selectedOutputAssetId: null } } : candidate),
      edges: current.edges.filter(edge => edge.target !== nodeId),
    });
  }, [effectiveWritable, publishRuntimeGraph, resolveHostedNodeData]);

  const hasMissingInput = useCallback((nodeId: string) => {
    const graph = runtimeGraphRef.current;
    const seen = new Set<string>();
    const visit = (id: string, sourcePortId?: string): boolean => {
      const key = `${id}:${sourcePortId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const node = graph.nodes.find(node => node.id === id);
      const resolved = node && resolveHostedNodeData(id, node.data as Record<string, unknown>);
      if (node?.data.canonicalKind === "edit.video.extractFrames" && sourcePortId) {
        const assets = (resolved?.outputAssetsByPort as Record<string, unknown> | undefined)?.[sourcePortId];
        return !Array.isArray(assets) || assets.length === 0;
      }
      if (resolved?.missingMedia) return true;
      if (outputGalleryConfig(node?.data.config).resultSource) return false;
      return graph.edges.filter(edge => edge.target === id && !edge.data?.hasPause)
        .some(edge => visit(edge.source, String(edge.data?.sourcePortId ?? edge.sourceHandle)));
    };
    return graph.edges.filter(edge => edge.target === nodeId && !edge.data?.hasPause)
      .some(edge => visit(edge.source, String(edge.data?.sourcePortId ?? edge.sourceHandle)));
  }, [resolveHostedNodeData]);

  const runUpstreamNode = useCallback(async (nodeId: string) => {
    if (!effectiveWritable || hasMissingInput(nodeId)) return undefined;
    const node = runtimeGraphRef.current.nodes.find((candidate) => candidate.id === nodeId);
    const kind = typeof node?.data.canonicalKind === "string" ? node.data.canonicalKind : "";
    if (isUnavailableEditNodeKind(kind)) return undefined;
    if (findNodeDefinition(kind)?.executionMode === "none") return undefined;
    const projected = node
      ? resolveHostedNodeData(nodeId, node.data as Record<string, unknown>)
      : undefined;
    if (runningNodeIdsRef.current.has(nodeId) || isActiveExecutionStatus(projected?.executionStatus ?? node?.data.executionStatus)) {
      return undefined;
    }
    if (!onRegenerateNode) {
      const error = new Error("NODE_REGENERATE_HANDLER_UNAVAILABLE");
      onHostError?.(error);
      throw error;
    }
    runningNodeIdsRef.current.add(nodeId);
    setSubmittingNodeIds(new Set(runningNodeIdsRef.current));
    try {
      const result = await onRegenerateNode(nodeId);
      if (result && "completion" in result) {
        await result.completion;
        return;
      }
      if (kind === "edit.image.splitGrid" && result?.outputAssetIds && result.outputGrid) {
        const previous = runtimeGraphRef.current;
        const next = materializeSplitResult(previous, nodeId, result.outputAssetIds, result.outputGrid);
        if (next !== previous) {
          undoRecorderRef.current?.(previous);
          publishRuntimeGraph(next);
        }
        return result;
      }
      if (result && typeof result === "object" && "selectedOutputAssetId" in result) {
        updateUpstreamNodeData(nodeId, {
          selectedOutputAssetId: result.selectedOutputAssetId ?? null,
        });
      }
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onHostError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    } finally {
      runningNodeIdsRef.current.delete(nodeId);
      setSubmittingNodeIds(new Set(runningNodeIdsRef.current));
    }
  }, [effectiveWritable, hasMissingInput, onHostError, onRegenerateNode, publishRuntimeGraph, resolveHostedNodeData, updateUpstreamNodeData]);

  const applyHostedSplitTemplate = useCallback((nodeId: string, options: { template: HostedSplitTemplate; replaceConfirmed?: boolean }) => {
    if (!effectiveWritable) throw new Error("This Space is read-only.");
    if (isUnavailableEditNodeKind(String(runtimeGraphRef.current.nodes.find((node) => node.id === nodeId)?.data.canonicalKind ?? ""))) {
      throw new Error("This edit node is no longer available.");
    }
    if (runningNodeIdsRef.current.has(nodeId)) throw new Error("Wait for the current Split operation to finish.");
    const previous = runtimeGraphRef.current;
    const cellIds = new Set(splitMaterialization(previous.nodes.find((node) => node.id === nodeId)?.data.config)?.cells.flatMap((cell) => cell.nodeIds) ?? []);
    if (previous.nodes.some((node) => cellIds.has(node.id) && (runningNodeIdsRef.current.has(node.id) || isActiveExecutionStatus(resolveHostedNodeData(node.id, node.data).executionStatus)))) {
      throw new Error("Wait for running cell nodes to finish before replacing them.");
    }
    const next = applySplitTemplate(previous, nodeId, canonicalSplitTemplate(options.template), options.replaceConfirmed);
    undoRecorderRef.current?.(previous);
    publishRuntimeGraph(next);
  }, [effectiveWritable, publishRuntimeGraph, resolveHostedNodeData]);

  const mutateSplitGroup = useCallback((groupId: string, action: (group: SplitCellGroup) => SplitCellGroup | null, delta?: { x: number; y: number }) => {
    if (!effectiveWritable) return;
    const current = runtimeGraphRef.current;
    const original = current.groups?.find((group) => group.id === groupId);
    if (!original) return;
    const changed = action(splitCellGroups(current)[groupId]);
    const parsed = changed ? canonicalGroupSchema.safeParse({ ...original,
      title: changed.name, color: changed.color, locked: changed.locked ?? false,
      bounds: { ...changed.position, ...changed.size },
    }) : null;
    if (parsed && !parsed.success) { onHostError?.(new Error("Invalid group properties.")); return; }
    const replacement = parsed?.success ? parsed.data : null;
    if (replacement && JSON.stringify(replacement) === JSON.stringify(original)
      && (!delta || (delta.x === 0 && delta.y === 0))) return;
    const members = new Set(original.memberNodeIds);
    const nextGroups = current.groups!.flatMap((group) => group.id !== groupId ? [group] : replacement ? [replacement] : []);
    const nodes = replacement ? current.nodes : current.nodes.map((node) => {
      if (node.data.canonicalKind !== "edit.image.splitGrid") return node;
      const materialization = splitMaterialization(node.data.config);
      if (!materialization?.cells.some((cell) => cell.groupId === groupId)) return node;
      return { ...node, data: { ...node.data, config: { ...(node.data.config as object),
        materialization: { ...materialization, cells: materialization.cells.map((cell) =>
          cell.groupId === groupId ? { ...cell, groupId: null } : cell) } } } };
    });
    const gesture = groupGestureRef.current;
    if (!gesture || gesture.previous) undoRecorderRef.current?.(gesture?.previous ?? current);
    if (gesture) gesture.previous = null;
    publishRuntimeGraph({ ...current, groups: nextGroups, nodes: delta ? nodes.map((node) => members.has(node.id)
      ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node) : nodes });
  }, [effectiveWritable, onHostError, publishRuntimeGraph]);
  const createGroup = useCallback((ids: string[], measuredNodes: NodeBananaRuntimeGraph["nodes"]) => {
    if (!effectiveWritable) return;
    const current = runtimeGraphRef.current;
    const selected = new Set(ids);
    const members = current.nodes.filter((node) => selected.has(node.id));
    if (!members.length) return;
    if ((current.groups?.length ?? 0) >= 500) { onHostError?.(new Error("The Space has reached its 500 group limit.")); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of members) {
      const measured = measuredNodes.find((candidate) => candidate.id === node.id);
      const width = measured?.measured?.width ?? measured?.width ?? node.width ?? 300;
      const height = measured?.measured?.height ?? measured?.height ?? node.height ?? 280;
      minX = Math.min(minX, node.position.x); minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width); maxY = Math.max(maxY, node.position.y + height);
    }
    const colors: CanonicalGroup["color"][] = ["neutral", "blue", "green", "purple", "orange", "red"];
    const group: CanonicalGroup = {
      id: crypto.randomUUID(), title: `Group ${(current.groups?.length ?? 0) + 1}`,
      color: colors.find((color) => !current.groups?.some((group) => group.color === color)) ?? "neutral",
      bounds: { x: minX - 20, y: minY - 20, width: maxX - minX + 40, height: maxY - minY + 40 },
      locked: false, memberNodeIds: members.map((node) => node.id),
    };
    undoRecorderRef.current?.(current);
    publishRuntimeGraph({ ...current, groups: [...(current.groups ?? []).map((group) => ({ ...group,
      memberNodeIds: group.memberNodeIds.filter((id) => !selected.has(id)),
    })), group] });
  }, [effectiveWritable, onHostError, publishRuntimeGraph]);
  const ungroupNodes = useCallback((ids: string[]) => {
    if (!effectiveWritable) return;
    const current = runtimeGraphRef.current;
    const selected = new Set(ids);
    if (!current.groups?.some((group) => group.memberNodeIds.some((id) => selected.has(id)))) return;
    undoRecorderRef.current?.(current);
    publishRuntimeGraph({ ...current, groups: current.groups.map((group) => ({ ...group,
      memberNodeIds: group.memberNodeIds.filter((id) => !selected.has(id)),
    })) });
  }, [effectiveWritable, publishRuntimeGraph]);
  const groups = useMemo(() => splitCellGroups(runtimeGraph), [runtimeGraph]);
  const groupHost = useMemo(() => ({
    writable: effectiveWritable, groups,
    beginGroupInteraction: () => { groupGestureRef.current = { previous: runtimeGraphRef.current }; },
    endGroupInteraction: () => { groupGestureRef.current = null; },
    updateGroup: (id: string, patch: Partial<SplitCellGroup>) => {
      // Upstream group drag emits position then moveGroupNodes. The latter
      // publishes frame+members together, avoiding two undo entries per move.
      if (Object.keys(patch).length === 1 && patch.position) return;
      mutateSplitGroup(id, (group) => ({ ...group, ...patch }));
    },
    moveGroupNodes: (id: string, delta: { x: number; y: number }) => mutateSplitGroup(id,
      (group) => ({ ...group, position: { x: group.position.x + delta.x, y: group.position.y + delta.y } }), delta),
    deleteGroup: (id: string) => mutateSplitGroup(id, () => null),
    toggleGroupLock: (id: string) => mutateSplitGroup(id, (group) => ({ ...group, locked: !group.locked })),
  }), [effectiveWritable, groups, mutateSplitGroup]);
  const displayGraph = useMemo(() => {
    // Upstream group lock skips scheduled workflow execution, not editing or
    // explicit single-node runs. Read-only is the editing boundary here.
    return { ...runtimeGraph, nodes: runtimeGraph.nodes.map((node) => ({ ...node, draggable: effectiveWritable })) };
  }, [effectiveWritable, runtimeGraph]);

  const getHostedNodeRunReadiness = useCallback(
    (nodeId: string) => {
      const readiness = resolveNodeRunReadiness(
        runtimeGraphToCanonicalDocument(canonicalRef.current, runtimeGraphRef.current),
        nodeId,
        catalog,
      );
      if (hasMissingInput(nodeId)) return {ready: false, reasons: ["INPUT_NOT_READY"]};
      return effectiveWritable
        ? readiness
        : { ...readiness, ready: false, reasons: [effectiveReason ?? "READ_ONLY"] };
    },
    [catalog, effectiveReason, effectiveWritable, hasMissingInput],
  );

  const renderInputHistory = useCallback((
    nodeId: string,
    mediaType: "image" | "audio" | "video",
    selectedAssetId: string | null,
    options?: { open: boolean; onOpenChange: (open: boolean) => void },
  ) => mediaType === "audio" && !options ? null : (
    <NodeBananaInputHistoryControl
      key={`${graph.id}:${nodeId}`}
      nodeId={nodeId}
      mediaType={mediaType}
      selectedAssetId={selectedAssetId}
      open={options?.open}
      onOpenChange={options?.onOpenChange}
      writable={effectiveWritable}
      onSelect={(assetId) => {
        const current = runtimeGraphRef.current.nodes.find((node) => node.id === nodeId);
        const currentConfig = current?.data?.config && typeof current.data.config === "object" && !Array.isArray(current.data.config)
          ? current.data.config as Record<string, unknown>
          : {};
        updateUpstreamNodeData(nodeId, { config: { ...currentConfig, assetId } });
        options?.onOpenChange(false);
      }}
    />
  ), [effectiveWritable, updateUpstreamNodeData, graph.id]);

  const removeOutputGalleryMedia = useCallback((input: {
    nodeId: string;
    index: number;
    item: OutputGalleryMedia;
  }) => {
    if (!effectiveWritable) return;
    const assetId = input.item.assetId;
    if (!assetId) {
      onHostError?.(new Error("OUTPUT_GALLERY_REMOVE_REQUIRES_CANONICAL_ASSET"));
      return;
    }
    const current = runtimeGraphRef.current;
    const node = current.nodes.find((candidate) => candidate.id === input.nodeId);
    if (!node || node.data.canonicalKind !== "output.gallery") return;
    const config = outputGalleryConfig(node.data.config);
    const excludedAssetIds = outputGalleryExcludedAssetIds(config);
    if (excludedAssetIds.includes(assetId)) return;
    publishRuntimeGraph({
      ...current,
      nodes: current.nodes.map((candidate) => candidate.id === input.nodeId
        ? {
            ...candidate,
            data: {
              ...candidate.data,
              config: { ...config, excludedAssetIds: [...excludedAssetIds, assetId] },
            },
          }
        : candidate),
    });
  }, [effectiveWritable, onHostError, publishRuntimeGraph]);

  const extractOutputGalleryMedia = useCallback((input: {
    nodeId: string;
    items: OutputGalleryMedia[];
  }) => {
    if (!effectiveWritable) return;
    const items = input.items.filter((item) => typeof item.assetId === "string" && item.assetId.length > 0);
    if (items.length !== input.items.length) {
      onHostError?.(new Error("OUTPUT_GALLERY_EXTRACT_REQUIRES_CANONICAL_ASSETS"));
      return;
    }
    const current = runtimeGraphRef.current;
    const galleryNode = current.nodes.find((candidate) => candidate.id === input.nodeId);
    if (!galleryNode || galleryNode.data.canonicalKind !== "output.gallery") return;
    const galleryWidth = galleryNode.width ?? galleryNode.measured?.width ?? 320;
    const startX = galleryNode.position.x + galleryWidth + 100;
    let currentY = galleryNode.position.y;
    const gap = 20;
    const newNodes = items.map((item) => {
      const kind: CanonicalNodeKind = item.type === "image"
        ? "input.image"
        : item.type === "video"
          ? "input.video"
          : "input.audio";
      const node = createCanonicalRuntimeNode(kind, crypto.randomUUID(), { x: startX, y: currentY });
      const height = item.type === "audio" ? 200 : 280;
      currentY += height + gap;
      return {
        ...node,
        data: {
          ...node.data,
          config: { ...outputGalleryConfig(node.data.config), assetId: item.assetId },
        },
      };
    });
    if (newNodes.length === 0) return;
    publishRuntimeGraph({ ...current, nodes: [...current.nodes, ...newNodes] });
  }, [effectiveWritable, onHostError, publishRuntimeGraph]);

  const commitHostedNodePositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
    if (!effectiveWritable || Object.keys(positions).length === 0) return;
    const current = runtimeGraphRef.current;
    let changed = false;
    const nodes = current.nodes.map((node) => {
      const position = positions[node.id];
      if (!position || (position.x === node.position.x && position.y === node.position.y)) return node;
      changed = true;
      return { ...node, position };
    });
    if (changed) publishRuntimeGraph({ ...current, nodes });
  }, [effectiveWritable, publishRuntimeGraph]);

  const upstreamHostedModels = useMemo<NodeBananaProviderModel[]>(() => nodeBananaCatalogModels(catalog), [catalog]);

  const recentModels = useMemo(() => (preferences?.data?.recentModelKeys ?? []).flatMap((key, index) => {
    const model = upstreamHostedModels.find((item) => item.id === key);
    return model ? [{ provider: model.provider, modelId: model.id, displayName: model.name, timestamp: -index }] : [];
  }), [preferences?.data?.recentModelKeys, upstreamHostedModels]);
  const trackModelUsage = useCallback((model: { modelId: string }) => trackModel?.(model.modelId), [trackModel]);
  const refreshHostedModels = useCallback(async () => {
    if (catalog.refresh) await catalog.refresh();
    else catalog.retry();
  }, [catalog]);

  const renderGenerationPrompt = useCallback((input: { nodeId: string; connected?: boolean; connectedValue?: string | null }) => {
    // The compiled host may reuse the rendered slot when the prompt text is
    // unchanged. Config-only edits (e.g. repeatCount) must invalidate that slot.
    const node = runtimeGraph.nodes.find(node => node.id === input.nodeId);
    const modality = node?.data.canonicalKind === "generate.image" ? "image"
      : node?.data.canonicalKind === "generate.video" ? "video" : "audio";
    return <SpaceGenerationPrompt {...input} modality={modality} config={outputGalleryConfig(node?.data.config)} progress={resolveUpstreamNodeData?.(input.nodeId, {})?.repeatProgress as { completed: number; failed: number; total: number; running: boolean } | undefined} />;
  }, [runtimeGraph.nodes, resolveUpstreamNodeData]);
  const hostedRuntime = useMemo(() => ({
    comments,
    recentModels,
    trackModelUsage,
    inlineParametersEnabled: preferences?.inlineParametersEnabled ?? false,
    hostedModelsLoading: catalog.isLoading,
    hostedModelsError: catalog.error,
    refreshHostedModels,
    writable: effectiveWritable,
    hostedModels: upstreamHostedModels,
    upstreamHostGraph,
    resolveUpstreamNodeData: resolveHostedNodeData,
    onInputMediaUpload: effectiveWritable ? onInputMediaUpload : undefined,
    onAnnotationOutput: effectiveWritable ? onAnnotationOutput : undefined,
    onCancelNode: effectiveWritable ? onCancelNode : undefined,
    onHostError,
    renderInputHistory,
    renderGenerationPrompt,
    getHostedNodeRunReadiness,
    updateUpstreamNodeData,
    runUpstreamNode,
    materializeSplitGridCells: applyHostedSplitTemplate,
    onOpenAnnotation: effectiveWritable ? onOpenAnnotation : undefined,
    onCloseAnnotation,
    onExpandNode,
    onOutputGalleryRemove: removeOutputGalleryMedia,
    onOutputGalleryExtract: extractOutputGalleryMedia,
    removeEdge: removeUpstreamEdge,
    clearInputMedia,
    commitNodePositions: commitHostedNodePositions,
  }), [
    comments, recentModels, trackModelUsage, preferences?.inlineParametersEnabled, catalog.isLoading, catalog.error, refreshHostedModels, applyHostedSplitTemplate,
    commitHostedNodePositions,
    extractOutputGalleryMedia,
    effectiveWritable,
    getHostedNodeRunReadiness,
    onAnnotationOutput,
    onCloseAnnotation,
    onCancelNode,
    onExpandNode,
    onHostError,
    onInputMediaUpload,
    onOpenAnnotation,
    removeOutputGalleryMedia,
    removeUpstreamEdge,
    clearInputMedia,
    renderInputHistory,
    renderGenerationPrompt,
    resolveHostedNodeData,
    runUpstreamNode,
    updateUpstreamNodeData,
    upstreamHostedModels,
    upstreamHostGraph,
  ]);
  const hostedRuntimeRef = useRef(hostedRuntime);
  hostedRuntimeRef.current = hostedRuntime;
  const canvasHost = useMemo(() => ({
    ...comments, recentModels, trackModelUsage,
    inlineParametersEnabled: preferences?.inlineParametersEnabled ?? false,
    hostedModels: upstreamHostedModels, hostedModelsLoading: catalog.isLoading,
    hostedModelsError: catalog.error, refreshHostedModels, onHostError,
  }), [comments, recentModels, trackModelUsage, preferences?.inlineParametersEnabled, upstreamHostedModels, catalog.isLoading, catalog.error, refreshHostedModels, onHostError]);

  const HostedUpstreamHeaderComponent = useMemo(() => {
    function HostedUpstreamHeaderPresenter({
      node,
    }: {
      node: NodeBananaCanvasProps["graph"]["nodes"][number];
    }) {
      const translatePreset = useTranslations("promptPresets");
      const projectHeaderData = useCallback((data: Record<string, unknown>) => {
        const config = outputGalleryConfig(data.config);
        const presentation = outputGalleryConfig(config.presentation);
        const presetKey = outputGalleryConfig(config.promptPreset).key;
        if (typeof presetKey !== "string" || typeof presentation.customTitle !== "string") return data;
        const customTitle = promptPresetDisplayName({ key: presetKey, name: presentation.customTitle }, translatePreset);
        // Upstream rebuilds its title from config. This copy is display-only.
        return { ...data, config: { ...config, presentation: { ...presentation, customTitle } } };
      }, [translatePreset]);
      const contextRuntime = useContext(NodeBananaHostedRuntimeContext) as typeof hostedRuntimeRef.current | null;
      const current = contextRuntime ?? hostedRuntimeRef.current;
      const data = node.data as Record<string, unknown>;
      const resolvedData = current.resolveUpstreamNodeData(node.id, data);
      const effectiveData = projectHeaderData({ ...data, ...resolvedData });
      const resolveNodeData = useCallback((nodeId: string) => {
        const latest = (runtimeGraphRef.current.nodes.find((candidate) => candidate.id === nodeId)?.data ?? {}) as Record<string, unknown>;
        return projectHeaderData({
          ...latest,
          ...current.resolveUpstreamNodeData(nodeId, latest),
        });
      }, [current, projectHeaderData]);
      const updateHeaderData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
        const latest = (runtimeGraphRef.current.nodes.find(candidate => candidate.id === nodeId)?.data ?? {}) as Record<string, unknown>;
        const original = outputGalleryConfig(outputGalleryConfig(latest.config).presentation);
        const displayed = outputGalleryConfig(outputGalleryConfig(projectHeaderData(latest).config).presentation);
        const patchConfig = outputGalleryConfig(patch.config);
        const patchPresentation = outputGalleryConfig(patchConfig.presentation);
        // Comment/optional edits from upstream include the display config. Keep
        // the stored default identity unless the user actually changes its title.
        const next = original.customTitle !== displayed.customTitle && patchPresentation.customTitle === displayed.customTitle
          ? { ...patch, config: { ...patchConfig, presentation: { ...patchPresentation, customTitle: original.customTitle } } }
          : patch;
        current.updateUpstreamNodeData(nodeId, next);
      }, [current, projectHeaderData]);
      const getNodeRunReadiness = useCallback((nodeId: string) => {
        const readiness = current.getHostedNodeRunReadiness(nodeId);
        return {
          ...readiness,
          reason: readiness.ready ? null : runReadinessMessages[readiness.reasons[0] ?? ""] ?? "This node is not ready to run.",
        };
      }, [current]);
      const headerHost = useMemo(() => ({
        ...current.comments,
        recentModels: current.recentModels,
        trackModelUsage: current.trackModelUsage,
        inlineParametersEnabled: current.inlineParametersEnabled,
        hostedModelsLoading: current.hostedModelsLoading,
        hostedModelsError: current.hostedModelsError,
        refreshHostedModels: current.refreshHostedModels,
        writable: current.writable,
        hostedModels: current.hostedModels,
        nodes: current.upstreamHostGraph.nodes as unknown as Record<string, unknown>[],
        edges: current.upstreamHostGraph.edges as unknown as Record<string, unknown>[],
        getConnectedInputs: current.upstreamHostGraph.getConnectedInputs,
        removeEdge: current.removeEdge,
        commitNodePositions: current.commitNodePositions,
        isRunning: isActiveExecutionStatus(effectiveData.executionStatus),
        resolveNodeData,
        onInputMediaUpload: current.onInputMediaUpload,
        onAnnotationOutput: current.onAnnotationOutput,
        onHostError: current.onHostError,
        onOutputGalleryRemove: current.onOutputGalleryRemove,
        onOutputGalleryExtract: current.onOutputGalleryExtract,
        renderInputHistory: current.renderInputHistory,
        getNodeRunReadiness,
      }), [current, effectiveData.executionStatus, getNodeRunReadiness, resolveNodeData]);
      return (
        <NodeBananaUpstreamHeader
          key={`upstream-header-${node.id}`}
          runtimeData={{ ...effectiveData, id: node.id }}
          position={{ x: 0, y: 0 }}
          width={node.measured?.width ?? node.width ?? (node.style?.width as number) ?? 300}
          selected={node.selected}
          isExecuting={effectiveData.executionStatus === "processing" || effectiveData.executionStatus === "pending" || effectiveData.executionStatus === "uploading"}
          host={headerHost}
          onCancelNode={current.onCancelNode}
          onUpdateNodeData={updateHeaderData}
          onRegenerateNode={current.runUpstreamNode}
          onOpenAnnotation={current.onOpenAnnotation}
          onExpandNode={current.onExpandNode}
          onCloseAnnotation={current.onCloseAnnotation}
        />
      );
    }
    return HostedUpstreamHeaderPresenter;
  }, []);


  const HostedUpstreamNode = useMemo(() => {
    function HostedUpstreamNodeComponent(props: NodeProps) {
      const tMedia = useTranslations("nodeStudio.mediaNodes");
      const tc = useCanvasTranslation();
      const [uploading, setUploading] = useState(false);
      const [choosingMedia, setChoosingMedia] = useState(false);
      const nodeRoot = useRef<HTMLDivElement>(null);
      const uploadVersion = useRef(0);
      const contextRuntime = useContext(NodeBananaHostedRuntimeContext) as typeof hostedRuntimeRef.current | null;
      const current = contextRuntime ?? hostedRuntimeRef.current;
      const runtimeNode = runtimeGraphRef.current.nodes.find((node) => node.id === props.id);
      const resolved = current.resolveUpstreamNodeData?.(
        props.id,
        (runtimeNode?.data ?? {}) as Record<string, unknown>,
      );
      // Use the final host projection, just like the native media presenter;
      // connected inputs can differ from config.assetId or the newest execution.
      const inputKind = String(runtimeNode?.data.canonicalKind ?? props.data.canonicalKind);
      const displayed = current.upstreamHostGraph.nodes.find(node => node.id === props.id)?.data;
      const mediaUrl = displayed?.[inputKind === "input.image" ? "image"
        : inputKind === "input.video" ? "video" : inputKind === "input.audio" ? "audioFile" : ""];
      const showMediaOpen = typeof mediaUrl === "string" && mediaUrl.length > 0
        && !resolved?.missingMedia && (!resolved?.resultStatus || resolved.resultStatus === "completed")
        && !uploading && !props.data.mediaUploading;
      const mediaType = inputKind === "input.image" ? "image" : inputKind === "input.video" ? "video" : inputKind === "input.audio" ? "audio" : null;
      const hasInputConnection = mediaType !== null && (Boolean(outputGalleryConfig(runtimeNode?.data.config).resultSource)
        || current.upstreamHostGraph.edges.some(edge => edge.target === props.id));
      const restoreMediaFocus = useCallback(() => {
        nodeRoot.current?.querySelector<HTMLElement>('[role="button"]:not(.react-flow__handle)')?.focus();
      }, []);
      useEffect(() => { setChoosingMedia(false); }, [mediaUrl, props.data.mediaUploading, current.writable]);
      const isRunning = isActiveExecutionStatus(resolved?.executionStatus ?? runtimeNode?.data.executionStatus);
      const resolveNodeData = useCallback((nodeId: string) => {
        const latest = (runtimeGraphRef.current.nodes.find((node) => node.id === nodeId)?.data ?? {}) as Record<string, unknown>;
        return {
          ...latest,
          ...(current.resolveUpstreamNodeData?.(nodeId, latest) ?? {}),
          ...(['generate.image', 'generate.video', 'generate.audio'].includes(String(latest.canonicalKind))
            ? { outputImage: null, outputVideo: null, outputAudio: null, imageHistory: [], videoHistory: [], audioHistory: [] } : {}),
          ...(() => {
            const preview = current.upstreamHostGraph.nodes.find(node => node.id === nodeId)?.data;
            return preview?.canonicalKind === "input.image" ? {
              image: preview.image, imageRef: preview.imageRef,
              filename: preview.filename, dimensions: preview.dimensions,
              hasConnectedImage: preview.hasConnectedImage,
            } : {};
          })(),
        };
      }, [current]);
      const getNodeRunReadiness = useCallback((nodeId: string) => {
        const readiness = current.getHostedNodeRunReadiness(nodeId);
        return {
          ...readiness,
          reason: readiness.ready ? null : runReadinessMessages[readiness.reasons[0] ?? ""] ?? "This node is not ready to run.",
        };
      }, [current]);
      const uploadInput = useCallback<NonNullable<typeof current.onInputMediaUpload>>(async input => {
        const version = ++uploadVersion.current;
        setUploading(true);
        try { return await current.onInputMediaUpload!(input); }
        finally { if (uploadVersion.current === version) setUploading(false); }
      }, [current]);
      const nodeHost = useMemo(() => ({
        ...current.comments,
        recentModels: current.recentModels,
        trackModelUsage: current.trackModelUsage,
        inlineParametersEnabled: current.inlineParametersEnabled,
        hostedModelsLoading: current.hostedModelsLoading,
        hostedModelsError: current.hostedModelsError,
        refreshHostedModels: current.refreshHostedModels,
        writable: current.writable,
        hostedModels: current.hostedModels,
        nodes: current.upstreamHostGraph.nodes as unknown as Record<string, unknown>[],
        edges: current.upstreamHostGraph.edges as unknown as Record<string, unknown>[],
        getConnectedInputs: current.upstreamHostGraph.getConnectedInputs,
        removeEdge: current.removeEdge,
        commitNodePositions: current.commitNodePositions,
        materializeSplitGridCells: current.materializeSplitGridCells,
        isRunning,
        resolveNodeData,
        onInputMediaUpload: current.onInputMediaUpload ? uploadInput : undefined,
        onAnnotationOutput: current.onAnnotationOutput,
        onHostError: current.onHostError,
        onOutputGalleryRemove: current.onOutputGalleryRemove,
        onOutputGalleryExtract: current.onOutputGalleryExtract,
        renderInputHistory: current.renderInputHistory,
        renderGenerationPrompt: current.renderGenerationPrompt,
        getNodeRunReadiness,
      }), [current, uploadInput, getNodeRunReadiness, isRunning, resolveNodeData]);
      return (
        <>
        <div ref={nodeRoot} className="contents" data-space-media-input={mediaType ?? undefined}
          data-space-media-empty={mediaType && !mediaUrl ? true : undefined}
          data-space-connected-media={hasInputConnection ? true : undefined}
          data-space-input-only={['generate.image', 'generate.video', 'generate.audio'].includes(String(props.data.canonicalKind)) ? true : undefined}
          onClickCapture={event => {
            if (!mediaType || !current.writable || !(event.target instanceof Element)) return;
            const control = event.target.closest<HTMLElement>('button, [role="button"]');
            if (!control || !nodeRoot.current?.contains(control) || control.classList.contains("react-flow__handle")) return;
            if (control.getAttribute("aria-label") === tc("Remove " + mediaType)) {
              event.preventDefault(); event.stopPropagation(); current.clearInputMedia(props.id); return;
            }
            if (control.getAttribute("role") === "button" || control.getAttribute("aria-label") === tc("Choose " + mediaType)) {
              if (hasInputConnection) return;
              event.preventDefault(); event.stopPropagation(); setChoosingMedia(true);
            }
          }}
          onKeyDownCapture={event => {
            if (!mediaType || !current.writable || hasInputConnection || !(event.target instanceof Element)
              || !event.target.matches('[role="button"]:not(.react-flow__handle)') || !["Enter", " "].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation(); setChoosingMedia(true);
          }}>
        <NodeTextEditorScope>
        <NodeBananaUpstreamNode
          {...props}
          host={nodeHost}
          onUpdateNodeData={current.updateUpstreamNodeData}
          onRegenerateNode={current.runUpstreamNode}
          onOpenAnnotation={current.onOpenAnnotation}
          onCloseAnnotation={current.onCloseAnnotation}
        />
        </NodeTextEditorScope>
        </div>
        {runtimeNode && <HostedUpstreamHeaderComponent node={{ ...runtimeNode, selected: props.selected }} />}
        {showMediaOpen ? <AppMediaOpenButton href={mediaUrl as string} compact isolateCanvasEvents
          className={`nodrag nopan ${styles.mediaOpen} ${inputKind === "input.audio" ? styles.mediaOpenAudio : ""}`} /> : null}
        {showMediaOpen && hasInputConnection ? <button type="button" data-space-media-disconnect="" aria-label={tc("Remove " + mediaType)}
          disabled={!current.writable} title={tc("Remove " + mediaType)}
          className={`nodrag nopan ${styles.mediaDisconnect} ${inputKind === "input.audio" ? styles.mediaDisconnectAudio : ""}`}
          onPointerDown={event => event.stopPropagation()} onFocus={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); current.clearInputMedia(props.id); }}><X aria-hidden="true" /></button> : null}
        {mediaType && <SpaceInputMediaChooser open={choosingMedia && current.writable && !hasInputConnection} onOpenChange={setChoosingMedia}
          restoreFocus={restoreMediaFocus} onUpload={() => nodeRoot.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
          renderAssets={options => current.renderInputHistory(props.id, mediaType, outputGalleryConfig(runtimeNode?.data.config).assetId as string | null, options)} />}
        {resolved?.resultStatus && resolved.resultStatus !== "completed" ? <div data-space-result-status={String(resolved.resultStatus)}
          role={resolved.resultStatus === "failed" ? "alert" : "status"} aria-live="polite"
          className={`nodrag nopan ${styles.resultStatus} flex flex-col items-center justify-center gap-2 bg-background px-4 text-center text-sm text-muted-foreground`}
          onPointerDown={event => event.stopPropagation()}>
          {isActiveExecutionStatus(resolved.resultStatus) ? <><Loader2 className="h-6 w-6 animate-spin" /><span>{tMedia("generating")}</span>{typeof resolved.resultProgress === "number" && <span>{resolved.resultProgress}%</span>}</>
            : <span>{tMedia(resolved.resultStatus === "cancelled" ? "resultCancelled" : "resultFailed")}</span>}
        </div> : null}
        {resolved?.missingMedia ? <div role="status" className="nodrag nopan absolute inset-x-2 top-8 z-40 rounded-lg bg-background/95 px-3 py-2 text-xs text-muted-foreground pointer-events-none">{tMedia("missingFile")}</div> : null}
        {(uploading || props.data.mediaUploading) ? <div role="status" aria-live="polite" aria-label={tMedia("uploading")} className="nodrag nopan absolute inset-0 z-50 flex items-center justify-center gap-2 rounded-2xl bg-black/55 text-sm text-white backdrop-blur-sm"><Loader2 className="h-5 w-5 animate-spin" />{tMedia("uploading")}</div> : null}
        </>
      );
    }
    return HostedUpstreamNodeComponent;
  }, [HostedUpstreamHeaderComponent]);

  const hostedNodeTypes = useMemo<NodeTypes>(
    () => ({
      memoNode: withNodeErrorBoundary("memo", CanonicalNode as unknown as ComponentType<NodeProps>),
      leesfieldVideoNode: withNodeErrorBoundary("leesfield-video", CanonicalNode as unknown as ComponentType<NodeProps>),
      leesfieldAssistantNode: withNodeErrorBoundary("leesfield-assistant", CanonicalNode as unknown as ComponentType<NodeProps>),
      generationNode: withNodeErrorBoundary("generation", HostedUpstreamNode),
      canonicalNode: withNodeErrorBoundary("canonical", HostedUpstreamNode),
      unsupportedNode: withNodeErrorBoundary(
        "unsupported",
        UnsupportedCanonicalNode as unknown as ComponentType<NodeProps>,
      ),
    }),
    [HostedUpstreamNode],
  );

  const paletteItems = useMemo<NodeBananaRuntimePaletteItem[]>(
    () =>
      nodeBananaPaletteKinds
        .filter((kind) => !isUnavailableEditNodeKind(kind))
        .map<NodeBananaRuntimePaletteItem>((kind) => {
          const inventory = nodeBananaNodeInventory[kind];
          return {
            kind,
            label: inventory.paletteLabel,
            category: inventory.category,
            mediaType: inventory.mediaType,
          };
        }).concat((availablePresets ?? []).filter(preset => preset.builtinKey !== null).map(preset => ({
          kind: "preset." + preset.key, label: promptPresetDisplayName(preset, tPresets), category: "Generate", mediaType: "image",
        }))),
    [availablePresets, tPresets],
  );

  const modelItems = useMemo<NodeBananaRuntimeModelItem[]>(
    () => [
      ...catalog.imageModels.map((model) => ({
        key: model.key,
        label: model.label,
        provider: model.provider,
        mediaType: "image" as const,
        capabilities: resolveRuntimeImageMaxInputImages(model) > 0 ? ["text-to-image", "image-to-image"] : ["text-to-image"],
      })),
      ...(catalog.videoModels ?? []).map((model) => ({
        key: model.key,
        label: model.label,
        provider: model.provider,
        mediaType: "video" as const,
        capabilities: resolveRuntimeVideoSupportsInitImage(model) ? ["text-to-video", "image-to-video"] : ["text-to-video"],
      })),
      ...(catalog.audioModels ?? []).map((model) => ({
        key: model.key,
        label: model.label,
        provider: model.provider,
        mediaType: "audio" as const,
        capabilities: ["text-to-audio"],
      })),
    ],
    [catalog.audioModels, catalog.imageModels, catalog.videoModels],
  );

  const currentImageNodes = useMemo(() => imageNodes(runtimeGraph), [runtimeGraph]);
  const currentImageEdges = useMemo(
    () => imageEdges(runtimeGraph, currentImageNodes),
    [currentImageNodes, runtimeGraph],
  );
  const inputReadinessByNodeId = useMemo(
    () =>
      new Map(
        currentImageNodes.map((node) => [
          node.id,
          resolveImageNodeInputReadiness(node.id, currentImageNodes, currentImageEdges),
        ]),
      ),
    [currentImageEdges, currentImageNodes],
  );
  const getNodeRunReadiness = useCallback(
    (nodeId: string) => hasMissingInput(nodeId) ? {ready: false, reasons: ["INPUT_NOT_READY"] as import("../model/node-run-readiness").NodeRunReadinessReason[]} : resolveNodeRunReadiness(
      runtimeGraphToCanonicalDocument(canonicalRef.current, runtimeGraphRef.current),
      nodeId,
      catalog,
    ),
    [catalog, hasMissingInput],
  );
  const getNodePromptInput = useCallback((nodeId: string) => {
    return resolveNodePromptInput(runtimeGraphRef.current, nodeId, catalog.assistantResults);
  }, [catalog.assistantResults]);
  const getNodeInputAssetId = useCallback((nodeId: string, targetPortId: string) => {
    return resolveNodeInputAssetId(runtimeGraphRef.current, nodeId, targetPortId);
  }, []);
  const getNodeInputAssetIds = useCallback((nodeId: string, targetPortId: string) => {
    return resolveNodeInputAssetIds(runtimeGraphRef.current, nodeId, targetPortId);
  }, []);
  const isNodePortConnected = useCallback((nodeId: string, targetPortId: string) =>
    runtimeGraphRef.current.edges.some((edge) =>
      edge.target === nodeId &&
      (edge.data?.targetPortId === targetPortId || edge.targetHandle === targetPortId),
    ), []);

  const replaceNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (!effectiveWritable) return;
      const currentGraph = runtimeGraphRef.current;
      const nextEdges = Object.hasOwn(patch, "config")
        ? reconcileEdgesForConfig(currentGraph, nodeId, patch.config)
        : currentGraph.edges;
      publishRuntimeGraph({
        nodes: currentGraph.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
        edges: nextEdges,
      });
    },
    [effectiveWritable, publishRuntimeGraph, reconcileEdgesForConfig],
  );

  const updateMemoNodeSize = useCallback((nodeId: string, size: { width: number; height: number }) => {
    if (!effectiveWritable) return;
    const current = runtimeGraphRef.current;
    const node = current.nodes.find((entry) => entry.id === nodeId && entry.data.canonicalKind === "note.memo");
    if (!node) return;
    const config = node.data.config && typeof node.data.config === "object" && !Array.isArray(node.data.config)
      ? node.data.config as Record<string, CanonicalJsonValue>
      : {};
    if (JSON.stringify(config.size) === JSON.stringify(size)) return;
    undoRecorderRef.current?.(current);
    replaceNodeData(nodeId, { config: { ...config, size } });
  }, [effectiveWritable, replaceNodeData]);

  const replaceNodeInputAssets = useCallback((nodeId: string, requestedSlot: GenerationAttachmentSlot, assetIds: readonly string[],
    expected: { modelKey: unknown; assetIds: readonly string[] }) => {
    if (!effectiveWritable) return false;
    const current = runtimeGraphRef.current, target = current.nodes.find(node => node.id === nodeId);
    const config = outputGalleryConfig(target?.data.config);
    if (!target || config.modelKey !== expected.modelKey) return false;
    const models = target.data.canonicalKind === "generate.image" ? catalog.imageModels
      : target.data.canonicalKind === "generate.video" ? catalog.videoModels ?? []
      : target.data.canonicalKind === "generate.audio" ? catalog.audioModels ?? [] : [];
    const model = models.find(model => model.key === config.modelKey);
    const slot = model && generationAttachmentSlots(model).find(slot => slot.field.name === requestedSlot.field.name);
    const removing = assetIds.length < expected.assetIds.length && assetIds.every(id => expected.assetIds.includes(id));
    if (!slot || slot.field.media !== requestedSlot.field.media || JSON.stringify(slot.ports) !== JSON.stringify(requestedSlot.ports) ||
        (assetIds.length > slot.limit && !removing) || JSON.stringify(slot.ports.flatMap(port => resolveNodeInputAssetIds(current, nodeId, port))) !== JSON.stringify(expected.assetIds)) return false;
    const next = replaceGenerationAttachments(current, nodeId, slot, assetIds, () => crypto.randomUUID());
    for (const edge of next.edges.filter(edge => !current.edges.some(previous => previous.id === edge.id))) {
      if (!isRuntimeConnectionValid(canonicalRef.current, { ...next, edges: next.edges.filter(candidate => candidate.id !== edge.id) }, edge, {
        imageInputLimit: key => resolveRuntimeImageMaxInputImages(catalog.imageModels.find(model => model.key === key)),
        videoSupportsInitImage: key => resolveRuntimeVideoSupportsInitImage((catalog.videoModels ?? []).find(model => model.key === key)),
      })) throw new Error("ATTACHMENT_CONNECTION");
    }
    undoRecorderRef.current?.(current);
    publishRuntimeGraph(next);
    return true;
  }, [catalog.imageModels, catalog.videoModels, catalog.audioModels, effectiveWritable, publishRuntimeGraph]);

  const authoringContext = useMemo(
    () => ({
      ...catalog,
      graphId: graph.id,
      prepareImageNodeExecution: prepareExecution,
      prepareNodeExecution: prepareExecution,
      runNode: onRegenerateNode ? runUpstreamNode : undefined,
      cancelNode: onCancelNode,
      writable: effectiveWritable,
      updateCanonicalNodeConfig: (nodeId: string, config: CanonicalJsonValue) =>
        replaceNodeData(nodeId, { config }),
      updateMemoNodeSize,
      getImageNodeInputReadiness: (nodeId: string) =>
        inputReadinessByNodeId.get(nodeId) ?? emptyImageNodeInputReadiness(),
      getNodeRunReadiness,
      getNodePromptInput,
      getNodeInputAssetId,
      getNodeInputAssetIds,
      replaceNodeInputAssets,
      isNodePortConnected,
      isNodePersisted: (nodeId: string) => persistedNodeIds?.has(nodeId) ?? graph.nodes.some((node) => node.id === nodeId),
      selectNodeOutputAsset: (nodeId: string, selectedOutputAssetId: string | null) =>
        replaceNodeData(nodeId, { selectedOutputAssetId }),
      updateImageNodeConfig: (nodeId: string, config: ImageGenerationFlowNode["data"]["config"]) => {
        const node = runtimeGraphRef.current.nodes.find((candidate) => candidate.id === nodeId);
        const currentConfig = node?.data.config && typeof node.data.config === "object" && !Array.isArray(node.data.config)
          ? node.data.config as Record<string, unknown>
          : {};
        replaceNodeData(nodeId, {
          config: currentConfig.presentation
            ? { ...config, presentation: currentConfig.presentation }
            : config,
        });
      },
      duplicateImageNode: (nodeId: string) => {
        if (!effectiveWritable) return;
        const currentGraph = runtimeGraphRef.current;
        const source = currentGraph.nodes.find((node) => node.id === nodeId);
        if (!source) return;
        const id = crypto.randomUUID();
        publishRuntimeGraph({
          ...currentGraph,
          nodes: [
            ...currentGraph.nodes,
            {
              ...source,
              id,
              position: { x: source.position.x + 48, y: source.position.y + 48 },
              data: {
                ...source.data,
                selectedOutputAssetId: null,
              },
            },
          ],
        });
      },
      deleteImageNode: (nodeId: string) => {
        if (!effectiveWritable) return;
        const currentGraph = runtimeGraphRef.current;
        publishRuntimeGraph({
          nodes: currentGraph.nodes.filter((node) => node.id !== nodeId),
          edges: currentGraph.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
          ),
        });
      },
    }),
    [
      catalog,
      onRegenerateNode, onCancelNode, runUpstreamNode,
      effectiveWritable,
      graph.id,
      graph.nodes,
      persistedNodeIds,
      getNodeRunReadiness,
      getNodeInputAssetId,
      getNodeInputAssetIds,
      replaceNodeInputAssets,
      getNodePromptInput,
      isNodePortConnected,
      inputReadinessByNodeId,
      prepareExecution,
      publishRuntimeGraph,
      replaceNodeData,
      updateMemoNodeSize,
    ],
  );

  const labels = useMemo(
    () => ({
      application: t("runtime.application"),
      addNode: t("actions.addNode"),
      selectTool: t("actions.selectTool"),
      panTool: t("actions.panTool"),
      undo: t("actions.undo"),
      redo: t("actions.redo"),
      copy: t("actions.copy"),
      paste: t("actions.paste"),
      fitView: t("actions.fitView"),
      searchPlaceholder: t("runtime.searchPlaceholder"),
      closeMenu: t("runtime.closeMenu"),
      emptyTitle: t("empty.title"),
      emptyDescription: t("empty.description"),
      readOnly: t("runtime.readOnly", { reason: effectiveReason ?? "UNSUPPORTED_GRAPH" }),
    }),
    [effectiveReason, t],
  );

  const queryClient = useQueryClient();
  const createId = useCallback(() => crypto.randomUUID(), []);
  const connectionCapabilities = useMemo(() => ({
    imageInputLimit: (modelKey: string | null) => {
      const model = catalog.imageModels.find((candidate) => candidate.key === modelKey);
      return model ? resolveRuntimeImageMaxInputImages(model) : Number.POSITIVE_INFINITY;
    },
    videoSupportsInitImage: (modelKey: string | null) => {
      const model = (catalog.videoModels ?? []).find((candidate) => candidate.key === modelKey);
      return model ? resolveRuntimeVideoSupportsInitImage(model) : true;
    },
  }), [catalog.imageModels, catalog.videoModels]);
  const validateConnection = useCallback<NonNullable<NodeBananaCanvasProps["isValidConnection"]>>(
    (connection) =>
      isRuntimeConnectionValid(canonicalRef.current, runtimeGraphRef.current, connection, {
        imageInputLimit: (modelKey) => {
          const model = catalog.imageModels.find((candidate) => candidate.key === modelKey);
          return model ? resolveRuntimeImageMaxInputImages(model) : 0;
        },
        videoSupportsInitImage: (modelKey) => {
          const model = (catalog.videoModels ?? []).find((candidate) => candidate.key === modelKey);
          return model ? resolveRuntimeVideoSupportsInitImage(model) : false;
        },
      }),
    [catalog.imageModels, catalog.videoModels],
  );
  const filterPaletteItems = useCallback<NonNullable<NodeBananaCanvasProps["filterPaletteItems"]>>(
    (items, pending) => {
      const current = runtimeGraphRef.current;
      return items.filter(item => filterPaletteForConnection(current, [{ ...item, kind: presetCanonicalKind(item.kind) }], pending).length > 0).filter((item) => {
        if (isUnavailableEditNodeKind(item.kind)) return false;
        if (!pending) return true;
        const kind = presetCanonicalKind(item.kind);
        const media = kind === "generate.image" ? "image" : kind === "generate.video" ? "video" : kind === "generate.audio" ? "audio" : null;
        const models = media === "image" ? catalog.imageModels : media === "video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
        const savedDefault = media ? savedNodeDefaults?.[media] : undefined;
        const validDefault = savedDefault && models.some((model) => model.key === savedDefault.modelKey && model.isActive && validSpaceDefaultParameters(model.parameters, savedDefault.parameters)) ? savedDefault : undefined;
        const node = createCanonicalRuntimeNode(kind as CanonicalNodeKind, "candidate-port-node", { x: 0, y: 0 }, item.initialModelKey ?? validDefault?.modelKey);
        const edge = connectCreatedRuntimeNode(current, node, pending, "candidate-port-edge");
        return edge !== null && isRuntimeConnectionValid(canonicalRef.current, { ...current, nodes: [...current.nodes, node] }, edge, connectionCapabilities);
      });
    },
    [connectionCapabilities, catalog.imageModels, catalog.videoModels, catalog.audioModels, savedNodeDefaults],
  );
  const importCanvasMedia = useCallback<NonNullable<NodeBananaCanvasProps["onImportCanvasMedia"]>>(async (source, signal) => {
    signal.throwIfAborted();
    const asset = source instanceof File
      ? await uploadMediaAsset(source, source.type.split("/")[0] as "image" | "audio" | "video", undefined, signal)
      : await getMediaAsset(source.assetId, signal);
    signal.throwIfAborted();
    if (source instanceof File) void queryClient.invalidateQueries({ queryKey: mediaAssetKeys.list(asset.type) });
    return { assetId: asset.id, mediaType: asset.type };
  }, [queryClient]);
  const createNode = useCallback<NodeBananaCanvasProps["onCreateNode"]>(
    (item, position, pending) => {
      if (isUnavailableEditNodeKind(item.kind)) throw new Error("NODE_TYPE_UNAVAILABLE");
      const currentGraph = runtimeGraphRef.current;
      const kind = presetCanonicalKind(item.kind);
      const preset = item.kind.startsWith("preset.") ? availablePresets?.find(preset => preset.key === item.kind.slice(7)) : undefined;
      if (item.kind.startsWith("preset.") && !preset) throw new Error("PRESET_UNAVAILABLE");
      const media = kind === "generate.image" ? "image" : kind === "generate.video" ? "video" : kind === "generate.audio" ? "audio" : null;
      const models = media === "image" ? catalog.imageModels : media === "video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
      const savedDefault = media ? savedNodeDefaults?.[media] : undefined;
      const validDefault = savedDefault && models.some((model) => model.key === savedDefault.modelKey && model.isActive && validSpaceDefaultParameters(model.parameters, savedDefault.parameters)) ? savedDefault : undefined;
      const initialModelKey = item.initialModelKey ?? validDefault?.modelKey;
      const createdNode = createCanonicalRuntimeNode(
        kind as CanonicalNodeKind,
        crypto.randomUUID(),
        position,
        initialModelKey,
      );
      const baseNode = kind.startsWith("generate.") && initialModelKey
        ? {
            ...createdNode,
            data: {
              ...createdNode.data,
              config: projectGenerationModelSelectionDefaults(
                {},
                { ...outputGalleryConfig(createdNode.data.config),
                  ...(!item.initialModelKey && validDefault ? { parameters: validDefault.parameters } : {}),
                },
                models,
              ) as CanonicalJsonValue,
            },
          }
        : createdNode;
      const node = preset ? { ...baseNode, data: { ...baseNode.data,
        config: { ...applyNodePromptPreset(outputGalleryConfig(baseNode.data.config), preset,
          catalog.imageModels.find(model => model.key === initialModelKey)).config,
          presentation: { ...outputGalleryConfig(outputGalleryConfig(baseNode.data.config).presentation), customTitle: preset.name },
        } as CanonicalJsonValue } } : baseNode;
      if (initialModelKey) trackModel?.(initialModelKey);
      const edge = connectCreatedRuntimeNode(
          currentGraph,
          node,
          pending,
          crypto.randomUUID(),
        );
      const validationGraph = pending?.replaceExisting && edge ? {
        ...currentGraph,
        edges: currentGraph.edges.filter(existing => existing.target !== edge.target || existing.targetHandle !== edge.targetHandle),
      } : currentGraph;
      if (pending && (!edge || !isRuntimeConnectionValid(canonicalRef.current, { ...validationGraph, nodes: [...currentGraph.nodes, node] }, edge, connectionCapabilities))) {
        throw new Error("CONNECTION_NOT_AVAILABLE");
      }
      return { node, edge };
    },
    [catalog.imageModels, catalog.videoModels, catalog.audioModels, savedNodeDefaults, trackModel, connectionCapabilities, availablePresets],
  );
  return (
    <NodeBananaCanvasErrorBoundary
      onError={(error) => {
        console.error("[node-studio] Node Banana Canvas render failed", error);
      }}
      fallback={
        <div className={styles.failure} role="alert">
          <strong>{t("runtime.failureTitle")}</strong>
          <p>{t("runtime.failureDescription")}</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-red-500 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
            onClick={() => window.location.reload()}
          >
            {t("runtime.reload")}
          </button>
        </div>
      }
    >
      <NodeAuthoringProvider value={authoringContext}>
        <NodeBananaHostedRuntimeContext.Provider value={hostedRuntime}>
          <div
            style={{ display: "contents" }}
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape" || event.nativeEvent.isComposing || event.keyCode === 229
                || !focusedPromptConstructorEditor(event.currentTarget)) return;
              event.preventDefault();
              focusHostedCanvas(event.currentTarget, true);
            }}
            onPointerDownCapture={(event) => {
              if (!focusedPromptConstructorEditor(event.currentTarget)
                || !(event.target instanceof Element)
                || event.target.closest("input, textarea, select, button, [contenteditable], [role='textbox'], [role='dialog'], [role='alertdialog']")) return;
              focusHostedCanvas(event.currentTarget);
            }}
            onClickCapture={(event) => {
              if (!(event.target instanceof Element)
                || !event.target.closest('[data-node-banana-component="WorkflowCanvas"][role="application"]')
                || event.target.closest("input, textarea, select, button, [contenteditable], [role='textbox'], [role='dialog'], [role='alertdialog']")) return;
              focusHostedCanvas(event.currentTarget);
            }}
          >
          <NodeBananaCanvasRuntime
            contextId={graph.id}
            host={canvasHost}
            navigationTarget={comments?.navigationTarget}
            graph={displayGraph}
            nodeTypes={hostedNodeTypes}
            paletteItems={paletteItems}
            modelItems={modelItems}
            labels={labels}
            writable={effectiveWritable}
            canvasSettings={canvasSettings}
            className={styles.runtime}
            createId={createId}
            onGraphChange={publishRuntimeGraph}
            isValidConnection={validateConnection}
            filterPaletteItems={filterPaletteItems}
            onCreateNode={createNode}
            onImportCanvasMedia={importCanvasMedia}
            renderAssetPicker={(mediaType, onSelect, onClose) => <NodeBananaInputHistoryControl nodeId="pending-connection" mediaType={mediaType} selectedAssetId={null} writable={effectiveWritable} open onOpenChange={(open) => { if (!open) onClose(); }} onSelect={onSelect} />}
            onInputError={onHostError}
            isNodeRunnable={(nodeId) => {
              const node = runtimeGraph.nodes.find((candidate) => candidate.id === nodeId);
              const status = node ? resolveHostedNodeData(nodeId, node.data).executionStatus ?? node.data.executionStatus : undefined;
              return effectiveWritable && !!node && !isUnavailableEditNodeKind(String(node.data.canonicalKind ?? "")) && !submittingNodeIds.has(nodeId) && !isActiveExecutionStatus(status) && getNodeRunReadiness(nodeId).ready;
            }}
            onRunNode={runUpstreamNode}
            onDownloadSelectedImages={downloadSelectedImages}
            onCreateGroup={createGroup}
            onUngroup={ungroupNodes}
            downloadingImages={downloadingImages}
            canvasOverlay={<NodeBananaUpstreamHostProvider value={groupHost}>
              <GroupBackgroundsPortal /><GroupControlsOverlay />
              <SpaceGenerationControlPanel host={{
                ...canvasHost,
                writable: effectiveWritable,
                onUpdateNodeData: updateUpstreamNodeData,
                resolveNodeData: (nodeId) => {
                  const latest = (runtimeGraphRef.current.nodes.find((node) => node.id === nodeId)?.data ?? {}) as Record<string, unknown>;
                  return { ...latest, ...(resolveHostedNodeData(nodeId, latest) ?? {}) };
                },
              }} />
            </NodeBananaUpstreamHostProvider>}
            onUndoRecorderChange={registerUndoRecorder}
            remapPastedNodes={remapSplitClipboardNodes}
          />
          </div>
        </NodeBananaHostedRuntimeContext.Provider>
      </NodeAuthoringProvider>
    </NodeBananaCanvasErrorBoundary>
  );
}
