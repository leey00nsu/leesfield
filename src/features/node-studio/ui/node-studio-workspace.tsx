"use client";
import { imageUrlsFor } from "@/shared/media-assets/image-variants";

import { useTranslations } from "next-intl";

import { resolveGraphText } from "@/shared/generation-graph/prompt-constructor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { NodeBananaHostedHeader, CommentsNavigationIcon, clearThumbnailCache, ModelSearchDialog, NodeBananaUpstreamHostProvider, type NodeBananaCanvasSettings } from "@node-banana-runtime/runtime-entry";
import { HostedQuickstart, HostedTutorial, type HostedPresetWorkflow } from "@node-banana-runtime/runtime-entry";
import { nodeBananaLegacyTypeByCanonicalKind } from "../runtime/node-banana/node-banana-host-adapter";
import { ChevronLeft } from "lucide-react";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { SpacePreferencesContext, useSpacePreferencesSession } from "../hook/use-space-preferences";
import { SpaceCommentsContext, useSpaceCommentsSession } from "../hook/use-space-comments";
import { nodeBananaCatalogModels } from "../runtime/node-banana/node-banana-model-catalog";

import { cancelNodeExecution, listNodeExecutions } from "../api/node-execution-api";
import { nodeExecutionKeys, useStartNodeExecution } from "../hook/use-node-executions";
import {
  runBrowserImageOperation,
  runPreparedAnnotationOperation,
} from "../lib/browser-image-operation-runner";
import { runBrowserVideoOperation } from "../lib/browser-video-operation-runner";
import { getMediaAsset } from "@/features/media-assets/api/media-asset-api";
import type { NodeExecutionDto } from "../model/node-execution-types";
import { mediaAssetKeys, useMediaAssetList, useUploadMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetContentUrl } from "@/shared/media-assets/media-asset-content";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  resolveRuntimeImageMaxInputImages,
  resolveRuntimeVideoSupportsInitImage,
} from "@/shared/model-catalog/runtime-utils";

import { useGraphAutosave, type GraphDraft, type GraphAutosaveStatus } from "../hook/use-graph-autosave";
import { GenerationEventChannelProvider } from "../hook/use-generation-event-channel";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { canonicalDocumentToV3Draft, graphSnapshotToCanonicalDocument } from "../runtime/node-banana/node-banana-runtime-adapter";
import { NodeBananaConfirmDialog } from "./node-banana-confirm-dialog";
import { NodeStudio } from "./node-studio";

type NodeStudioWorkspaceProps = {
  graph: GenerationGraphSnapshotDto;
  graphs?: readonly { id: string; title: string }[];
  activeGraphId?: string;
  onSaved: (graph: GenerationGraphSnapshotDto) => void;
  onBack?: () => void;
  onDelete: () => void;
  onReloadLatest: () => void;
  onStatusChange?: (status: GraphAutosaveStatus) => void;
  onSelectGraph?: (graphId: string) => void;
  onCreateGraph?: (title: string) => void;
  onCreatePreset?: (workflow: HostedPresetWorkflow | null, tutorial?: boolean) => Promise<void>;
  tutorialActive?: boolean;
  onTutorialClose?: () => void;
  creating?: boolean;
  deleting?: boolean;
};

type ResolvedMediaAsset = {
  assetId: string;
  url: string;
  asset: MediaAssetDto | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function outputGalleryExcludedAssetIds(config: unknown) {
  const excludedAssetIds = record(config).excludedAssetIds;
  return Array.isArray(excludedAssetIds)
    ? excludedAssetIds.filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0)
    : [];
}

function activeExecution(execution: NodeExecutionDto) {
  return execution.status === "pending" || execution.status === "processing" || execution.status === "uploading";
}

const SERVER_OPERATION_POLL_INTERVAL_MS = 500;
const SERVER_OPERATION_TIMEOUT_MS = 120_000;

async function waitForServerOperation(
  graphId: string,
  nodeId: string,
  executionId: string,
  signal: AbortSignal,
) {
  const deadline = Date.now() + SERVER_OPERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const executions = await listNodeExecutions(graphId, nodeId, signal);
    const execution = executions.find((candidate) => candidate.executionId === executionId);
    if (!execution) throw new Error("NODE_EXECUTION_NOT_FOUND");
    if (!activeExecution(execution)) return execution;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Server operation cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, SERVER_OPERATION_POLL_INTERVAL_MS);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
  throw new Error("NODE_EXECUTION_TIMEOUT");
}

async function dataUrlToFile(
  dataUrl: string,
  fileName: string,
  mimeType: string | null,
) {
  if (!dataUrl.startsWith("data:")) throw new Error("UPSTREAM_MEDIA_DATA_URL_REQUIRED");
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("UPSTREAM_MEDIA_DATA_URL_READ_FAILED");
  const blob = await response.blob();
  const type = mimeType || blob.type;
  if (!type) throw new Error("UPSTREAM_MEDIA_MIME_TYPE_MISSING");
  return new File([blob], fileName, { type });
}

const defaultCanvasSettings: NodeBananaCanvasSettings = {
  panMode: "space",
  zoomMode: "altScroll",
  selectionMode: "click",
};

function loadCanvasSettings(): NodeBananaCanvasSettings {
  if (typeof window === "undefined") return defaultCanvasSettings;
  try {
    const saved = window.localStorage.getItem("node-studio.canvas-settings");
    if (!saved) return defaultCanvasSettings;
    const value = JSON.parse(saved) as Partial<NodeBananaCanvasSettings>;
    return {
      panMode: value.panMode === "middleMouse" || value.panMode === "always" ? value.panMode : "space",
      zoomMode: value.zoomMode === "scroll" || value.zoomMode === "ctrlScroll" ? value.zoomMode : "altScroll",
      selectionMode: value.selectionMode === "altDrag" || value.selectionMode === "shiftDrag" ? value.selectionMode : "click",
    };
  } catch {
    window.localStorage.removeItem("node-studio.canvas-settings");
    return defaultCanvasSettings;
  }
}

