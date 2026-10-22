import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { supportsVideoCaptureOutput, videoCaptureOutputPortId } from "@/shared/generation-graph/node-registry";
import { appendCapturedFrameResult, resultSource } from "./generation-result-nodes";
import { spaceOutputConnection } from "./space-editor-output";
import type { SpaceInputExpectation, SpaceInputMediaOptions } from "./space-editor-media";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { CapturedVideoFrame } from "../lib/space-video-capture";

type CaptureOptions = SpaceInputMediaOptions & {
  captureSource: (nodeId: string) => SpaceInputExpectation | null;
  matchesSource: (expected: SpaceInputExpectation | null | undefined, nodeId: string) => boolean;
};
type CaptureJob = {
  sourceId: string; resultId: string; edgeId: string; assetId: string; graphId: string;
  controller: AbortController; expected?: SpaceInputExpectation; starting: boolean;
};

/** Browser work belongs to the Space, not the selection toolbar's lifetime. */
export function createSpaceVideoCaptureController(options: CaptureOptions) {
  const { session, inputs } = options, jobs = new Map<string, CaptureJob>();
  let stop: (() => void) | null = null, stopped = false, synchronizing = false, recoveryScheduled = false;
  const displayedVideo = (node: CanonicalNode | undefined) => {
    if (node?.kind === "input.video") return inputs.sourceAssetIds(node.id, "video")[0];
    const source = node?.kind === "output.single" ? spaceOutputConnection(node, inputs) : null;
    return source?.type === "video" ? source.assetId : undefined;
  };
  const pendingResult = (node: CanonicalNode | undefined, sourceId?: string) => {
    const binding = resultSource(node?.config);
    return node?.kind === "input.image" && binding?.portId === videoCaptureOutputPortId && binding.executionId === null
      && binding.state === "pending" && (!sourceId || binding.nodeId === sourceId);
  };
  const owns = (job: CaptureJob) => jobs.get(job.resultId) === job;
  const valid = (job: CaptureJob) => {
    const state = session.getSnapshot(), edge = state.document.edges.find(edge => edge.id === job.edgeId);
    return owns(job) && !job.controller.signal.aborted && !state.disposed && state.writable && state.id === job.graphId
      && options.matchesSource(job.expected, job.sourceId) && displayedVideo(state.nodeById.get(job.sourceId)) === job.assetId
      && pendingResult(state.nodeById.get(job.resultId), job.sourceId)
      && edge?.sourceNodeId === job.sourceId && edge.sourcePortId === videoCaptureOutputPortId
      && edge.targetNodeId === job.resultId && edge.targetPortId === "reference";
  };
  const updateResult = (job: CaptureJob, status: "completed" | "failed" | "cancelled", asset?: MediaAssetDto) => {
    const state = session.getSnapshot();
    if (state.disposed || state.id !== job.graphId || !pendingResult(state.nodeById.get(job.resultId), job.sourceId)) return false;
    const result = session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => node.id === job.resultId
      ? { ...node, config: { ...(node.config as Record<string, unknown>), ...(asset ? { assetId: asset.id } : {}),
        resultSource: { ...resultSource(node.config)!, state: status } } as CanonicalNode["config"] } : node) }));
    return result.ok;
  };
  const release = (job: CaptureJob) => {
    if (!owns(job)) return;
    jobs.delete(job.resultId);
    job.controller.abort();
    const state = session.getSnapshot(), runtime = state.runtimeByNode.get(job.sourceId);
    if (!state.disposed && state.id === job.graphId && runtime?.resultReservationIds?.includes(job.resultId))
      session.patchRuntime(job.sourceId, { submissionPending: false, resultReservationIds: undefined });
  };
  const cancel = (job: CaptureJob, settle = true) => {
    if (!owns(job)) return;
    if (settle && !synchronizing) updateResult(job, "cancelled");
    release(job);
    if (settle && synchronizing) recoverOrphans();
  };
  const recoverOrphans = () => {
    if (recoveryScheduled) return;
    recoveryScheduled = true;
    // Store subscribers run before their transaction publishes its durable event.
    // Publish recovery afterward so autosave cannot finish with the stale pending graph.
    queueMicrotask(() => {
      recoveryScheduled = false;
      if (stopped || session.getSnapshot().disposed) return;
      const orphanIds = new Set(session.getDocument().nodes.filter(node => pendingResult(node) && !jobs.has(node.id)).map(node => node.id));
      if (orphanIds.size) session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => orphanIds.has(node.id)
        ? { ...node, config: { ...(node.config as Record<string, unknown>), resultSource: { ...resultSource(node.config)!, state: "cancelled" } } as CanonicalNode["config"] } : node) }));
    });
  };
  const synchronize = () => {
    if (synchronizing || stopped) return;
    synchronizing = true;
    try {
      for (const job of [...jobs.values()]) if (!job.starting && !valid(job)) cancel(job);
      // Undo/redo and reopened browser reservations cannot restart abandoned work.
      recoverOrphans();
    } finally { synchronizing = false; }
  };
  return {
    async capture(sourceId: string, assetId: string, makeFile: (signal: AbortSignal) => Promise<CapturedVideoFrame>): Promise<boolean> {
      const state = session.getSnapshot(), source = state.nodeById.get(sourceId);
      if (stopped || !source || !supportsVideoCaptureOutput(source.kind) || !options.captureSource(sourceId)
        || state.runtimeByNode.get(sourceId)?.submissionPending || state.runtimeByNode.get(sourceId)?.uploadProgress !== undefined
        || displayedVideo(source) !== assetId || [...jobs.values()].some(job => job.sourceId === sourceId)) return false;
      const appended = appendCapturedFrameResult(session.getDocument(), sourceId);
      const resultId = appended.ids[0], edgeId = appended.draft.edges.at(-1)!.id;
      const job: CaptureJob = { sourceId, resultId, edgeId, assetId, graphId: state.id, controller: new AbortController(), starting: true };
      jobs.set(resultId, job);
      const reserved = session.transact(() => appended.draft, { origin: "user", label: "video.capture", selectionNodeIds: [resultId] });
      if (!reserved.ok) { release(job); throw new Error(reserved.message); }
      job.expected = options.captureSource(sourceId) ?? undefined;
      session.patchRuntime(sourceId, { submissionPending: true, resultReservationIds: [resultId] });
      session.select([resultId]);
      job.starting = false;
      const timeout = setTimeout(() => { cancel(job); }, 180_000);
      try {
        if (!valid(job)) { cancel(job); return false; }
        const { file, timestampMs } = await makeFile(job.controller.signal);
        if (!valid(job)) return false;
        if (file.type !== "image/png") throw new Error("CAPTURE_FILE_INVALID");
        const asset = await options.upload(file, "image", job.controller.signal,
          { graphId: job.graphId, sourceAssetId: job.assetId, timestampMs });
        if (!valid(job)) return false;
        if (asset.type !== "image" || asset.status !== "completed" || asset.mimeType !== "image/png" || !/^[A-Za-z0-9_-]{1,128}$/.test(asset.id)) throw new Error("CAPTURE_ASSET_INVALID");
        options.rememberAsset?.(asset);
        return updateResult(job, "completed", asset);
      } catch (error) {
        if (!valid(job)) return false;
        updateResult(job, "failed");
        throw error;
      } finally {
        clearTimeout(timeout);
        // A service that ignores abort must never leave an orphaned spinner.
        if (owns(job) && pendingResult(session.getSnapshot().nodeById.get(resultId), sourceId)) updateResult(job, "cancelled");
        release(job);
      }
    },
    start() {
      stopped = false;
      if (!stop) stop = session.store.subscribe((state, previous) => {
        if (state.document !== previous.document || state.writable !== previous.writable || state.disposed !== previous.disposed
          || state.id !== previous.id || (state.revision === 0 && state.history !== previous.history)) synchronize();
      });
      synchronize();
    },
    dispose() {
      stopped = true; stop?.(); stop = null;
      for (const job of [...jobs.values()]) cancel(job);
    },
  };
}
