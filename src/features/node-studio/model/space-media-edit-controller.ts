import { createStore } from "zustand/vanilla";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { editMediaType, editOutputPort, isDirectEditPort, normalizeCrop, type DirectEdit, type DirectEditDto } from "@/shared/media-assets/direct-media-edit";
import type { SpaceEditorSession } from "./space-editor-store";
import { SpaceInputResolver } from "./space-editor-inputs";
import { spaceOutputSource } from "./space-editor-output";
import { appendResultNodes, resultSource } from "./generation-result-nodes";
import type { directMediaEditApi } from "../api/direct-media-edit-api";
import { minimumTrimMs } from "./media-trim-range";

export type MediaEditDraft = { nodeId: string; asset: MediaAssetDto; edit: DirectEdit; epoch: number; revision: number; preset: string };
type Options = {
  session: SpaceEditorSession; api: typeof directMediaEditApi; prepare: () => Promise<number>;
  epoch: () => number; revision: (nodeId: string) => number; asset: (id: string) => MediaAssetDto | undefined;
  onError?: (error: Error) => void; onComplete?: (assetId: string) => void;
  pollMs?: number;
};
type Job = { id: string; graphId: string; sourceId: string; resultId: string; edgeId: string; assetId: string;
  epoch: number; revision: number; sourceVersion?: number; controller: AbortController; timer?: ReturnType<typeof setTimeout>; starting: boolean };