export function NodeStudioWorkspace({
  graph,
  graphs,
  activeGraphId,
  onSaved,
  onBack,
  onDelete,
  onReloadLatest,
  onStatusChange,
  onSelectGraph,
  onCreateGraph,
  onCreatePreset,
  tutorialActive,
  onTutorialClose,
  creating,
  deleting,
}: NodeStudioWorkspaceProps) {
  const preferences = useSpacePreferencesSession(graph.id);
  const writableRef = useRef(graph.writable !== false);
  writableRef.current = graph.writable !== false;
  useEffect(() => () => clearThumbnailCache(), [graph.id]);
  const initialDraft = useMemo<GraphDraft>(
    () => canonicalDocumentToV3Draft(graphSnapshotToCanonicalDocument(graph)),
    [graph],
  );
  const [title, setTitle] = useState(graph.title);
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const draftRef = useRef(initialDraft);
  const [draftRevision, setDraftRevision] = useState(0);
  const titleRef = useRef(graph.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeaveAction = useRef<(() => void) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [annotationNodeId, setAnnotationNodeId] = useState<string | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const operationControllers = useMemo(() => {
    // A graph switch must dispose the previous graph's browser-owned work.
    void graph.id;
    return new Map<string, AbortController>();
  }, [graph.id]);
  useEffect(() => {
    const abortOwnedOperations = () => {
      operationControllers.forEach((controller) => controller.abort());
      operationControllers.clear();
    };
    window.addEventListener("pagehide", abortOwnedOperations);
    return () => {
      window.removeEventListener("pagehide", abortOwnedOperations);
      abortOwnedOperations();
    };
  }, [operationControllers]);
  const [assetOverrides, setAssetOverrides] = useState<Record<string, MediaAssetDto>>({});
  const [canvasSettings, setCanvasSettings] = useState<NodeBananaCanvasSettings>(loadCanvasSettings);
  const runtimeCatalog = useRuntimeModelCatalog();
  const e2eBackgroundRemovalAvailable = process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL === "1";
  const {
    audioModels,
    error: catalogError,
    imageModels,
    isLoading: catalogLoading,
    refetch: refetchCatalog,
    videoModels,
  } = runtimeCatalog;
  const nodeCatalog = useMemo(
    () => ({
      imageModels: imageModels.filter((model) => model.isActive),
      videoModels: (videoModels ?? []).filter((model) => model.isActive),
      audioModels: (audioModels ?? []).filter((model) => model.isActive),
      isLoading: catalogLoading,
      error: catalogError,
      retry: () => {
        void refetchCatalog();
      },
      refresh: async () => {
        const result = await refetchCatalog();
        if (result.error) throw result.error;
      },
      backgroundRemovalAvailable: e2eBackgroundRemovalAvailable || imageModels.some((model) =>
        Boolean(
          model.isActive &&
          model.provider === "hf_space" &&
          model.meta.operations?.background_removal,
        ),
      ),
    }),
    [
      audioModels,
      catalogError,
      catalogLoading,
      e2eBackgroundRemovalAvailable,
      imageModels,
      refetchCatalog,
      videoModels,
    ],
  );
  const autosave = useGraphAutosave({
    graphId: graph.id,
    initialVersion: graph.version,
    initialDraft,
    onSaved,
  });
  const autosaveUpdateRef = useRef(autosave.update);
  const autosaveSaveNowRef = useRef(autosave.saveNow);
  const queryClient = useQueryClient();
  const uploadMedia = useUploadMediaAsset();
  const startExecution = useStartNodeExecution();

  const draftNodeIds = useMemo(
    () => graph.nodes
      .filter((node) => findNodeDefinition(node.kind)?.executionMode !== "none")
      .map((node) => node.id),
    [graph.nodes],
  );
  const inputAssetIds = useMemo(
    () => {
      // `draftRef` is the single-writer snapshot; the revision and graph id
      // deliberately invalidate this derived list without copying the draft
      // into a second React state owner.
      void draftRevision;
      void graph.id;
      return Array.from(new Set(
        draftRef.current.nodes
        .filter((node) => node.kind === "input.image" || node.kind === "input.audio" || node.kind === "input.video")
        .map((node) => record(node.config).assetId)
        .filter((assetId): assetId is string => typeof assetId === "string" && Boolean(assetId)),
      ));
    },
    [draftRevision, graph.id],
  );
  const executionQueries = useQueries({
    queries: draftNodeIds.map((nodeId) => ({
      queryKey: nodeExecutionKeys.list(graph.id, nodeId),
      queryFn: ({ signal }: { signal: AbortSignal }) => listNodeExecutions(graph.id, nodeId, signal),
      refetchInterval: (query: { state: { data?: NodeExecutionDto[] } }) =>
        query.state.data?.some(activeExecution) ? 2_000 : false,
      staleTime: 0,
    })),
  });
  const executionByNodeId = useMemo(
    () => new Map<string, NodeExecutionDto[]>(
      draftNodeIds.map((nodeId, index) => [nodeId, executionQueries[index]?.data ?? []]),
    ),
    [draftNodeIds, executionQueries],
  );
  const executionOutputAssetIds = useMemo(
    () => Array.from(new Set(
      Array.from(executionByNodeId.values()).flatMap((executions) =>
        executions.flatMap((execution) => execution.outputAssetIds),
      ),
    )),
    [executionByNodeId],
  );
  const handleCancelNode = useCallback(async (nodeId: string) => {
    if (graph.writable === false) return;
    try {
      // Explicit user recovery also works after a reload. Never infer that a
      // discovered active record is abandoned; another tab may still own it.
      const executions = await listNodeExecutions(graph.id, nodeId);
      const active = executions.find((item) => item.executionKind === "media_operation" && activeExecution(item));
      if (active) await cancelNodeExecution(graph.id, nodeId, active.executionId);
      operationControllers.get(nodeId)?.abort();
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
    } catch (error) {
      setHostError(error instanceof Error ? error.message : "Could not cancel operation.");
    }
  }, [graph.id, graph.writable, operationControllers, queryClient]);
  const selectedOutputAssetIds = useMemo(
    () => {
      void draftRevision;
      void graph.id;
      return draftRef.current.nodes
        .map((node) => node.selectedOutputAssetId)
        .filter((assetId): assetId is string => typeof assetId === "string" && Boolean(assetId));
    },
    [draftRevision, graph.id],
  );
  const allAssetIds = useMemo(
    () => Array.from(new Set([...inputAssetIds, ...executionOutputAssetIds, ...selectedOutputAssetIds])),
    [executionOutputAssetIds, inputAssetIds, selectedOutputAssetIds],
  );
  const assetQueries = useMediaAssetList(allAssetIds);
  const missingAssetIds = useMemo(() => new Set(allAssetIds.filter((_, index) => { const error = assetQueries[index]?.error; return error && typeof error === "object" && "status" in error && error.status === 404; })), [allAssetIds, assetQueries]);
  const resolvedAssets = useMemo(
    () => new Map<string, MediaAssetDto>([
      ...assetQueries.flatMap((query, index) => query.data && !missingAssetIds.has(allAssetIds[index]) ? [[allAssetIds[index], query.data] as const] : []),
      ...Object.entries(assetOverrides).filter(([id]) => !missingAssetIds.has(id)),
    ]),
    [allAssetIds, assetOverrides, assetQueries, missingAssetIds],
  );

  useEffect(() => {
    autosaveUpdateRef.current = autosave.update;
    autosaveSaveNowRef.current = autosave.saveNow;
  }, [autosave.saveNow, autosave.update]);

  useEffect(() => {
    onStatusChange?.(autosave.status);
  }, [autosave.status, onStatusChange]);

  const updateCanvasSettings = (next: NodeBananaCanvasSettings) => {
    setCanvasSettings(next);
    window.localStorage.setItem("node-studio.canvas-settings", JSON.stringify(next));
  };

  const updateDraft = useCallback((next: GraphDraft) => {
    if (JSON.stringify(next) === JSON.stringify(draftRef.current)) return;
    draftRef.current = next;
    setDraftRevision((revision) => revision + 1);
    autosaveUpdateRef.current(next);
  }, []);

  const updateDraftNode = useCallback((nodeId: string, update: (node: GraphDraft["nodes"][number]) => GraphDraft["nodes"][number]) => {
    const current = draftRef.current;
    const node = current.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error("UPSTREAM_NODE_NOT_FOUND");
    updateDraft({
      ...current,
      nodes: current.nodes.map((candidate) => candidate.id === nodeId ? update(candidate) : candidate),
    });
  }, [updateDraft]);

  const handleCanvasDraft = useCallback((next: GraphDraft) => {
    updateDraft({ ...next, title: titleRef.current });
  }, [updateDraft]);
  const prepareExecution = useCallback(async () => {
    const saved = await autosaveSaveNowRef.current();
    return saved.version;
  }, []);

  const latestOutputAssetsForNode = useCallback((nodeId: string) => {
    const node = draftRef.current.nodes.find((candidate) => candidate.id === nodeId);
    // The canonical selection is the only output projected as the node's
    // current value. Execution history remains available through
    // outputHistoryAssetsForNode for history/carousel UI, but must not leak
    // back into downstream inputs after the user clears the selection.
    const selectedId = node?.selectedOutputAssetId;
    if (!selectedId) return [];
    return [selectedId].flatMap((assetId) => {
      const asset = resolvedAssets.get(assetId);
      return asset ? [asset] : [];
    });
  }, [resolvedAssets]);

  const outputHistoryAssetsForNode = useCallback((nodeId: string) => {
    const node = draftRef.current.nodes.find((candidate) => candidate.id === nodeId);
    const executions = executionByNodeId.get(nodeId) ?? [];
    const historyIds = executions
      .filter((execution) => execution.status === "completed")
      .flatMap((execution) => execution.outputAssetIds);
    const selectedId = node?.selectedOutputAssetId;
    const ids = selectedId && !historyIds.includes(selectedId)
      ? [selectedId, ...historyIds]
      : historyIds;
    return Array.from(new Set(ids)).flatMap((assetId) => {
      const asset = resolvedAssets.get(assetId);
      return asset ? [asset] : [];
    });
  }, [executionByNodeId, resolvedAssets]);

  const currentOutputAssetsForPort = useCallback((nodeId: string, portId: string) => {
    const node = draftRef.current.nodes.find((candidate) => candidate.id === nodeId);
    const outputPort = node
      ? findNodeDefinition(node.kind)?.ports.find((port) => port.direction === "output" && port.id === portId)
      : null;
    if (node?.selectedOutputAssetId && outputPort?.valueShape === "ordered-list") {
      const selectedExecution = (executionByNodeId.get(nodeId) ?? []).find((execution) =>
        execution.status === "completed" &&
        execution.outputAssetIds.includes(node.selectedOutputAssetId as string),
      );
      const collection = selectedExecution?.outputAssetIds.flatMap((assetId) => {
        const asset = resolvedAssets.get(assetId);
        return asset ? [asset] : [];
      }) ?? [];
      if (collection.length > 0) return collection;
    }
    return latestOutputAssetsForNode(nodeId);
  }, [executionByNodeId, latestOutputAssetsForNode, resolvedAssets]);

  const resolveUpstreamMediaValues = useCallback((nodeId: string, portId: string): string[] => {
    const resolve = (currentNodeId: string, currentPortId: string, visited: Set<string>): string[] => {
      const visitKey = `${currentNodeId}:${currentPortId}`;
      if (visited.has(visitKey)) return [];
      const nextVisited = new Set(visited).add(visitKey);
      const node = draftRef.current.nodes.find((candidate) => candidate.id === currentNodeId);
      if (!node) return [];
      const config = record(node.config);
      const incomingEdges = (targetPortId = currentPortId) => draftRef.current.edges
        .filter((edge) => edge.targetNodeId === currentNodeId && edge.targetPortId === targetPortId)
        .sort((left, right) => left.sortOrder - right.sortOrder);
      const incoming = (targetPortId = currentPortId) => incomingEdges(targetPortId)
        .flatMap((edge) => resolve(edge.sourceNodeId, edge.sourcePortId, nextVisited));
      if (node.kind === "input.image" && (currentPortId === "image" || currentPortId === "reference")) {
        if (incomingEdges("reference").length > 0) return incoming("reference");
        const assetId = typeof config.assetId === "string" ? config.assetId : null;
        const direct = assetId && resolvedAssets.has(assetId) ? getMediaAssetContentUrl(assetId) : null;
        return direct ? [direct] : [];
      }
      if (node.kind === "input.audio" && currentPortId === "audio") {
        if (incomingEdges("audio").length > 0) return incoming("audio");
        const assetId = typeof config.assetId === "string" ? config.assetId : null;
        const direct = assetId && resolvedAssets.has(assetId) ? getMediaAssetContentUrl(assetId) : null;
        return direct ? [direct] : [];
      }
      if (node.kind === "input.video" && currentPortId === "video") {
        if (incomingEdges("video").length > 0) return incoming("video");
        const assetId = typeof config.assetId === "string" ? config.assetId : null;
        const direct = assetId && resolvedAssets.has(assetId) ? getMediaAssetContentUrl(assetId) : null;
        return direct ? [direct] : [];
      }
      if (node.kind === "process.promptConstructor" && currentPortId === "text") {
        try { const text = resolveGraphText(draftRef.current, currentNodeId); return text ? [text] : []; } catch { return []; }
      }
      if (node.kind === "input.prompt" && (currentPortId === "text" || currentPortId === "prompt")) {
        if (incomingEdges("text").length > 0) return incoming("text");
        const text = config.text;
        return typeof text === "string" && text ? [text] : [];
      }
      if (node.kind === "output.single" || node.kind === "output.gallery") return incoming();
      const outputAssets = currentOutputAssetsForPort(currentNodeId, currentPortId);
      if (outputAssets.length > 0) return outputAssets.map((asset) => getMediaAssetContentUrl(asset.id));
      return [];
    };
    return resolve(nodeId, portId, new Set());
  }, [currentOutputAssetsForPort, resolvedAssets]);

  const resolveUpstreamMediaAssets = useCallback((nodeId: string, portId: string): ResolvedMediaAsset[] => {
    const resolve = (currentNodeId: string, currentPortId: string, visited: Set<string>): ResolvedMediaAsset[] => {
      const visitKey = `${currentNodeId}:${currentPortId}`;
      if (visited.has(visitKey)) return [];
      const nextVisited = new Set(visited).add(visitKey);
      const node = draftRef.current.nodes.find((candidate) => candidate.id === currentNodeId);
      if (!node) return [];
      const config = record(node.config);
      const incomingEdges = (targetPortId = currentPortId) => draftRef.current.edges
        .filter((edge) => edge.targetNodeId === currentNodeId && edge.targetPortId === targetPortId)
        .sort((left, right) => left.sortOrder - right.sortOrder);
      const incoming = (targetPortId = currentPortId) => incomingEdges(targetPortId)
        .flatMap((edge) => resolve(edge.sourceNodeId, edge.sourcePortId, nextVisited));
      const inputAsset = (targetPortId: string) => {
        if (incomingEdges(targetPortId).length > 0) return incoming(targetPortId);
        const assetId = typeof config.assetId === "string" ? config.assetId : null;
        return assetId ? [{
          assetId,
          url: getMediaAssetContentUrl(assetId),
          asset: resolvedAssets.get(assetId) ?? null,
        }] : [];
      };
      if (node.kind === "input.image" && (currentPortId === "image" || currentPortId === "reference")) {
        return inputAsset("reference");
      }
      if (node.kind === "input.audio" && currentPortId === "audio") return inputAsset("audio");
      if (node.kind === "input.video" && currentPortId === "video") return inputAsset("video");
      if (node.kind === "input.prompt" && (currentPortId === "text" || currentPortId === "prompt")) return [];
      if (node.kind === "output.single" || node.kind === "output.gallery") return incoming();
      const outputAssets = currentOutputAssetsForPort(currentNodeId, currentPortId);
      if (outputAssets.length > 0) {
        return outputAssets.map((asset) => ({
          assetId: asset.id,
          url: getMediaAssetContentUrl(asset.id),
          asset,
        }));
      }
      return [];
    };
    return resolve(nodeId, portId, new Set());
  }, [currentOutputAssetsForPort, resolvedAssets]);

  const imagePresentations = useMemo(() => Object.fromEntries([...resolvedAssets.values()].filter(asset => asset.type === "image" && asset.imageVariants).flatMap(asset => {
    const roles = {list: imageUrlsFor(asset, "list"), display: imageUrlsFor(asset, "display")};
    return [[asset.url, roles], [getMediaAssetContentUrl(asset.id), roles]];
  })), [resolvedAssets]);

  const resolveUpstreamNodeData = useCallback((nodeId: string, runtimeData: Record<string, unknown>) => {
    const node = draftRef.current.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return null;
    const config = record(node.config);
    const executions = executionByNodeId.get(nodeId) ?? [];
    const latest = executions[0];
    const outputAssets = latestOutputAssetsForNode(nodeId);
    const outputHistoryAssets = outputHistoryAssetsForNode(nodeId);
    const selectedOutputAsset = node.selectedOutputAssetId
      ? resolvedAssets.get(node.selectedOutputAssetId)
      : null;
    const outputUrls = outputAssets.map((asset) => getMediaAssetContentUrl(asset.id));
    const primaryOutputAsset = selectedOutputAsset ?? outputAssets[0] ?? null;
    const selectedOutputUrl = selectedOutputAsset ? getMediaAssetContentUrl(selectedOutputAsset.id) : null;
    const selectedHistoryIndex = selectedOutputAsset
      ? outputHistoryAssets.findIndex((asset) => asset.id === selectedOutputAsset.id)
      : -1;
    const inputAssetId = typeof config.assetId === "string" ? config.assetId : null;
    const inputAsset = inputAssetId ? resolvedAssets.get(inputAssetId) : null;
    const executionPatch = latest
      ? {
          executionStatus: latest.status,
          executionProgress: latest.progress,
          error: latest.errorCode,
        }
      : {};
    const incomingValues = (targetNodeId: string, targetPortId: string) => draftRef.current.edges
      .filter((edge) => edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .flatMap((edge) => resolveUpstreamMediaValues(edge.sourceNodeId, edge.sourcePortId));
    const incomingMediaAssets = (targetNodeId: string, targetPortId: string) => draftRef.current.edges
      .filter((edge) => edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .flatMap((edge) => resolveUpstreamMediaAssets(edge.sourceNodeId, edge.sourcePortId));

    // A canonical `modelKey: null` is an explicit cleared placeholder. Only
    // consult legacy runtime data when the canonical config never had a model
    // key; otherwise a stale upstream selection can be resurrected here.
    const modelKey = Object.hasOwn(config, "modelKey")
      ? typeof config.modelKey === "string" && config.modelKey.length > 0
        ? config.modelKey
        : null
      : typeof runtimeData.modelKey === "string" && runtimeData.modelKey.length > 0
        ? runtimeData.modelKey
        : null;
    const modelCatalogEntry = node.kind === "generate.image"
      ? imageModels.find((model) => model.key === modelKey)
      : node.kind === "generate.video"
        ? videoModels.find((model) => model.key === modelKey)
        : node.kind === "generate.audio"
          ? audioModels.find((model) => model.key === modelKey)
          : undefined;
    const currentSelectedModel = record(runtimeData.selectedModel);
    const selectedModel = modelKey
      ? {
          ...currentSelectedModel,
          provider: modelCatalogEntry?.provider
            ?? (currentSelectedModel.modelId === modelKey && typeof currentSelectedModel.provider === "string"
              ? currentSelectedModel.provider
              : node.kind === "generate.image" ? "gemini" : "fal"),
          // The canonical key is authoritative. A runtime selected model can
          // lag one render behind a model/provider switch and must not leak its
          // old ID into the upstream component.
          modelId: modelKey,
          displayName: modelCatalogEntry?.label
            ?? (currentSelectedModel.modelId === modelKey && typeof currentSelectedModel.displayName === "string" && currentSelectedModel.displayName.length > 0
              ? currentSelectedModel.displayName
              : modelKey),
        }
      : undefined;
    const configuredParameters = record(config.parameters);
    const existingInputSchema = Array.isArray(configuredParameters.inputSchema)
      ? configuredParameters.inputSchema
      : Array.isArray(record(modelCatalogEntry?.meta).inputSchema)
        ? record(modelCatalogEntry?.meta).inputSchema
        : Array.isArray(record(modelCatalogEntry?.meta).input_schema)
          ? record(modelCatalogEntry?.meta).input_schema
          : node.kind === "generate.video" && modelKey?.startsWith("veo-")
            ? [
                ...(modelKey.includes("image-to-video")
                  ? [{ name: "image", type: "image", required: true, label: "Image" }]
                  : []),
                { name: "prompt", type: "text", required: true, label: "Prompt" },
                { name: "negative_prompt", type: "text", required: false, label: "Neg. Prompt" },
              ]
            : undefined;
    const modelProjection = node.kind.startsWith("generate.")
      ? {
          // Always project the canonical selection, including an explicit null
          // placeholder, so stale runtime model fields cannot survive a clear.
          modelKey,
          model: modelKey,
          selectedModel,
          provider: selectedModel?.provider,
          parameters: existingInputSchema
            ? { ...configuredParameters, inputSchema: existingInputSchema }
            : configuredParameters,
          ...(modelCatalogEntry ? {
            modelCatalogEntry,
            parameterSchema: modelCatalogEntry.parameters,
          } : {}),
          // Include an explicit undefined to overwrite stale legacy runtime
          // fields while the canonical model has no dynamic schema.
          inputSchema: existingInputSchema,
        }
      : {};
    const imageInputAssets = incomingMediaAssets(nodeId, "image");
    const videoInputAssets = incomingMediaAssets(nodeId, "video");
    const audioInputAssets = incomingMediaAssets(nodeId, "audio");
    const imageInputs = imageInputAssets.map((asset) => asset.url);
    const primaryImageInputs = incomingValues(nodeId, "primary");
    const referenceImageInputs = incomingValues(nodeId, "references");
    const initImageInputs = incomingValues(nodeId, "initImage");
    const clipInputs = incomingValues(nodeId, "clips");
    const soundtrackInputs = incomingValues(nodeId, "soundtrack");
    const videoInputs = videoInputAssets.map((asset) => asset.url);
    const audioInputs = audioInputAssets.map((asset) => asset.url);
    const promptInputs = incomingValues(nodeId, "prompt");
    const promptConnected = draftRef.current.edges.some((edge) =>
      edge.targetNodeId === nodeId && edge.targetPortId === "prompt",
    );
    const imageInput = imageInputs[0] ?? null;
    const videoInput = videoInputs[0] ?? null;
    const audioInput = audioInputs[0] ?? null;
    const internalPrompt = typeof config.prompt === "string" ? config.prompt : "";
    const promptInput = promptConnected ? (promptInputs[0] ?? "") : internalPrompt;
    const primaryImage = primaryImageInputs[0] ?? null;
    const presentation = record(config.presentation);
    const outputDimensions = primaryOutputAsset?.width !== null && primaryOutputAsset?.width !== undefined
      && primaryOutputAsset?.height !== null && primaryOutputAsset?.height !== undefined
      ? { width: primaryOutputAsset.width, height: primaryOutputAsset.height }
      : null;
    const outputBytes = primaryOutputAsset?.bytes ? Number(primaryOutputAsset.bytes) : null;
    const base = {
      missingMedia: [inputAssetId, node.selectedOutputAssetId, ...(latest?.outputAssetIds ?? [])].some(id => id && missingAssetIds.has(id)),
      imagePresentations,
      ...modelProjection,
      ...executionPatch,
      outputDimensions,
      outputBytes: Number.isFinite(outputBytes) ? outputBytes : null,
      customTitle: presentation.customTitle,
      comment: presentation.comment,
      isOptional: presentation.isOptional,
    };
    switch (node.kind) {
      case "input.image":
        return {
          ...base,
          image: inputAsset ? getMediaAssetContentUrl(inputAsset.id) : null,
          filename: typeof config.filename === "string" ? config.filename : null,
          dimensions: inputAsset?.width !== null && inputAsset?.width !== undefined
            && inputAsset?.height !== null && inputAsset?.height !== undefined
            ? { width: inputAsset.width, height: inputAsset.height }
            : null,
        };
      case "input.audio":
        return {
          ...base,
          audioFile: inputAsset ? getMediaAssetContentUrl(inputAsset.id) : null,
          filename: typeof config.filename === "string" ? config.filename : null,
          duration: inputAsset?.durationMs !== null && inputAsset?.durationMs !== undefined
            ? inputAsset.durationMs / 1_000
            : null,
          format: inputAsset?.mimeType ?? null,
        };
      case "input.video":
        return {
          ...base,
          video: inputAsset ? getMediaAssetContentUrl(inputAsset.id) : null,
          // Vendored video operation presenters read source clips through the
          // upstream outputVideo field. Keep the canonical video field too so
          // input uploads remain round-trippable at the host boundary.
          outputVideo: inputAsset ? getMediaAssetContentUrl(inputAsset.id) : null,
          outputVideoRef: inputAsset?.id ?? null,
          filename: typeof config.filename === "string" ? config.filename : null,
          duration: inputAsset?.durationMs !== null && inputAsset?.durationMs !== undefined
            ? inputAsset.durationMs / 1_000
            : null,
          dimensions: inputAsset?.width !== null && inputAsset?.width !== undefined
            && inputAsset?.height !== null && inputAsset?.height !== undefined
            ? { width: inputAsset.width, height: inputAsset.height }
            : null,
          format: inputAsset?.mimeType ?? null,
        };
      case "process.promptConstructor": {
        let outputText: string | null = null;
        try { outputText = resolveGraphText(draftRef.current, nodeId) || null; } catch { /* Invalid graphs show unresolved text. */ }
        return { ...base, template: typeof config.template === "string" ? config.template : "", outputText };
      }
      case "input.prompt": {
        let prompt = "";
        try { prompt = resolveGraphText(draftRef.current, nodeId); } catch { /* Invalid graphs have no resolved prompt. */ }
        return {
          ...base,
          prompt: typeof config.text === "string" ? config.text : "",
          resolvedPrompt: prompt,
          variableName: typeof config.variableName === "string" ? config.variableName : "",
        };
      }
      case "generate.image":
        return {
          ...base,
          prompt: promptInput,
          inputPrompt: promptInput,
          internalPrompt,
          promptConnected,
          supportsImageInput: modelKey
            ? resolveRuntimeImageMaxInputImages(imageModels.find((model) => model.key === modelKey)) > 0
            : false,
          primary: primaryImage,
          references: referenceImageInputs,
          inputImages: [...(primaryImage ? [primaryImage] : []), ...referenceImageInputs],
          outputImage: selectedOutputUrl,
          imageHistory: outputHistoryAssets.map((asset) => ({ id: asset.id })),
          selectedHistoryIndex: selectedHistoryIndex >= 0 ? selectedHistoryIndex : undefined,
        };
      case "generate.audio":
        return {
          ...base,
          prompt: promptInput,
          inputPrompt: promptInput,
          internalPrompt,
          promptConnected,
          outputAudio: selectedOutputUrl,
          audioHistory: outputHistoryAssets.map((asset) => ({ id: asset.id })),
          selectedAudioHistoryIndex: selectedHistoryIndex >= 0 ? selectedHistoryIndex : undefined,
        };
      case "generate.video":
        return {
          ...base,
          prompt: promptInput,
          inputPrompt: promptInput,
          internalPrompt,
          promptConnected,
          supportsImageInput: modelKey
            ? resolveRuntimeVideoSupportsInitImage(videoModels.find((model) => model.key === modelKey))
            : false,
          initImage: initImageInputs[0] ?? null,
          inputImages: initImageInputs,
          outputVideo: selectedOutputUrl,
          videoHistory: outputHistoryAssets.map((asset) => ({ id: asset.id })),
          selectedVideoHistoryIndex: selectedHistoryIndex >= 0 ? selectedHistoryIndex : undefined,
        };
      case "edit.image.annotation":
        return {
          ...base,
          sourceImage: imageInput,
          annotations: Array.isArray(record(config.parameters).shapes) ? record(config.parameters).shapes : [],
          outputImage: selectedOutputUrl ?? outputUrls[0] ?? null,
        };
      case "edit.image.resize":
        return { ...base, sourceImage: imageInput, outputImage: outputUrls[0] ?? null };
      case "edit.image.removeBackground":
        return { ...base, sourceImage: imageInput, outputImage: outputUrls[0] ?? null };
      case "edit.image.splitGrid":
        return { ...base, sourceImage: imageInput, outputImages: currentOutputAssetsForPort(nodeId, "images").map((asset) => getMediaAssetContentUrl(asset.id)) };
      case "edit.image.gif": {
        const clipOrder = Array.isArray(configuredParameters.clipOrder) ? [...new Set(configuredParameters.clipOrder)] : [];
        const frameEdges = draftRef.current.edges
          .filter((edge) => edge.targetNodeId === nodeId && (edge.targetPortId === "frames" || edge.targetPortId === "image"))
          .sort((left, right) => left.sortOrder - right.sortOrder);
        const orderedEdges = [
          ...clipOrder.flatMap((id) => frameEdges.filter((edge) => edge.id === id)),
          ...frameEdges.filter((edge) => !clipOrder.includes(edge.id)),
        ];
        const frameGroups = orderedEdges.map((edge) => ({
          sourceEdgeId: edge.id,
          frames: resolveUpstreamMediaValues(edge.sourceNodeId, edge.sourcePortId),
        }));
        return { ...base, frameGroups, frames: frameGroups.flatMap((group) => group.frames), outputGif: outputUrls[0] ?? null };
      }
      case "edit.video.stitch":
        return {
          ...base,
          clips: clipInputs,
          clipUrls: clipInputs,
          videos: clipInputs,
          soundtrack: soundtrackInputs[0] ?? null,
          audio: soundtrackInputs[0] ?? null,
          outputVideo: outputUrls[0] ?? null,
        };
      case "edit.video.trim":
        return {
          ...base,
          sourceVideo: videoInput,
          duration: videoInputAssets[0]?.asset?.durationMs !== null
            && videoInputAssets[0]?.asset?.durationMs !== undefined
            ? videoInputAssets[0].asset.durationMs / 1_000
            : null,
          outputVideo: outputUrls[0] ?? null,
        };
      case "edit.video.frameGrab":
        return { ...base, sourceVideo: videoInput, outputImage: outputUrls[0] ?? null };
      case "edit.video.easeCurve":
        return { ...base, sourceVideo: videoInput, outputVideo: outputUrls[0] ?? null };
      case "output.single":
        return { ...base, image: imageInput, video: videoInput, audio: audioInput };
      case "output.gallery": {
        const excluded = new Set(outputGalleryExcludedAssetIds(config));
        const visible = (assets: ResolvedMediaAsset[]) => assets.filter((asset) => !excluded.has(asset.assetId));
        const images = visible(imageInputAssets);
        const videos = visible(videoInputAssets);
        const audios = visible(audioInputAssets);
        return {
          ...base,
          images: images.map((asset) => asset.url),
          imageRefs: images.map((asset) => asset.assetId),
          videos: videos.map((asset) => asset.url),
          videoRefs: videos.map((asset) => asset.assetId),
          audios: audios.map((asset) => asset.url),
          audioRefs: audios.map((asset) => asset.assetId),
        };
      }
      case "inspect.imageCompare":
        return {
          ...base,
          imageA: incomingValues(nodeId, "before")[0] ?? null,
          imageB: incomingValues(nodeId, "after")[0] ?? null,
        };
      default:
        return { ...runtimeData, ...base };
    }
  }, [missingAssetIds, imagePresentations, audioModels, currentOutputAssetsForPort, executionByNodeId, imageModels, latestOutputAssetsForNode, outputHistoryAssetsForNode, resolveUpstreamMediaAssets, resolveUpstreamMediaValues, resolvedAssets, videoModels]);

  const handleHostError = useCallback((error: Error) => {
    setHostError(error.message);
  }, []);

  const handleInputMediaUpload = useCallback(async (input: {
    nodeId: string;
    mediaType: MediaType;
    dataUrl: string;
    filename: string | null;
    mimeType: string | null;
  }) => {
    if (graph.writable === false) throw new Error("WORKFLOW_READ_ONLY");
    setHostError(null);
    const originalNode = draftRef.current.nodes.find((node) => node.id === input.nodeId);
    if (!originalNode) throw new DOMException("Input removed", "AbortError");
    const originalConfig = JSON.stringify(originalNode.config);
    operationControllers.get(input.nodeId)?.abort();
    const controller = new AbortController();
    operationControllers.set(input.nodeId, controller);
    const extension = input.mediaType === "image" ? "png" : input.mediaType === "audio" ? "mp3" : "mp4";
    const fileName = input.filename?.trim() || `${input.nodeId}.${extension}`;
    try {
      const file = await dataUrlToFile(input.dataUrl, fileName, input.mimeType);
      controller.signal.throwIfAborted();
      const asset = await uploadMedia.mutateAsync({ file, type: input.mediaType });
      controller.signal.throwIfAborted();
      const currentNode = draftRef.current.nodes.find((node) => node.id === input.nodeId);
      if (!writableRef.current || !currentNode || JSON.stringify(currentNode.config) !== originalConfig) {
        throw new DOMException("Input changed while uploading", "AbortError");
      }
      setAssetOverrides((current) => ({ ...current, [asset.id]: asset }));
      // The caller publishes this through the Canvas canonical writer once.
      return { assetId: asset.id };
    } finally {
      if (operationControllers.get(input.nodeId) === controller) operationControllers.delete(input.nodeId);
    }
  }, [graph.writable, operationControllers, uploadMedia]);

  const handleAnnotationOutput = useCallback(async (input: {
    nodeId: string;
    dataUrl: string;
    annotations: Record<string, unknown>[];
  }) => {
    if (graph.writable === false) throw new Error("WORKFLOW_READ_ONLY");
    setHostError(null);
    if (!input.dataUrl.startsWith("data:image/")) {
      throw new Error("ANNOTATION_OUTPUT_INVALID");
    }
    updateDraftNode(input.nodeId, (node) => ({
      ...node,
      config: {
        ...record(node.config),
        parameters: {
          ...record(record(node.config).parameters),
          shapes: input.annotations,
        },
      } as typeof node.config,
    }));
    const controller = new AbortController();
    operationControllers.set(input.nodeId, controller);
    try {
      const expectedGraphVersion = await prepareExecution();
      controller.signal.throwIfAborted();
      const execution = await startExecution.mutateAsync({
        graphId: graph.id,
        nodeId: input.nodeId,
        expectedGraphVersion,
      });
      if (!execution.plan || execution.plan.kind !== "edit.image.annotation") {
        throw new Error("ANNOTATION_EXECUTION_PLAN_INVALID");
      }
      const assets = await runPreparedAnnotationOperation({
        graphId: graph.id,
        nodeId: input.nodeId,
        execution,
        signal: controller.signal,
        dataUrl: input.dataUrl,
      });
      const asset = assets[0];
      if (!asset) throw new Error("ANNOTATION_OUTPUT_MISSING");
      setAssetOverrides((current) => ({ ...current, [asset.id]: asset }));
      updateDraftNode(input.nodeId, (node) => ({
        ...node,
        selectedOutputAssetId: asset.id,
      }));
      await queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, input.nodeId) });
      return { assetId: asset.id };
    } finally {
      controller.abort();
      if (operationControllers.get(input.nodeId) === controller) operationControllers.delete(input.nodeId);
    }
  }, [graph.id, graph.writable, operationControllers, prepareExecution, queryClient, startExecution, updateDraftNode]);

  const handleRegenerateNode = useCallback(async (nodeId: string) => {
    if (graph.writable === false) throw new Error("WORKFLOW_READ_ONLY");
    setHostError(null);
    const node = draftRef.current.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error("UPSTREAM_NODE_NOT_FOUND");
    const controller = new AbortController();
    operationControllers.set(nodeId, controller);
    try {
      const expectedGraphVersion = await prepareExecution();
      controller.signal.throwIfAborted();
      const execution = await startExecution.mutateAsync({
        graphId: graph.id,
        nodeId,
        expectedGraphVersion,
      });
      const plan = execution.plan;
      if (!plan) {
        // Server operations (currently Remove Background) do not return a
        // browser plan. Wait for the same operation to settle so the hosted
        // component can receive its durable output before the run callback
        // resolves; the API persists selection independently on completion.
        const completed = await waitForServerOperation(
          graph.id,
          nodeId,
          execution.executionId,
          controller.signal,
        );
        if (completed.status !== "completed" || completed.outputAssetIds.length === 0) {
          await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
          return;
        }
        const assets = await Promise.all(
          completed.outputAssetIds.map((assetId) => getMediaAsset(assetId, controller.signal)),
        );
        setAssetOverrides((current) => Object.fromEntries([
          ...Object.entries(current),
          ...assets.map((asset) => [asset.id, asset] as const),
        ]));
        await queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
        await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
        return { selectedOutputAssetId: assets[0]?.id };
      }

      const input = { graphId: graph.id, nodeId, execution, signal: controller.signal };
      const assets = plan.kind.startsWith("edit.image.")
        ? await runBrowserImageOperation(input)
        : plan.kind.startsWith("edit.video.")
          ? await runBrowserVideoOperation(input)
          : (() => { throw new Error("UPSTREAM_EXECUTION_PLAN_UNSUPPORTED"); })();
      setAssetOverrides((current) => {
        if (assets.length === 0) return current;
        return Object.fromEntries([
          ...Object.entries(current),
          ...assets.map((asset) => [asset.id, asset] as const),
        ]);
      });
      await queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
      const selectedOutputAssetId = assets[0]?.id;
      return selectedOutputAssetId ? { selectedOutputAssetId,
        ...(plan.kind === "edit.image.splitGrid" ? {
          outputAssetIds: assets.map((asset) => asset.id),
          outputGrid: { rows: Number(plan.parameters.rows), cols: Number(plan.parameters.cols) },
        } : {}),
      } : undefined;
    } finally {
      controller.abort();
      if (operationControllers.get(nodeId) === controller) operationControllers.delete(nodeId);
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
    }
  }, [graph.id, graph.writable, operationControllers, prepareExecution, queryClient, startExecution]);

  const handleOpenAnnotation = useCallback((nodeId: string) => {
    if (graph.writable === false) return;
    setHostError(null);
    setAnnotationNodeId(nodeId);
  }, [graph.writable]);
  const handleCloseAnnotation = useCallback((nodeId: string) => {
    setAnnotationNodeId((current) => current === nodeId ? null : current);
  }, []);
  const handleExpandNode = useCallback((nodeId: string, nodeType: string) => {
    if (graph.writable === false) return;
    if (nodeType === "annotation") {
      setAnnotationNodeId(nodeId);
      return;
    }
    setHostError(`UPSTREAM_EXPAND_HANDLER_UNAVAILABLE:${nodeType}`);
  }, [graph.writable]);

  const busy = autosave.status === "dirty" || autosave.status === "saving";
  const tHost = useTranslations("nodeStudio.host");
  const saveLabel = {
    saved: tHost("saved"),
    dirty: tHost("dirty"),
    saving: tHost("saving"),
    error: tHost("saveError"),
    conflict: tHost("conflict"),
  }[autosave.status];
  const hostedGraph = useMemo(() => ({ ...graph, title }), [graph, title]);
  const commentNodes = useMemo(() => {
    void draftRevision;
    return draftRef.current.nodes.map((node) => ({
      id: node.id, position: node.position,
      data: { comment: typeof record(record(node.config).presentation).comment === "string" ? record(record(node.config).presentation).comment as string : undefined },
    }));
  }, [draftRevision]);
  const comments = useSpaceCommentsSession(graph.id, commentNodes);
  const headerModels = useMemo(() => [
    ...nodeCatalog.imageModels.map((model) => ({ id: model.key, name: model.label, provider: model.provider, mediaKind: "image" as const })),
    ...nodeCatalog.videoModels.map((model) => ({ id: model.key, name: model.label, provider: model.provider, mediaKind: "video" as const })),
    ...nodeCatalog.audioModels.map((model) => ({ id: model.key, name: model.label, provider: model.provider, mediaKind: "audio" as const })),
  ], [nodeCatalog]);
  const nodeDefaults = useMemo(() => Object.fromEntries(Object.entries(preferences.data?.defaults ?? {}).map(([kind, value]) => [kind, value.modelKey])), [preferences.data?.defaults]);
  const pickerModels = useMemo(() => nodeBananaCatalogModels(nodeCatalog), [nodeCatalog]);
  const recentModels = useMemo(() => (preferences.data?.recentModelKeys ?? []).flatMap((key, index) => {
    const model = pickerModels.find((entry) => entry.id === key);
    return model ? [{ provider: model.provider, modelId: model.id, displayName: model.name, timestamp: -index }] : [];
  }), [preferences.data?.recentModelKeys, pickerModels]);
  const leaveAfterSaving = async (action: () => void) => {
    if (leaving) return;
    setLeaving(true);
    try { await autosave.saveNow(); action(); }
    catch { pendingLeaveAction.current = action; setLeaveOpen(true); }
    finally { setLeaving(false); }
  };

  return (
    <SpacePreferencesContext.Provider value={preferences}>
    <SpaceCommentsContext.Provider value={comments}>
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-900"
      data-node-banana-component="Home"
      data-node-banana-annotation-node={annotationNodeId ?? undefined}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && !target.closest('[data-canvas-action="comments"], [data-canvas-action="next-comment"], [data-canvas-action="previous-comment"]')) comments.clearFocus();
      }}
    >
      <NodeBananaHostedHeader
        commentsNavigation={<CommentsNavigationIcon count={comments.count} unreadCount={comments.unreadCount} onNavigate={comments.navigateFirst} />}
        hasUnsavedChanges={autosave.status !== "saved"}
        models={headerModels}
        renderModelPicker={(kind, select, close) => <NodeBananaUpstreamHostProvider value={{
          hostedModels: pickerModels, recentModels,
          trackModelUsage: (model: { modelId: string }) => preferences.trackModel(model.modelId),
        }}>
          <ModelSearchDialog isOpen onClose={close} title={`Default ${kind[0].toUpperCase()}${kind.slice(1)} Model`} initialCapabilityFilter={kind}
            hosted={{ hostedModels: pickerModels.filter((model) => headerModels.some((entry) => entry.id === model.id && entry.mediaKind === kind)), isLoading: nodeCatalog.isLoading, error: nodeCatalog.error,
              onRefresh: async () => { const result = await refetchCatalog(); if (result.error) throw result.error; },
              onHostedModelSelected: (model) => { select(model.id); close(); },
            }} />
        </NodeBananaUpstreamHostProvider>}
        nodeDefaults={nodeDefaults}
        nodeDefaultsLoading={!preferences.data || preferences.saving || nodeCatalog.isLoading}
        nodeDefaultsError={preferences.error ?? nodeCatalog.error}
        onRetryNodeDefaults={() => { preferences.retry(); nodeCatalog.retry(); }}
        onSaveNodeDefaults={async (defaults) => {
          await preferences.saveDefaults(Object.fromEntries(Object.entries(defaults).flatMap(([kind, modelKey]) => {
            if (!modelKey) return [];
            const previous = preferences.data?.defaults[kind as "image" | "video" | "audio"];
            return [[kind, { modelKey, parameters: previous?.modelKey === modelKey ? previous.parameters : {} }]];
          })));
        }}
        onSaveSettings={async (changes) => {
          await preferences.saveSettings({
            ...(changes.inlineParametersEnabled !== undefined ? { inlineParametersEnabled: changes.inlineParametersEnabled } : {}),
            ...(changes.defaults ? { defaults: Object.fromEntries(Object.entries(changes.defaults).flatMap(([kind, modelKey]) => {
              if (!modelKey) return [];
              const previous = preferences.data?.defaults[kind as "image" | "video" | "audio"];
              return [[kind, { modelKey, parameters: previous?.modelKey === modelKey ? previous.parameters : {} }]];
            })) } : {}),
          });
        }}
        inlineParametersEnabled={preferences.inlineParametersEnabled}
        onInlineParametersChange={preferences.setInlineParametersEnabled}
        brand={<div className="flex shrink-0 items-center gap-2">
          {onBack ? <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-40" aria-label={tHost("back")} title={tHost("back")} disabled={leaving} onClick={() => void leaveAfterSaving(onBack)}><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button> : null}
          {onCreatePreset ? <button type="button" className="flex items-center" aria-label={tHost("quickstart")} title={tHost("quickstart")} onClick={() => setQuickstartOpen(true)}><AppBrandLogo size="sm" /></button> : <AppBrandLogo size="sm" />}
        </div>}
        title={title}
        graphs={graphs ?? [{ id: graph.id, title: graph.title }]}
        activeGraphId={activeGraphId ?? graph.id}
        saveLabel={saveLabel}
        saving={autosave.status === "saving"}
        writable={graph.writable !== false}
        creating={creating || leaving}
        deleting={busy || deleting}
        canvasSettings={canvasSettings}
        onCanvasSettingsChange={updateCanvasSettings}
        onTitleChange={(nextTitle) => {
          setTitle(nextTitle);
          titleRef.current = nextTitle;
          if (nextTitle.trim()) updateDraft({ ...draftRef.current, title: nextTitle.trim() });
        }}
        onSelectGraph={(graphId) => void leaveAfterSaving(() => onSelectGraph?.(graphId))}
        onCreateGraph={(name) => { if (onCreateGraph) void leaveAfterSaving(() => onCreateGraph(name)); }}
        onSave={() => {
          if (autosave.status === "conflict") {
            setReloadOpen(true);
          } else if (autosave.status === "error") {
            autosave.retry();
          } else {
            void autosave.saveNow();
          }
        }}
        onDelete={() => setDeleteOpen(true)}
      />

      <GenerationEventChannelProvider graphId={graph.id}>
        <NodeStudio
          graph={hostedGraph}
          onDraftChange={handleCanvasDraft}
          prepareImageNodeExecution={prepareExecution}
          catalog={nodeCatalog}
          canvasSettings={canvasSettings}
          onRegenerateNode={handleRegenerateNode}
          onCancelNode={handleCancelNode}
          onOpenAnnotation={handleOpenAnnotation}
          onCloseAnnotation={handleCloseAnnotation}
          onExpandNode={handleExpandNode}
          onInputMediaUpload={handleInputMediaUpload}
          onAnnotationOutput={handleAnnotationOutput}
          onHostError={handleHostError}
          resolveUpstreamNodeData={resolveUpstreamNodeData}
        />
      </GenerationEventChannelProvider>

      {hostError ? (
        <div role="alert" className="shrink-0 border-t border-red-300/20 bg-red-950/80 px-4 py-2 text-xs text-red-100">
          {hostError}
        </div>
      ) : null}

      {quickstartOpen && onCreatePreset && <HostedQuickstart onClose={() => setQuickstartOpen(false)}
        onCreate={async (workflow, tutorial) => { await autosave.saveNow(); await onCreatePreset(workflow, tutorial); }}
        onBrowse={() => { setQuickstartOpen(false); if (onBack) void leaveAfterSaving(onBack); }} />}
      {tutorialActive && onTutorialClose && <HostedTutorial onClose={onTutorialClose}
        nodes={draftRef.current.nodes.map((node) => ({ id: node.id,
          type: nodeBananaLegacyTypeByCanonicalKind[node.kind as keyof typeof nodeBananaLegacyTypeByCanonicalKind] ?? node.kind,
          data: resolveUpstreamNodeData(node.id, { canonicalKind: node.kind, config: node.config }) ?? {} }))}
        edges={draftRef.current.edges.map((edge) => ({ source: edge.sourceNodeId, target: edge.targetNodeId }))} />}
      <NodeBananaConfirmDialog
        open={leaveOpen}
        title={tHost("leaveTitle")}
        description={tHost("leaveDescription")}
        confirmLabel={tHost("leaveConfirm")}
        danger
        onCancel={() => { setLeaveOpen(false); pendingLeaveAction.current = null; }}
        onConfirm={() => { setLeaveOpen(false); const action = pendingLeaveAction.current; pendingLeaveAction.current = null; action?.(); }}
      />
      <NodeBananaConfirmDialog
        open={deleteOpen}
        title={tHost("deleteTitle")}
        description={tHost("deleteDescription", { title })}
        confirmLabel={tHost("delete")}
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete();
        }}
      />

      <NodeBananaConfirmDialog
        open={reloadOpen}
        title={tHost("reloadTitle")}
        description={tHost("reloadDescription")}
        confirmLabel={tHost("reload")}
        onCancel={() => setReloadOpen(false)}
        onConfirm={() => {
          setReloadOpen(false);
          onReloadLatest();
        }}
      />
    </div>
    </SpaceCommentsContext.Provider>
    </SpacePreferencesContext.Provider>
  );
}
