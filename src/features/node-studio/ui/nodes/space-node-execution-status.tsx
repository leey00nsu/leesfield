"use client";

import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { ExecutionTime } from "@/shared/ui/execution-time";
import { nodeExecutionKeys } from "../../hook/use-node-executions";
import { resultGalleryItems, resultSource } from "../../model/generation-result-nodes";
import type { NodeExecutionDto, NodeExecutionStatus } from "../../model/node-execution-types";
import type { SpaceNodeRuntime } from "../../model/space-editor-types";
import { useSpaceSelector } from "../space-editor-provider";
import { isDirectEditPort } from "@/shared/media-assets/direct-media-edit";

export interface SpaceNodeExecutionState {
  execution?: NodeExecutionDto;
  active: boolean;
  status?: NodeExecutionStatus;
  repeatProgress?: SpaceNodeRuntime["repeatProgress"];
}

const isActive = (status: NodeExecutionStatus | undefined) => status === "pending" || status === "processing" || status === "uploading";
const validDate = (value: string | null | undefined) => Boolean(value && Number.isFinite(Date.parse(value)));
const emptySnapshot = () => undefined;

/** SSE and history can lead one another; a terminal record wins for the same run. */
function resolveExecution(runtime: NodeExecutionDto | undefined, cached: NodeExecutionDto | undefined) {
  if (!runtime) return cached;
  if (!cached) return runtime;
  if (runtime.executionId !== cached.executionId) {
    return Date.parse(cached.createdAt) > Date.parse(runtime.createdAt) ? cached : runtime;
  }
  if (isActive(runtime.status) !== isActive(cached.status)) return isActive(runtime.status) ? cached : runtime;
  return !validDate(runtime.finishedAt) && validDate(cached.finishedAt) ? cached : runtime;
}

/** Observes existing data only: no query observer, fetch, invalidation, or new QueryClient. */
function useCachedExecution(graphId: string, producerId: string | undefined, executionId: string | null | undefined) {
  const client = useContext(QueryClientContext);
  // undefined means the producer's latest run; null means an unbound result, never "latest".
  const key = useMemo(() => client && producerId && executionId !== null
    ? nodeExecutionKeys.list(graphId, producerId) : undefined, [client, graphId, producerId, executionId]);
  const snapshot = useCallback(() => {
    if (!client || !key) return undefined;
    const records = client.getQueryData<readonly NodeExecutionDto[]>(key);
    let selected: NodeExecutionDto | undefined;
    for (const row of records ?? []) {
      if (row.graphNodeId !== producerId) continue;
      if (executionId !== undefined) {
        if (row.executionId === executionId) return row;
      } else if (!selected || Date.parse(row.createdAt) > Date.parse(selected.createdAt)) selected = row;
    }
    return selected;
  }, [client, key, producerId, executionId]);
  const subscribe = useCallback((notify: () => void) => {
    if (!client || !key) return () => {};
    return client.getQueryCache().subscribe(event => {
      const changed = event.query.queryKey;
      if (changed.length === key.length && key.every((part, index) => changed[index] === part)) notify();
    });
  }, [client, key]);
  // Returning the selected record, rather than the history array, also isolates
  // older result Inputs from later runs added to this producer's history.
  return useSyncExternalStore(subscribe, snapshot, emptySnapshot);
}

export function useSpaceNodeExecutionState(node: CanonicalNode | undefined, runtime: SpaceNodeRuntime | undefined): SpaceNodeExecutionState {
  const graphId = useSpaceSelector(state => state.id);
  const gallery = node?.configVersion === 1 && node.kind === "output.gallery" ? resultGalleryItems(node.config) : null;
  const pending = gallery?.filter(item => item.state === "pending");
  const galleryStatus = gallery?.length ? pending?.length ? "pending" : gallery.some(item => item.state === "completed") ? "completed"
    : gallery.some(item => item.state === "failed") ? "failed" : "cancelled" : undefined;
  const source = node?.configVersion === 1 && ["input.image", "input.audio", "input.video"].includes(node.kind) ? resultSource(node.config)
    : pending?.[0] ?? gallery?.at(-1) ?? null;
  const direct = Boolean(source && isDirectEditPort(source.portId));
  const producerId = direct ? node?.id : source?.nodeId || (node && (node.kind.startsWith("generate.") || node.kind.startsWith("edit.")) ? node.id : undefined);
  const boundId = source ? typeof source.executionId === "string" && source.executionId ? source.executionId : null : undefined;
  const relatedRuntime = useSpaceSelector(state => {
    if (!source || !boundId) return undefined;
    const execution = state.runtimeByNode.get(source.nodeId)?.execution;
    return execution?.executionId === boundId && execution.graphNodeId === source.nodeId ? execution : undefined;
  });
  const candidate = direct ? runtime?.execution : source ? relatedRuntime : runtime?.execution;
  const ownExecution = candidate && candidate.graphNodeId === producerId && (!source || candidate.executionId === boundId) ? candidate : undefined;
  const cached = useCachedExecution(graphId, producerId, boundId);
  const observedExecution = resolveExecution(ownExecution, cached);
  // A batch spans several executions. One iteration's duration is not the total batch time.
  const execution = gallery && new Set(gallery.map(item => item.executionId).filter(Boolean)).size > 1 ? undefined : observedExecution;
  const resultCount = gallery?.length ?? 0;
  const pendingCount = pending?.length ?? 0;
  const failedCount = gallery?.filter(item => item.state === "failed").length ?? 0;
  const hasSource = Boolean(source);
  const runtimeProgress = runtime?.repeatProgress;
  const repeatProgress = resultCount ? {
    completed: resultCount - pendingCount,
    failed: failedCount,
    total: resultCount,
    running: pendingCount > 0,
  } : hasSource ? undefined : runtimeProgress;
  const locallyActive = !source && Boolean(runtime?.submissionPending || repeatProgress?.running);
  // A terminal result binding is durable. A missing output slot may fail even
  // when its producer completed, and stale active runtime must not restart it.
  const boundStatus = source && ["completed", "failed", "cancelled"].includes(source.state) ? source.state : undefined;
  const status: NodeExecutionStatus | undefined = galleryStatus ?? boundStatus ?? (locallyActive && !isActive(execution?.status)
    ? repeatProgress?.running ? "processing" : "pending" : execution?.status ?? (source?.state === "pending" ? "pending" : undefined));
  const active = locallyActive || isActive(status);
  return { execution, active, status, repeatProgress };
}

/** Frame supplies the one resolved state used by both its ring and its footer. */
export function SpaceNodeExecutionStatus({ state }: { state: SpaceNodeExecutionState }) {
  const t = useTranslations("nodeStudio.execution");
  const { execution, status, repeatProgress } = state;
  if (!status) return null;
  // Never tick an older completion while a new submission/repeat is starting.
  const timed = execution && (!isActive(status) || isActive(execution.status));
  return <div role="status" aria-live="polite" data-space-node-execution-status={status}
    className="flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden">
    <span className="min-w-0 truncate">{t(`status.${status}`)}{repeatProgress && <> · {repeatProgress.completed}/{repeatProgress.total}</>}</span>
    {timed && <ExecutionTime {...execution} status={status} className="shrink-0 tabular-nums" />}
  </div>;
}