export function createSpaceMediaEditController(options: Options) {
  const { session } = options, jobs = new Map<string, Job>(), retired = new Set<string>();
  const store = createStore<{ draft: MediaEditDraft | null }>(() => ({ draft: null }));
  let stop: (() => void) | undefined, disposed = false, synchronizing = false;
  const sourceAsset = (nodeId: string) => {
    const state = session.getSnapshot(), node = state.nodeById.get(nodeId);
    if (!node) return null;
    const inputs = new SpaceInputResolver(state.document);
    return node.kind === "input.image" || node.kind === "input.video" ? inputs.sourceAssetIds(nodeId, node.kind.slice(6))[0] ?? null
      : node.kind === "output.single" ? spaceOutputSource(node, inputs)?.assetId ?? null : null;
  };
  const draftValid = (d: MediaEditDraft) => {
    const state = session.getSnapshot();
    return !disposed && !state.disposed && state.writable && options.epoch() === d.epoch && options.revision(d.nodeId) === d.revision
      && state.selectedNodeIds.length === 1 && state.selectedNodeIds[0] === d.nodeId && sourceAsset(d.nodeId) === d.asset.id;
  };
  const jobValid = (j: Job) => {
    const state = session.getSnapshot(), result = state.nodeById.get(j.resultId), binding = resultSource(result?.config);
    const currentAsset = options.asset(j.assetId);
    return !disposed && !state.disposed && state.id === j.graphId && state.writable && options.epoch() === j.epoch
      && options.revision(j.sourceId) === j.revision && sourceAsset(j.sourceId) === j.assetId
      && (!j.sourceVersion || !currentAsset || currentAsset.version === j.sourceVersion)
      && binding?.executionId === j.id && binding.state === "pending"
      && state.document.edges.some(e => e.id === j.edgeId && e.targetNodeId === j.resultId && !e.hasPause);
  };
  const update = (j: Job, status: "completed" | "failed" | "cancelled", assetId?: string) => {
    const state = session.getSnapshot();
    if (state.disposed || state.id !== j.graphId) return;
    const starting = j.starting; j.starting = true;
    session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => {
      const binding = resultSource(node.config);
      if (node.id !== j.resultId || binding?.executionId !== j.id || binding.state !== "pending") return node;
      return { ...node, config: { ...(node.config as Record<string, never>), ...(assetId ? { assetId } : {}), resultSource: { ...binding, state: status } } };
    }) }));
    j.starting = starting;
  };
  const release = (j: Job) => {
    jobs.delete(j.id); retired.add(j.id); clearTimeout(j.timer); j.controller.abort();
    if (!session.getSnapshot().disposed) {
      session.patchRuntime(j.resultId, { submissionPending: false });
      if (session.getSnapshot().runtimeByNode.get(j.sourceId)?.resultReservationIds?.includes(j.resultId))
        session.patchRuntime(j.sourceId, { submissionPending: false, resultReservationIds: undefined });
    }
  };
  const cancel = (j: Job) => {
    if (jobs.get(j.id) !== j) return;
    update(j, "cancelled"); release(j);
    void options.api.cancel(j.graphId, j.sourceId, j.id).catch(() => undefined);
  };
  const apply = (j: Job, operation: DirectEditDto) => {
    if (!jobValid(j) || operation.id !== j.id || operation.resultNodeId !== j.resultId || operation.sourceAssetId !== j.assetId || operation.sourceNodeId !== j.sourceId) {
      cancel(j); return;
    }
    session.patchRuntime(j.resultId, { submissionPending: false, execution: {
      executionId: operation.id, executionKind: "media_operation", graphNodeId: j.resultId, mediaType: operation.type.includes("image") ? "image" : "video",
      status: operation.status, progress: operation.progress, errorCode: operation.errorCode, modelKey: null,
      outputAssetIds: operation.outputAssetId ? [operation.outputAssetId] : [], createdAt: operation.createdAt, finishedAt: operation.finishedAt,
    } });
    if (["completed", "failed", "cancelled"].includes(operation.status)) {
      if (operation.status === "completed" && operation.outputAssetId) { update(j, "completed", operation.outputAssetId); options.onComplete?.(operation.outputAssetId); }
      else update(j, operation.status === "cancelled" ? "cancelled" : "failed");
      release(j);
    } else schedule(j);
  };
  const observe = async (j: Job) => {
    if (!jobValid(j)) { cancel(j); return; }
    try { apply(j, await options.api.get(j.graphId, j.sourceId, j.id, j.controller.signal)); }
    catch (error) {
      if (jobs.get(j.id) !== j) return;
      if ((error as { status?: number }).status === 404) { update(j, "cancelled"); release(j); }
      else if (jobValid(j)) schedule(j);
    }
  };
  function schedule(j: Job) { if (jobs.get(j.id) === j) { clearTimeout(j.timer); j.timer = setTimeout(() => { void observe(j); }, options.pollMs ?? 1000); } }
  const synchronize = () => {
    if (synchronizing || disposed) return;
    synchronizing = true;
    try {
      const draft = store.getState().draft;
      if (draft && !draftValid(draft)) store.setState({ draft: null });
      for (const j of [...jobs.values()]) if (!j.starting && !jobValid(j)) {
        const node = session.getSnapshot().nodeById.get(j.resultId), binding = resultSource(node?.config);
        if (binding?.executionId === j.id && binding.state !== "pending") {
          const id = (node?.config as { assetId?: string } | undefined)?.assetId;
          if (binding.state === "completed" && id) options.onComplete?.(id);
          release(j);
        } else cancel(j);
      }
      // Only GET existing IDs on re-entry; a saved reservation never starts work.
      const state = session.getSnapshot();
      if (state.disposed || !state.writable) return;
      for (const node of state.document.nodes) {
        const b = resultSource(node.config);
        if (!b || !isDirectEditPort(b.portId) || b.state !== "pending" || !b.executionId || jobs.has(b.executionId)) continue;
        const edge = state.document.edges.find(e => e.targetNodeId === node.id && e.sourceNodeId === b.nodeId && e.sourcePortId === b.portId);
        const id = sourceAsset(b.nodeId);
        const j: Job = { id: b.executionId, graphId: state.id, sourceId: b.nodeId, resultId: node.id,
          edgeId: edge?.id ?? "", assetId: id ?? "", epoch: options.epoch(), revision: options.revision(b.nodeId), controller: new AbortController(), starting: false };
        if (retired.has(j.id) || !id || !edge) { update(j, "cancelled"); continue; }
        jobs.set(j.id, j); schedule(j);
      }
    } finally { synchronizing = false; }
  };
  return {
    store,
    begin(nodeId: string, asset: MediaAssetDto, kind: DirectEdit["kind"]) {
      const state = session.getSnapshot();
      if (disposed || state.disposed || !state.writable || state.selectedNodeIds.length !== 1 || state.selectedNodeIds[0] !== nodeId
        || asset.status !== "completed" || !asset.width || !asset.height || sourceAsset(nodeId) !== asset.id
        || state.runtimeByNode.get(nodeId)?.submissionPending || (kind === "image.crop" ? asset.type !== "image" : asset.type !== "video")) return false;
      let edit: DirectEdit;
      if (kind === "video.trim") {
        if (!asset.durationMs) return false;
        edit = { kind, startMs: 0, endMs: Math.min(asset.durationMs, Math.max(minimumTrimMs, Math.round(asset.durationMs / 3))) };
      } else edit = { kind, rect: normalizeCrop(kind === "image.crop" ? { x: 0, y: 0, width: asset.width, height: asset.height }
        : { x: asset.width * 0.1, y: asset.height * 0.1, width: asset.width * 0.8, height: asset.height * 0.8 }, asset.width, asset.height, kind === "video.crop") };
      store.setState({ draft: { nodeId, asset, edit, epoch: options.epoch(), revision: options.revision(nodeId), preset: "original" } });
      return true;
    },
    change(edit: DirectEdit, preset = "custom") {
      const d = store.getState().draft;
      if (d && draftValid(d) && d.edit.kind === edit.kind) store.setState({ draft: { ...d, edit, preset } });
    },
    close() { store.setState({ draft: null }); },
    async confirm() {
      const d = store.getState().draft;
      if (!d || !draftValid(d)) return false;
      store.setState({ draft: null });
      const id = crypto.randomUUID(), state = session.getSnapshot();
      const appended = appendResultNodes(state.document, d.nodeId, id, [{ portId: editOutputPort(d.edit), type: editMediaType(d.edit), index: 0 }]);
      const j: Job = { id, graphId: state.id, sourceId: d.nodeId, resultId: appended.ids[0], edgeId: appended.draft.edges.at(-1)!.id,
        assetId: d.asset.id, sourceVersion: d.asset.version, epoch: d.epoch, revision: d.revision, controller: new AbortController(), starting: true };
      jobs.set(id, j);
      const reserved = session.transact(() => appended.draft, { origin: "user", label: "media.edit", selectionNodeIds: [j.resultId] });
      if (!reserved.ok) { release(j); throw new Error(reserved.message); }
      j.revision = options.revision(d.nodeId);
      session.patchRuntime(d.nodeId, { submissionPending: true, resultReservationIds: [j.resultId] });
      session.patchRuntime(j.resultId, { submissionPending: true });
      session.select([j.resultId]);
      j.starting = false;
      try {
        const version = await options.prepare();
        if (!jobValid(j)) { cancel(j); return false; }
        const operation = await options.api.start(j.graphId, j.sourceId, { requestId: id, expectedGraphVersion: version, sourceAssetId: j.assetId,
          sourceVersion: d.asset.version, resultNodeId: j.resultId, resultEdgeId: j.edgeId, edit: d.edit });
        if (jobs.get(id) !== j || !jobValid(j)) { void options.api.cancel(j.graphId, j.sourceId, j.id).catch(() => undefined); return false; }
        apply(j, operation); return true;
      } catch (error) {
        if (jobs.get(id) !== j) return false;
        // An interrupted POST is ambiguous. Observe its fixed request ID instead of resubmitting.
        if (!(error as { status?: number }).status) { schedule(j); return true; }
        update(j, "failed"); release(j); options.onError?.(error as Error); return false;
      }
    },
    cancelResult(resultId: string) { for (const j of [...jobs.values()]) if (j.resultId === resultId) cancel(j); },
    start() { disposed = false; if (!stop) stop = session.store.subscribe(synchronize); synchronize(); },
    dispose() { disposed = true; stop?.(); stop = undefined; store.setState({ draft: null }); for (const j of [...jobs.values()]) cancel(j); },
  };
}
export type SpaceMediaEditController = ReturnType<typeof createSpaceMediaEditController>;
