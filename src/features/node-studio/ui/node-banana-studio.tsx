"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import type { NodeProps, NodeTypes } from "@xyflow/react";
import { useTranslations } from "next-intl";

import {
  NodeBananaCanvasErrorBoundary,
  NodeBananaCanvasRuntime,
  NodeBananaUpstreamHeader,
  NodeBananaUpstreamNode,
  NodeBananaUpstreamControlPanel,
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
import { UnsupportedCanonicalNode } from "./nodes/canonical-node";
import { NodeBananaInputHistoryControl } from "./nodes/node-banana-input-history-control";

import styles from "./node-banana-studio.module.css";
import { downloadImageZip, selectedImageAssetIds } from "../lib/image-zip-download";
import { getMediaAsset, uploadMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { useSpacePreferences } from "../hook/use-space-preferences";
import { useSpaceComments } from "../hook/use-space-comments";
import { validSpaceDefaultParameters } from "@/shared/generation-graph/space-preferences";
import { nodeBananaCatalogModels } from "../runtime/node-banana/node-banana-model-catalog";

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
  onDraftChange: (draft: GraphDraft) => void;
  prepareImageNodeExecution: () => Promise<number>;
  catalog: NodeAuthoringCatalogState;
  writable: boolean;
  readOnlyReason: string | null;
  canvasSettings?: NodeBananaCanvasSettings;
  /** Host callback invoked by an upstream header's Run control. */
  onRegenerateNode?: (nodeId: string) => void | Promise<void | { selectedOutputAssetId?: string | null; outputAssetIds?: string[]; outputGrid?: { rows: number; cols: number } }>;
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
  const comments = useSpaceComments();
  const t = useTranslations("nodeStudio");
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
    runtimeGraphRef.current = runtimeGraph;
    onDraftChangeRef.current = onDraftChange;
    prepareImageNodeExecutionRef.current = prepareImageNodeExecution;
    publishedSignatureRef.current = graphDraftSignature(
      canonicalDocumentToV3Draft(canonicalRef.current),
    );
  }, [graph.title, graph.version, onDraftChange, prepareImageNodeExecution, runtimeGraph]);

  const publishRuntimeGraph = useCallback((nextRuntime: NodeBananaRuntimeGraph) => {
    const canonical = runtimeGraphToCanonicalDocument(canonicalRef.current, nextRuntime);
    const draft = canonicalDocumentToV3Draft(canonical);
    const signature = graphDraftSignature(draft);
    if (signature === publishedSignatureRef.current) return;

    const nextGraph = canonicalDocumentToRuntimeGraph(canonical);
    canonicalRef.current = canonical;
    runtimeGraphRef.current = nextGraph;
    publishedSignatureRef.current = signature;
    setRuntimeGraph(nextGraph);
    onDraftChangeRef.current(draft);
  }, []);

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
    const optimisticAnnotation = typeof transient.optimisticAnnotationOutput === "string"
      && transient.optimisticAnnotationOutput.startsWith("data:image/")
      && !(typeof resolved.outputImage === "string" && resolved.outputImage.length > 0)
        ? { outputImage: transient.optimisticAnnotationOutput }
        : {};
    return {
      ...transient,
      ...resolved,
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
  }, [resolveUpstreamNodeData, upstreamTransientData]);

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
  }, [catalog.audioModels, catalog.imageModels, catalog.videoModels, resolveHostedNodeData, runtimeGraph]);

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

  const hasMissingInput = useCallback((nodeId: string) => {
    const graph = runtimeGraphRef.current;
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      const node = graph.nodes.find(node => node.id === id);
      if (node && resolveHostedNodeData(id, node.data as Record<string, unknown>)?.missingMedia) return true;
      return graph.edges.filter(edge => edge.target === id).some(edge => visit(edge.source));
    };
    return graph.edges.filter(edge => edge.target === nodeId).some(edge => visit(edge.source));
  }, [resolveHostedNodeData]);

  const runUpstreamNode = useCallback(async (nodeId: string) => {
    if (!effectiveWritable || hasMissingInput(nodeId)) return undefined;
    const node = runtimeGraphRef.current.nodes.find((candidate) => candidate.id === nodeId);
    const kind = typeof node?.data.canonicalKind === "string" ? node.data.canonicalKind : "";
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
    try {
      const result = await onRegenerateNode(nodeId);
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
    } finally {
      runningNodeIdsRef.current.delete(nodeId);
    }
  }, [effectiveWritable, hasMissingInput, onHostError, onRegenerateNode, publishRuntimeGraph, resolveHostedNodeData, updateUpstreamNodeData]);

  const applyHostedSplitTemplate = useCallback((nodeId: string, options: { template: HostedSplitTemplate; replaceConfirmed?: boolean }) => {
    if (!effectiveWritable) throw new Error("This Space is read-only.");
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
  ) => (
    <NodeBananaInputHistoryControl
      key={`${graph.id}:${nodeId}`}
      nodeId={nodeId}
      mediaType={mediaType}
      selectedAssetId={selectedAssetId}
      writable={effectiveWritable}
      onSelect={(assetId) => {
        const current = runtimeGraphRef.current.nodes.find((node) => node.id === nodeId);
        const currentConfig = current?.data?.config && typeof current.data.config === "object" && !Array.isArray(current.data.config)
          ? current.data.config as Record<string, unknown>
          : {};
        updateUpstreamNodeData(nodeId, { config: { ...currentConfig, assetId } });
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
    renderInputHistory,
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

  const HostedUpstreamNode = useMemo(() => {
    function HostedUpstreamNodeComponent(props: NodeProps) {
      const tMedia = useTranslations("nodeStudio.mediaNodes");
      const [uploading, setUploading] = useState(false);
      const uploadVersion = useRef(0);
      const contextRuntime = useContext(NodeBananaHostedRuntimeContext) as typeof hostedRuntimeRef.current | null;
      const current = contextRuntime ?? hostedRuntimeRef.current;
      const runtimeNode = runtimeGraphRef.current.nodes.find((node) => node.id === props.id);
      const resolved = current.resolveUpstreamNodeData?.(
        props.id,
        (runtimeNode?.data ?? {}) as Record<string, unknown>,
      );
      const isRunning = isActiveExecutionStatus(resolved?.executionStatus ?? runtimeNode?.data.executionStatus);
      const resolveNodeData = useCallback((nodeId: string) => {
        const latest = (runtimeGraphRef.current.nodes.find((node) => node.id === nodeId)?.data ?? {}) as Record<string, unknown>;
        return {
          ...latest,
          ...(current.resolveUpstreamNodeData?.(nodeId, latest) ?? {}),
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
        getNodeRunReadiness,
      }), [current, uploadInput, getNodeRunReadiness, isRunning, resolveNodeData]);
      return (
        <>
        <NodeBananaUpstreamNode
          {...props}
          host={nodeHost}
          onUpdateNodeData={current.updateUpstreamNodeData}
          onRegenerateNode={current.runUpstreamNode}
          onOpenAnnotation={current.onOpenAnnotation}
          onCloseAnnotation={current.onCloseAnnotation}
        />
        {resolved?.missingMedia ? <div role="status" className="nodrag nopan absolute inset-x-2 top-8 z-40 rounded-lg bg-background/95 px-3 py-2 text-xs text-muted-foreground pointer-events-none">{tMedia("missingFile")}</div> : null}
        {(uploading || props.data.mediaUploading) ? <div role="status" aria-live="polite" aria-label={tMedia("uploading")} className="nodrag nopan absolute inset-0 z-50 flex items-center justify-center gap-2 rounded-2xl bg-black/55 text-sm text-white backdrop-blur-sm"><Loader2 className="h-5 w-5 animate-spin" />{tMedia("uploading")}</div> : null}
        </>
      );
    }
    return HostedUpstreamNodeComponent;
  }, []);

  const HostedUpstreamHeaderComponent = useMemo(() => {
    function HostedUpstreamHeaderPresenter({
      node,
    }: {
      node: NodeBananaCanvasProps["graph"]["nodes"][number];
    }) {
      const contextRuntime = useContext(NodeBananaHostedRuntimeContext) as typeof hostedRuntimeRef.current | null;
      const current = contextRuntime ?? hostedRuntimeRef.current;
      const data = node.data as Record<string, unknown>;
      const resolvedData = current.resolveUpstreamNodeData(node.id, data);
      const effectiveData = { ...data, ...resolvedData };
      const resolveNodeData = useCallback((nodeId: string) => {
        const latest = (runtimeGraphRef.current.nodes.find((candidate) => candidate.id === nodeId)?.data ?? {}) as Record<string, unknown>;
        return {
          ...latest,
          ...current.resolveUpstreamNodeData(nodeId, latest),
        };
      }, [current]);
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
          position={node.position}
          width={node.measured?.width ?? node.width ?? (node.style?.width as number) ?? 300}
          selected={node.selected}
          isExecuting={effectiveData.executionStatus === "processing" || effectiveData.executionStatus === "pending" || effectiveData.executionStatus === "uploading"}
          host={headerHost}
          onCancelNode={current.onCancelNode}
          onUpdateNodeData={current.updateUpstreamNodeData}
          onRegenerateNode={current.runUpstreamNode}
          onOpenAnnotation={current.onOpenAnnotation}
          onExpandNode={current.onExpandNode}
          onCloseAnnotation={current.onCloseAnnotation}
        />
      );
    }
    return HostedUpstreamHeaderPresenter;
  }, []);

  const HostedUpstreamHeader = useCallback(
    (node: NodeBananaCanvasProps["graph"]["nodes"][number]) => (
      <HostedUpstreamHeaderComponent node={node} />
    ),
    [HostedUpstreamHeaderComponent],
  );

  const hostedNodeTypes = useMemo<NodeTypes>(
    () => ({
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
        .filter((kind) => kind !== "edit.image.removeBackground" || catalog.backgroundRemovalAvailable)
        .map((kind) => {
          const inventory = nodeBananaNodeInventory[kind];
          return {
            kind,
            label: inventory.paletteLabel,
            category: inventory.category,
            mediaType: inventory.mediaType,
          };
        }),
    [catalog.backgroundRemovalAvailable],
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
    return resolveNodePromptInput(runtimeGraphRef.current, nodeId);
  }, []);
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

  const authoringContext = useMemo(
    () => ({
      ...catalog,
      graphId: graph.id,
      prepareImageNodeExecution: prepareExecution,
      prepareNodeExecution: prepareExecution,
      writable: effectiveWritable,
      updateCanonicalNodeConfig: (nodeId: string, config: CanonicalJsonValue) =>
        replaceNodeData(nodeId, { config }),
      getImageNodeInputReadiness: (nodeId: string) =>
        inputReadinessByNodeId.get(nodeId) ?? emptyImageNodeInputReadiness(),
      getNodeRunReadiness,
      getNodePromptInput,
      getNodeInputAssetId,
      getNodeInputAssetIds,
      isNodePortConnected,
      isNodePersisted: (nodeId: string) => graph.nodes.some((node) => node.id === nodeId),
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
      effectiveWritable,
      graph.id,
      graph.nodes,
      getNodeRunReadiness,
      getNodeInputAssetId,
      getNodeInputAssetIds,
      getNodePromptInput,
      isNodePortConnected,
      inputReadinessByNodeId,
      prepareExecution,
      publishRuntimeGraph,
      replaceNodeData,
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
      return filterPaletteForConnection(current, items, pending).filter((item) => {
        if (!pending) return true;
        const media = item.kind === "generate.image" ? "image" : item.kind === "generate.video" ? "video" : item.kind === "generate.audio" ? "audio" : null;
        const models = media === "image" ? catalog.imageModels : media === "video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
        const savedDefault = media ? savedNodeDefaults?.[media] : undefined;
        const validDefault = savedDefault && models.some((model) => model.key === savedDefault.modelKey && model.isActive && validSpaceDefaultParameters(model.parameters, savedDefault.parameters)) ? savedDefault : undefined;
        const node = createCanonicalRuntimeNode(item.kind as CanonicalNodeKind, "candidate-port-node", { x: 0, y: 0 }, item.initialModelKey ?? validDefault?.modelKey);
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
      const currentGraph = runtimeGraphRef.current;
      const media = item.kind === "generate.image" ? "image" : item.kind === "generate.video" ? "video" : item.kind === "generate.audio" ? "audio" : null;
      const models = media === "image" ? catalog.imageModels : media === "video" ? catalog.videoModels ?? [] : catalog.audioModels ?? [];
      const savedDefault = media ? savedNodeDefaults?.[media] : undefined;
      const validDefault = savedDefault && models.some((model) => model.key === savedDefault.modelKey && model.isActive && validSpaceDefaultParameters(model.parameters, savedDefault.parameters)) ? savedDefault : undefined;
      const initialModelKey = item.initialModelKey ?? validDefault?.modelKey;
      const createdNode = createCanonicalRuntimeNode(
        item.kind as CanonicalNodeKind,
        crypto.randomUUID(),
        position,
        initialModelKey,
      );
      const node = item.kind.startsWith("generate.") && initialModelKey
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
      if (initialModelKey) trackModel?.(initialModelKey);
      const edge = connectCreatedRuntimeNode(
          currentGraph,
          node,
          pending,
          crypto.randomUUID(),
        );
      if (pending && (!edge || !isRuntimeConnectionValid(canonicalRef.current, { ...currentGraph, nodes: [...currentGraph.nodes, node] }, edge, connectionCapabilities))) {
        throw new Error("CONNECTION_NOT_AVAILABLE");
      }
      return { node, edge };
    },
    [catalog.imageModels, catalog.videoModels, catalog.audioModels, savedNodeDefaults, trackModel, connectionCapabilities],
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
            isNodeRunnable={(nodeId) => effectiveWritable && getNodeRunReadiness(nodeId).ready}
            onRunNode={runUpstreamNode}
            onDownloadSelectedImages={downloadSelectedImages}
            onCreateGroup={createGroup}
            onUngroup={ungroupNodes}
            downloadingImages={downloadingImages}
            renderNodeHeader={HostedUpstreamHeader}
            canvasOverlay={<NodeBananaUpstreamHostProvider value={groupHost}>
              <GroupBackgroundsPortal /><GroupControlsOverlay />
              <NodeBananaUpstreamControlPanel host={{
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
        </NodeBananaHostedRuntimeContext.Provider>
      </NodeAuthoringProvider>
    </NodeBananaCanvasErrorBoundary>
  );
}
