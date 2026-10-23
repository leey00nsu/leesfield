"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { SpacePreferencesContext, useSpacePreferencesSession } from "../hook/use-space-preferences";
import { useSpaceOperationError } from "../hook/use-space-operation-error";
import { SpaceCommentsContext, useSpaceCommentsSession } from "../hook/use-space-comments";
import { cancelNodeExecution, listNodeExecutions } from "../api/node-execution-api";
import { nodeExecutionKeys, nodeExecutionRefetchInterval, useStartNodeExecution } from "../hook/use-node-executions";
import { runBrowserImageOperation } from "../lib/browser-image-operation-runner";
import { getMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import type { NodeExecutionDto } from "../model/node-execution-types";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { assistantTextResult } from "@/shared/generation-graph/assistant-output";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import { useGraphAutosave, type GraphDraft, type GraphAutosaveStatus } from "../hook/use-graph-autosave";
import { observeServerExecution, ExecutionSelectionTracker, generationInputIdentity } from "../model/server-execution-tracking";
import { useGenerationEventChannelState } from "../model/generation-event-channel-context";
import { GenerationEventChannelProvider } from "../hook/use-generation-event-channel";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceCanvasSettings } from "../model/space-editor-types";
import { NodeExecutionReadContext } from "../model/node-execution-read-context";
import type { SpacePresetWorkflow } from "../model/space-quickstart-types";
import { SpaceWorkspaceHeader, SpaceCommentsNavigationIcon } from "./space-workspace-header";
import { SpaceQuickstart } from "./space-quickstart";
import { SpaceTutorial } from "./space-tutorial";
import { SpaceModelBrowser } from "./space-model-browser";
import { SpaceConfirmDialog } from "./space-confirm-dialog";
import { NodeStudio } from "./node-studio";
import type { SpaceEditorServices } from "./space-editor-provider";
import { bindResultNodes, reconcileResultNodes, reserveResultNodes, unsubmittedResultIds } from "../model/generation-result-nodes";

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
  onCreatePreset?: (workflow: SpacePresetWorkflow | null, tutorial?: boolean) => Promise<void>;
  tutorialActive?: boolean;
  onTutorialClose?: () => void;
  creating?: boolean;
  deleting?: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function activeExecution(execution: NodeExecutionDto) {
  return execution.status === "pending" || execution.status === "processing" || execution.status === "uploading";
}
const noExecutions: NodeExecutionDto[] = [];
function executionData(queries: Array<{ data?: NodeExecutionDto[] }>) { return queries.map(query => query.data ?? noExecutions); }

const defaultCanvasSettings: SpaceCanvasSettings = {
  panMode: "space",
  zoomMode: "altScroll",
  selectionMode: "click",
};

function loadCanvasSettings(): SpaceCanvasSettings {
  if (typeof window === "undefined") return defaultCanvasSettings;
  try {
    const saved = window.localStorage.getItem("node-studio.canvas-settings");
    if (!saved) return defaultCanvasSettings;
    const value = JSON.parse(saved) as Partial<SpaceCanvasSettings>;
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

export function NodeStudioWorkspace(props: NodeStudioWorkspaceProps) {
  return <GenerationEventChannelProvider graphId={props.graph.id}><NodeStudioWorkspaceContent key={props.graph.id} {...props} /></GenerationEventChannelProvider>;
}

function NodeStudioWorkspaceContent({ graph, graphs, activeGraphId, onSaved, onBack, onDelete, onReloadLatest, onStatusChange,
  onSelectGraph, onCreateGraph, onCreatePreset, tutorialActive, onTutorialClose, creating, deleting }: NodeStudioWorkspaceProps) {
  const [session] = useState(() => createSpaceEditorSession(graph));
  const [initialDraft] = useState<GraphDraft>(() => session.getDocument());
  const draft = useStore(session.store, state => state.document);
  const writable = useStore(session.store, state => state.writable);
  const writableRef = useRef(writable); writableRef.current = writable;
  const preferences = useSpacePreferencesSession(graph.id);
  const [title, setTitle] = useState(graph.title), [quickstartOpen, setQuickstartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false), [reloadOpen, setReloadOpen] = useState(false), [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeaveAction = useRef<(() => void) | null>(null), [leaving, setLeaving] = useState(false);
  const [canvasSettings, setCanvasSettings] = useState<SpaceCanvasSettings>(loadCanvasSettings);
  const notifyError = useSpaceOperationError();
  const operationControllers = useMemo(() => new Map<string, AbortController>(), []);
  const acceptedExecutionIds = useMemo(() => new Map<string, string>(), []);
  const cancelledSubmissions = useMemo(() => new WeakSet<AbortController>(), []);
  const observingRef = useRef(true), lifecycle = useRef<object | null>(null), onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;
  const reportError = useCallback((error: unknown, eventKey?: string) => {
    if (observingRef.current && !session.getSnapshot().disposed && session.getSnapshot().id === graph.id) notifyError(error, eventKey);
  }, [notifyError, session, graph.id]);
  useEffect(() => {
    const token = {}; lifecycle.current = token; observingRef.current = true;
    const abortOwnedOperations = () => { for (const controller of operationControllers.values()) controller.abort(); operationControllers.clear(); };
    window.addEventListener("pagehide", abortOwnedOperations);
    return () => {
      observingRef.current = false; window.removeEventListener("pagehide", abortOwnedOperations); abortOwnedOperations();
      queueMicrotask(() => { if (lifecycle.current === token) session.dispose(); });
    };
  }, [session, operationControllers]);
  useLayoutEffect(() => { session.setAccess(graph.writable !== false, graph.readOnlyReason ?? null); }, [session, graph.writable, graph.readOnlyReason]);
  const acknowledgeSaved = useCallback((saved: GenerationGraphSnapshotDto) => {
    if (!observingRef.current || saved.id !== session.getSnapshot().id) return;
    session.ack({ id: saved.id, version: saved.version, persistedNodeIds: saved.nodes.map(node => node.id), persistedEdgeIds: saved.edges.map(edge => edge.id), persistedGroupIds: saved.groups.map(group => group.id) });
    onSavedRef.current(saved);
  }, [session]);
  const runtimeCatalog = useRuntimeModelCatalog();
  const e2eBackgroundRemovalAvailable = process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL === "1";
  const {
    audioModels,
    error: catalogError,
    imageModels,
    llmModels,
    isLoading: catalogLoading,
    refetch: refetchCatalog,
    videoModels,
  } = runtimeCatalog;
  const nodeCatalog = useMemo(
    () => ({
      imageModels: imageModels.filter((model) => model.isActive),
      videoModels: (videoModels ?? []).filter((model) => model.isActive),
      audioModels: (audioModels ?? []).filter((model) => model.isActive),
      llmModels: (llmModels ?? []).filter((model) => model.isActive),
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
      llmModels,
      refetchCatalog,
      videoModels,
    ],
  );
  const autosave = useGraphAutosave({ graphId: graph.id, initialVersion: graph.version, initialDraft, onSaved: acknowledgeSaved });
  const autosaveUpdateRef = useRef(autosave.update), autosaveSaveNowRef = useRef(autosave.saveNow), preserveSelectionRef = useRef(autosave.preserveSelection);
  autosaveUpdateRef.current = autosave.update; autosaveSaveNowRef.current = autosave.saveNow; preserveSelectionRef.current = autosave.preserveSelection;
  const queryClient = useQueryClient(), startExecution = useStartNodeExecution(), eventChannelState = useGenerationEventChannelState();
  const selectionTracker = useRef(new ExecutionSelectionTracker()), repeatInputs = useRef(new Map<string, string>());
  const [repeatProgress, setRepeatProgress] = useState<Record<string, { completed: number; failed: number; total: number; running: boolean }>>({});
  const reconcileReadRef = useRef<(nodeId: string, executions: NodeExecutionDto[], read: ReturnType<ExecutionSelectionTracker["beginRead"]>) => void>(() => {});
  useLayoutEffect(() => session.subscribeDurable(event => {
    if (event.origin === "user") for (const id of event.selectionNodeIds) selectionTracker.current.changed(id);
    if (session.getSnapshot().writable) {
      autosaveUpdateRef.current(event.document);
      if (event.origin === "user") for (const id of event.selectionNodeIds) preserveSelectionRef.current?.(id);
    }
  }), [session]);
  useEffect(() => {
    for (const [id, identity] of repeatInputs.current) if (generationInputIdentity(draft, id) !== identity) operationControllers.get(id)?.abort();
  }, [draft, operationControllers]);
  useEffect(() => { onStatusChange?.(autosave.status); }, [autosave.status, onStatusChange]);
  const updateDraft = useCallback((next: GraphDraft) => {
    const result = session.applySystemTransaction(() => next);
    if (!result.ok && !session.getSnapshot().disposed) reportError(new Error(result.message));
  }, [session, reportError]);
  const prepareExecution = useCallback(async () => (await autosaveSaveNowRef.current()).version, []);
  const readExecutions = useCallback(async (nodeId: string, signal: AbortSignal) => {
    const read = selectionTracker.current.beginRead(nodeId), executions = await listNodeExecutions(graph.id, nodeId, signal);
    signal.throwIfAborted();
    if (observingRef.current) reconcileReadRef.current(nodeId, executions, read);
    return executions;
  }, [graph.id]);
  const executionReader = useMemo(() => ({ graphId: graph.id, read: readExecutions }), [graph.id, readExecutions]);
  const updateCanvasSettings = (next: SpaceCanvasSettings) => { setCanvasSettings(next); window.localStorage.setItem("node-studio.canvas-settings", JSON.stringify(next)); };
  useEffect(() => {
    const ids = unsubmittedResultIds(graph);
    if (session.getSnapshot().writable && ids.length) updateDraft(bindResultNodes(session.getDocument(), ids, null, "cancelled"));
    // Only the mount snapshot can contain an abandoned, unreceipted reservation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.id]);
  const draftNodeIds = useStore(session.store, useShallow(state => state.document.nodes
    .filter(node => { const mode = findNodeDefinition(node.kind)?.executionMode; return state.persistedNodeIds.has(node.id) && mode && mode !== "none"; })
    .map(node => node.id)));
  const executionQueries = useQueries({
    queries: draftNodeIds.map((nodeId) => ({
      queryKey: nodeExecutionKeys.list(graph.id, nodeId),
      queryFn: ({ signal }: { signal: AbortSignal }) => readExecutions(nodeId, signal),
      refetchInterval: (query: { state: { data?: NodeExecutionDto[]; status: string } }) =>
        query.state.data?.some((execution) => execution.executionKind === "assistant" && activeExecution(execution))
          ? 2_000 : nodeExecutionRefetchInterval(query.state.status === "error" ? undefined : query.state.data, eventChannelState),
      staleTime: 0,
    })),
    combine: executionData,
  });
  const executionByNodeId = useMemo(
    () => new Map<string, NodeExecutionDto[]>(
      draftNodeIds.map((nodeId, index) => [nodeId, executionQueries[index] ?? noExecutions]),
    ),
    [draftNodeIds, executionQueries],
  );
  const assistantResults = useMemo(() => Object.fromEntries(
    [...executionByNodeId].flatMap(([nodeId, executions]) => {
      const completed = executions.find((execution) => execution.executionKind === "assistant" && execution.status === "completed" && execution.outputText);
      return completed?.outputText ? [[nodeId, assistantTextResult(completed.outputText, completed.outputItems, completed.selectedItemId ?? null)]] : [];
    }),
  ), [executionByNodeId]);
  const mediaOutputs = useMemo(() => Object.fromEntries(draft.nodes.map(node => {
    const selected = (executionByNodeId.get(node.id) ?? []).find(execution =>
      execution.status === "completed" && node.selectedOutputAssetId &&
      execution.outputAssetIds.includes(node.selectedOutputAssetId));
    const explicitlyCleared = node.selectedOutputAssetId === null &&
      graph.nodes.find(original => original.id === node.id)?.selectedOutputAssetId != null;
    return [node.id, explicitlyCleared ? [] : selected?.outputBindings?.length ? selected.outputBindings :
      (graph.outputBindings ?? []).filter(binding => binding.graphNodeId === node.id).map(({ portId, sortOrder, assetId }) => ({ portId, sortOrder, assetId }))];
  })), [draft.nodes, executionByNodeId, graph.nodes, graph.outputBindings]);
  const inputRuntime = useMemo(() => ({ assistantResults, mediaOutputs: new Map(Object.entries(mediaOutputs)) }), [assistantResults, mediaOutputs]);
  useEffect(() => {
    for (const [nodeId, executions] of executionByNodeId) {
      const execution = executions[0];
      if (execution) session.patchRuntime(nodeId, { execution });
    }
    for (const [nodeId, progress] of Object.entries(repeatProgress)) session.patchRuntime(nodeId, { repeatProgress: progress });
  }, [session, executionByNodeId, repeatProgress]);
  const handleCancelNode = useCallback(async (nodeId: string) => {
    if (!session.getSnapshot().writable) return;
    try {
      // Explicit user recovery also works after a reload. Never infer that a
      // discovered active record is abandoned; another tab may still own it.
      const owned = operationControllers.get(nodeId);
      if (owned) cancelledSubmissions.add(owned);
      owned?.abort();
      // A just-accepted receipt is authoritative even while history is offline.
      // After re-entry, recover the active ID from cache or a fresh server read.
      const known = acceptedExecutionIds.get(nodeId) ?? queryClient.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graph.id, nodeId))?.find(activeExecution)?.executionId;
      if (owned && !known) return; // A late admission cancels itself once its receipt arrives.
      const executionId = known ?? (await listNodeExecutions(graph.id, nodeId)).find(activeExecution)?.executionId;
      if (executionId) await cancelNodeExecution(graph.id, nodeId, executionId);
      operationControllers.get(nodeId)?.abort();
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
    } catch (error) {
      reportError(error instanceof Error ? error : new Error("CANCEL_FAILED"));
    }
  }, [session, graph.id, operationControllers, acceptedExecutionIds, cancelledSubmissions, queryClient, reportError]);
  reconcileReadRef.current = (nodeId, executions, read) => {
    const accepted = acceptedExecutionIds.get(nodeId);
    if (executions.some(execution => execution.executionId === accepted && !activeExecution(execution))) acceptedExecutionIds.delete(nodeId);
    const node = session.getDocument().nodes.find(candidate => candidate.id === nodeId);
    if (!node) return;
    try {
      for (const execution of executions) {
        const next = reconcileResultNodes(session.getDocument(), nodeId, execution);
        if (next !== session.getDocument()) updateDraft(next);
      }
    } catch (error) { reportError(error, "results:" + nodeId + ":" + executions.map(item => item.executionId).join(",")); }
    const decision = selectionTracker.current.observe(nodeId, executions, read, node.selectedOutputAssetId);
    if (decision.preserve) preserveSelectionRef.current?.(nodeId);
    if (decision.selection !== undefined && decision.selection !== node.selectedOutputAssetId) {
      updateDraft({ ...session.getDocument(), nodes: session.getDocument().nodes.map(candidate => candidate.id === nodeId
        ? { ...candidate, selectedOutputAssetId: decision.selection! } : candidate) });
    }
  };

  const handleRegenerateNode = useCallback(async (nodeId: string) => {
    if (!session.getSnapshot().writable) throw new Error("WORKFLOW_READ_ONLY");
    const node = session.getDocument().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error("SPACE_NODE_NOT_FOUND");
    if (isUnavailableEditNodeKind(node.kind) || !findNodeDefinition(node.kind) || findNodeDefinition(node.kind)?.executionMode === "none") throw new Error("NODE_NOT_EXECUTABLE");
    if (operationControllers.has(nodeId)) throw new Error("NODE_GENERATION_ACTIVE");
    const repeatCount = node.kind === "generate.image" ? Number(record(node.config).repeatCount ?? 1) : 1;
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 100) throw new Error("INVALID_REPEAT_COUNT");
    const identity = generationInputIdentity(session.getDocument(), nodeId);
    const assertCurrent = () => {
      controller.signal.throwIfAborted();
      if (!writableRef.current || generationInputIdentity(session.getDocument(), nodeId) !== identity) throw new DOMException("Inputs changed", "AbortError");
    };
    const controller = new AbortController();
    operationControllers.set(nodeId, controller);
    session.patchRuntime(nodeId, { submissionPending: true });
    if (repeatCount > 1) repeatInputs.current.set(nodeId, identity);
    const selectionRevision = selectionTracker.current.selectionRevision(nodeId);
    selectionTracker.current.beginSubmission(nodeId, selectionRevision);
    let serverAccepted = false;
    let resultIds: string[] = [];
    const resultGroups: string[][] = [];
    const stopUnsubmitted = (state: "failed" | "cancelled") => {
      const ids = unsubmittedResultIds(session.getDocument(), resultGroups.flat());
      if (ids.length) updateDraft(bindResultNodes(session.getDocument(), ids, null, state));
    };
    try {
      const reserved = reserveResultNodes(session.getDocument(), nodeId, repeatCount);
      resultGroups.push(...reserved.groups);
      resultIds = resultGroups[0] ?? [];
      session.patchRuntime(nodeId, { resultReservationIds: resultGroups.flat() });
      if (reserved.draft !== session.getDocument()) updateDraft(reserved.draft);
      const expectedGraphVersion = await prepareExecution();
      assertCurrent();
      const execution = await startExecution.mutateAsync({
        graphId: graph.id,
        nodeId,
        expectedGraphVersion,
      });
      acceptedExecutionIds.set(nodeId, execution.executionId);
      if (resultIds.length) { updateDraft(bindResultNodes(session.getDocument(), resultIds, execution.executionId)); await autosaveSaveNowRef.current(); }
      if (cancelledSubmissions.has(controller)) {
        await cancelNodeExecution(graph.id, nodeId, execution.executionId);
        controller.signal.throwIfAborted();
      }
      selectionTracker.current.submitted(nodeId, execution.executionId);
      const plan = execution.plan;
      if (!plan) {
        // Acceptance returns immediately. The host scheduler awaits this
        // observation separately; query reconciliation owns result selection.
        const completion = (async () => {
          let currentExecution = execution;
          let completedCount = 0, failed = 0;
          let firstError: unknown;
          const publishProgress = (running: boolean) => {
            if (observingRef.current && repeatCount > 1) setRepeatProgress(previous => ({ ...previous,
              [nodeId]: { completed: completedCount, failed, total: repeatCount, running } }));
          };
          publishProgress(true);
          try {
            for (let index = 0; index < repeatCount; index++) {
              assertCurrent();
              if (index > 0) {
                resultIds = resultGroups[index];
                const version = await prepareExecution();
                assertCurrent();
                selectionTracker.current.beginSubmission(nodeId, selectionRevision);
                currentExecution = await startExecution.mutateAsync({ graphId: graph.id, nodeId,
                  expectedGraphVersion: version, repeat: { repeatOfExecutionId: execution.executionId, repeatIndex: index } });
                acceptedExecutionIds.set(nodeId, currentExecution.executionId);
                if (resultIds.length) { updateDraft(bindResultNodes(session.getDocument(), resultIds, currentExecution.executionId)); await autosaveSaveNowRef.current(); }
                if (cancelledSubmissions.has(controller)) {
                  await cancelNodeExecution(graph.id, nodeId, currentExecution.executionId);
                  controller.signal.throwIfAborted();
                }
                selectionTracker.current.submitted(nodeId, currentExecution.executionId);
              }
              try {
                const completed = await observeServerExecution(queryClient, graph.id, nodeId, currentExecution.executionId, controller.signal);
                assertCurrent();
                updateDraft(reconcileResultNodes(session.getDocument(), nodeId, completed));
                const assets = await Promise.all(completed.outputAssetIds.map(assetId => queryClient.fetchQuery({
                  queryKey: mediaAssetKeys.detail(assetId),
                  queryFn: ({ signal }) => getMediaAsset(assetId, AbortSignal.any([signal, controller.signal])), retry: 3,
                })));
                assertCurrent();
                for (const asset of assets) queryClient.setQueryData(mediaAssetKeys.detail(asset.id), asset);
                void queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
                await autosaveSaveNowRef.current();
              } catch (error) {
                assertCurrent();
                const terminal = queryClient.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graph.id, nodeId))?.find(item => item.executionId === currentExecution.executionId);
                // Unknown outcomes cannot be treated as a failed iteration.
                if (terminal?.status !== "failed") throw error;
                updateDraft(reconcileResultNodes(session.getDocument(), nodeId, terminal));
                failed++; firstError ??= error;
              }
              completedCount++;
              publishProgress(true);
            }
            if (failed === repeatCount) throw firstError;
          } catch (error) {
            stopUnsubmitted(controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? "cancelled" : "failed");
            // Save stopped reservations as well as accepted receipts. Accepted
            // runs stay pending until the server supplies their actual outcome.
            void autosaveSaveNowRef.current().catch(() => {});
            throw error;
          } finally {
            publishProgress(false);
            repeatInputs.current.delete(nodeId);
            selectionTracker.current.endSubmission(nodeId);
            if (operationControllers.get(nodeId) === controller) operationControllers.delete(nodeId);
            if (observingRef.current) session.patchRuntime(nodeId, { submissionPending: false, resultReservationIds: undefined });
          }
        })();
        // Observation can outlive a detached UI callback. Always consume errors.
        void completion.catch(error => {
          if (observingRef.current && !controller.signal.aborted) reportError(error instanceof Error ? error : new Error("GENERATION_FAILED"));
        });
        serverAccepted = true;
        return { executionId: execution.executionId, completion };
      }

      const input = { graphId: graph.id, nodeId, execution, signal: controller.signal };
      if (plan.kind !== "edit.image.resize") throw new Error("BROWSER_EXECUTION_PLAN_UNSUPPORTED");
      const assets = await runBrowserImageOperation(input);
      for (const asset of assets) queryClient.setQueryData(mediaAssetKeys.detail(asset.id), asset);
      await queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
      const completed = queryClient.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graph.id, nodeId))?.find(item => item.executionId === execution.executionId);
      updateDraft(reconcileResultNodes(session.getDocument(), nodeId, completed ?? { executionId: execution.executionId, status: "completed", outputAssetIds: assets.map(asset => asset.id) }));
      await autosaveSaveNowRef.current();
      const selectedOutputAssetId = assets[0]?.id;
      return selectedOutputAssetId ? { selectedOutputAssetId } : undefined;
    } catch (error) {
      stopUnsubmitted(controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? "cancelled" : "failed");
      if (resultGroups.length) void autosaveSaveNowRef.current().catch(() => {});
      throw error;
    } finally {
      selectionTracker.current.endSubmission(nodeId);
      if (!serverAccepted) {
        repeatInputs.current.delete(nodeId);
        controller.abort();
        if (operationControllers.get(nodeId) === controller) operationControllers.delete(nodeId);
        if (observingRef.current) session.patchRuntime(nodeId, { submissionPending: false, resultReservationIds: undefined });
      }
      void queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, nodeId) });
    }
  }, [session, graph.id, operationControllers, acceptedExecutionIds, cancelledSubmissions, prepareExecution, queryClient, startExecution, updateDraft, reportError]);

  const services = useMemo<SpaceEditorServices>(() => ({ runNode: handleRegenerateNode, cancelNode: handleCancelNode,
    prepareNodeExecution: prepareExecution, onError: reportError }), [handleRegenerateNode, handleCancelNode, prepareExecution, reportError]);
  const busy = autosave.status === "dirty" || autosave.status === "saving";
  const tHost = useTranslations("nodeStudio.host");
  const saveLabel = {
    saved: tHost("saved"),
    dirty: tHost("dirty"),
    saving: tHost("saving"),
    error: tHost("saveError"),
    conflict: tHost("conflict"),
  }[autosave.status];
  const commentNodes = useMemo(() => {
    return draft.nodes.map((node) => ({
      id: node.id, position: node.position,
      data: { comment: typeof record(record(node.config).presentation).comment === "string" ? record(record(node.config).presentation).comment as string : undefined },
    }));
  }, [draft.nodes]);
  const comments = useSpaceCommentsSession(graph.id, commentNodes);
  const headerModels = useMemo(() => [
    ...nodeCatalog.imageModels.map((model) => ({ id: model.key, name: model.label, provider: model.provider, mediaKind: "image" as const })),
    ...nodeCatalog.videoModels.map((model) => ({ id: model.key, name: model.label, provider: model.provider, mediaKind: "video" as const })),
    ...nodeCatalog.audioModels.map((model) => ({ id: model.key, name: model.label, provider: model.provider, mediaKind: "audio" as const })),
  ], [nodeCatalog]);
  const nodeDefaults = useMemo(() => Object.fromEntries(Object.entries(preferences.data?.defaults ?? {}).map(([kind, value]) => [kind, value.modelKey])), [preferences.data?.defaults]);
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
      data-space-workspace=""
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && !target.closest('[data-canvas-action="comments"], [data-canvas-action="next-comment"], [data-canvas-action="previous-comment"]')) comments.clearFocus();
      }}
    >
      <SpaceWorkspaceHeader
        commentsNavigation={<SpaceCommentsNavigationIcon count={comments.count} unreadCount={comments.unreadCount} onNavigate={comments.navigateFirst} />}
        hasUnsavedChanges={autosave.status !== "saved"}
        models={headerModels}
        renderModelPicker={(kind, select, close) => <SpaceModelBrowser open onOpenChange={open => { if (!open) close(); }}
          title={`Default ${kind[0].toUpperCase()}${kind.slice(1)} Model`} initialType={kind}
          models={kind === "image" ? nodeCatalog.imageModels : kind === "video" ? nodeCatalog.videoModels : nodeCatalog.audioModels}
          loading={nodeCatalog.isLoading} error={nodeCatalog.error} recentKeys={preferences.data?.recentModelKeys}
          selectedKey={nodeDefaults[kind]} onRefresh={nodeCatalog.refresh}
          onSelect={key => { preferences.trackModel(key); select(key); close(); }} />}
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
        writable={writable}
        creating={creating || leaving}
        deleting={busy || deleting}
        canvasSettings={canvasSettings}
        onCanvasSettingsChange={updateCanvasSettings}
        onTitleChange={(nextTitle) => {
          setTitle(nextTitle);
          if (nextTitle.trim()) session.dispatch({ type: "title.set", title: nextTitle.trim() });
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

        <NodeExecutionReadContext.Provider value={executionReader}>
          <NodeStudio session={session} catalog={nodeCatalog} inputRuntime={inputRuntime} canvasSettings={canvasSettings} services={services} />
        </NodeExecutionReadContext.Provider>


      {quickstartOpen && onCreatePreset && <SpaceQuickstart onClose={() => setQuickstartOpen(false)}
        onCreate={async (workflow, tutorial) => { await autosave.saveNow(); await onCreatePreset(workflow, tutorial); }}
        onBrowse={() => { setQuickstartOpen(false); if (onBack) void leaveAfterSaving(onBack); }} />}
      {tutorialActive && onTutorialClose && <SpaceTutorial onClose={onTutorialClose}
        nodes={draft.nodes} edges={draft.edges} />}
      <SpaceConfirmDialog
        open={leaveOpen}
        title={tHost("leaveTitle")}
        description={tHost("leaveDescription")}
        confirmLabel={tHost("leaveConfirm")}
        danger
        onCancel={() => { setLeaveOpen(false); pendingLeaveAction.current = null; }}
        onConfirm={() => { setLeaveOpen(false); const action = pendingLeaveAction.current; pendingLeaveAction.current = null; action?.(); }}
      />
      <SpaceConfirmDialog
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

      <SpaceConfirmDialog
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
