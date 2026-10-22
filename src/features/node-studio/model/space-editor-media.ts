import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import type { VideoCaptureUploadContext } from "@/shared/api/media-upload";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { SpaceEditorSession, SpaceEditorState } from "./space-editor-store";
import type { SpaceInputResolver, SpaceInputRuntime } from "./space-editor-inputs";
import type { SpacePosition } from "./space-editor-command-types";
import type { SpacePortReference } from "./space-editor-types";
import { spaceNodePorts, type SpaceModelCatalog } from "./space-editor-ports";
import { prepareSpacePortMedia } from "./space-editor-media-connections";
import { createSpaceVideoCaptureController } from "./space-video-capture-controller";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const uploadPresence = new WeakMap<SpaceEditorState["runtimeByNode"], boolean>();
/** Shared readiness bit; hover/viewport notifications never rescan all uploads. */
export function hasSpaceMediaUpload(state: Pick<SpaceEditorState, "runtimeByNode">): boolean {
  const existing = uploadPresence.get(state.runtimeByNode);
  if (existing !== undefined) return existing;
  const value = [...state.runtimeByNode.values()].some(runtime => runtime.uploadProgress !== undefined);
  uploadPresence.set(state.runtimeByNode, value);
  return value;
}
export function spaceInputMediaType(node: CanonicalNode | undefined): MediaType | null {
  return node?.kind === "input.image" ? "image" : node?.kind === "input.audio" ? "audio" : node?.kind === "input.video" ? "video" : null;
}
export interface SpaceInputExpectation {
  readonly owner: object;
  readonly epoch: number;
  readonly nodeId: string;
  readonly kind: string;
  readonly inputRevision: number;
  readonly intent: number;
}
export interface SpacePortMediaExpectation {
  readonly target: SpaceInputExpectation;
  readonly port: SpacePortReference;
  readonly type: MediaType;
}
export interface SpaceInputMediaOptions {
  session: SpaceEditorSession;
  inputs: SpaceInputResolver;
  upload: (file: File, type: MediaType, signal: AbortSignal, videoCapture?: VideoCaptureUploadContext) => Promise<MediaAssetDto>;
  rememberAsset?: (asset: MediaAssetDto) => void;
  errorMessage?: (error: unknown) => string;
  onError?: (error: Error) => void;
  createId?: () => string;
  getCatalog?: () => SpaceModelCatalog;
  getInputRuntime?: () => SpaceInputRuntime;
}

/** Owns transfer lifetimes, never a second graph. The scope's input subscription starts first. */
export function createSpaceInputMediaController(options: SpaceInputMediaOptions) {
  const { session, inputs } = options;
  const owner = Object.freeze({}), intents = new Map<string, number>();
  const transfers = new Map<string, { controller: AbortController; expected: SpaceInputExpectation }>();
  let epoch = 0, stop: (() => void) | null = null;
  const activeResult = (node: CanonicalNode) => {
    const source = record(record(node.config).resultSource);
    if (source.state === "pending") return true;
    const execution = typeof source.nodeId === "string" ? session.getSnapshot().runtimeByNode.get(source.nodeId)?.execution : undefined;
    return Boolean(execution && execution.executionId === source.executionId && ["pending", "processing", "uploading"].includes(execution.status));
  };
  const captureNode = (nodeId: string): SpaceInputExpectation | null => {
    const state = session.getSnapshot(), node = state.nodeById.get(nodeId);
    return !state.writable || state.disposed || !node || activeResult(node) ? null
      : { owner, epoch, nodeId, kind: node.kind, inputRevision: inputs.inputRevision(nodeId), intent: intents.get(nodeId) ?? 0 };
  };
  const capture = (nodeId: string) => spaceInputMediaType(session.getSnapshot().nodeById.get(nodeId)) ? captureNode(nodeId) : null;
  const matches = (expected: SpaceInputExpectation | null | undefined, nodeId: string) => {
    const current = captureNode(nodeId);
    return Boolean(expected && current && expected.owner === current.owner && expected.epoch === current.epoch
      && expected.nodeId === nodeId && expected.kind === current.kind && expected.inputRevision === current.inputRevision && expected.intent === current.intent);
  };
  const cancel = (nodeId: string) => {
    const transfer = transfers.get(nodeId);
    if (!transfer) return;
    transfers.delete(nodeId);
    transfer.controller.abort();
    session.patchRuntime(nodeId, { uploadProgress: undefined });
  };
  const invalidate = (nodeId: string) => { cancel(nodeId); intents.set(nodeId, (intents.get(nodeId) ?? 0) + 1); };
  const notify = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error("MEDIA_IMPORT_FAILED"));
  const commit = (nodeId: string, asset: MediaAssetDto, expected: SpaceInputExpectation | null, origin: "user" | "system") => {
    if (!matches(expected, nodeId) || asset.status !== "completed" || !/^[A-Za-z0-9_-]{1,128}$/.test(asset.id)
      || asset.type !== spaceInputMediaType(session.getSnapshot().nodeById.get(nodeId))) return false;
    // Explicit selection releases an execution association, including reselecting the same asset.
    // Incoming wires stay authoritative until the user disconnects or clears this Input.
    invalidate(nodeId);
    const result = session.transact(document => ({ ...document, nodes: document.nodes.map(node => {
      if (node.id !== nodeId) return node;
      const old = record(node.config), config = { ...old, assetId: asset.id };
      if (Object.hasOwn(old, "resultSource")) (config as Record<string, unknown>).resultSource = { ...record(old.resultSource), executionId: null, state: "completed" };
      return { ...node, config: config as CanonicalNode["config"], selectedOutputAssetId: null };
    }) }), { origin, label: "input.media.select", selectionNodeIds: origin === "user" ? [nodeId] : [] });
    if (!result.ok) { notify(new Error(result.message)); return false; }
    session.patchRuntime(nodeId, { uploadProgress: undefined, uploadError: null });
    options.rememberAsset?.(asset);
    return true;
  };
  const upload = async (nodeId: string, file: File, origin: "user" | "system" = "user"): Promise<boolean> => {
    const target = capture(nodeId), type = spaceInputMediaType(session.getSnapshot().nodeById.get(nodeId));
    if (!target || !type || file.type.split("/")[0] !== type) return false;
    invalidate(nodeId);
    const expected = capture(nodeId)!;
    const controller = new AbortController(), transfer = { controller, expected };
    transfers.set(nodeId, transfer);
    session.patchRuntime(nodeId, { uploadProgress: 0, uploadError: null });
    // Binary transfer has no byte-progress callback. Zero denotes an indeterminate transfer.
    const timeout = setTimeout(() => controller.abort(new Error("CANVAS_IMPORT_TIMEOUT")), 120_000);
    try {
      const asset = await options.upload(file, type, controller.signal);
      if (controller.signal.aborted || transfers.get(nodeId) !== transfer) return false;
      return commit(nodeId, asset, expected, origin);
    } catch (error) {
      if (transfers.get(nodeId) === transfer && matches(expected, nodeId)
        && (!controller.signal.aborted || controller.signal.reason?.message === "CANVAS_IMPORT_TIMEOUT")) {
        session.patchRuntime(nodeId, { uploadError: options.errorMessage?.(error) ?? "Media upload failed." });
        notify(error);
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (transfers.get(nodeId) === transfer) { transfers.delete(nodeId); session.patchRuntime(nodeId, { uploadProgress: undefined }); }
    }
  };
  const videoCaptures = createSpaceVideoCaptureController({ ...options, captureSource: captureNode, matchesSource: matches });
  const controller = {
    capture, matches,
    captureFrame: videoCaptures.capture,
    capturePort(port: SpacePortReference): SpacePortMediaExpectation | null {
      const target = captureNode(port.nodeId), catalog = options.getCatalog?.() ?? { imageModels: [] };
      const node = session.getSnapshot().nodeById.get(port.nodeId);
      const definition = spaceNodePorts(session.getDocument(), port.nodeId, catalog)
        .find(candidate => candidate.definition.id === port.portId && candidate.definition.direction === port.direction);
      const type = definition?.definition.valueType;
      if (!target || !definition?.connectable || !["image", "video", "audio"].includes(type ?? "")
        || (port.direction === "output" && spaceInputMediaType(node) !== type)) return null;
      return { target, port: { ...port }, type: type as MediaType };
    },
    selectPort(expected: SpacePortMediaExpectation, asset: MediaAssetDto, position: SpacePosition): boolean {
      const nodeId = expected.target.nodeId;
      if (!matches(expected.target, nodeId) || asset.status !== "completed" || asset.type !== expected.type) return false;
      invalidate(nodeId);
      const result = session.transact(document => prepareSpacePortMedia(document, expected.port, asset, position,
        options.getCatalog?.() ?? { imageModels: [] }, options.createId ?? (() => crypto.randomUUID()), options.getInputRuntime?.()),
      { origin: "user", label: "port.media.select", selectionNodeIds: expected.port.direction === "output" ? [nodeId] : [] });
      if (!result.ok) { notify(new Error(result.message)); return false; }
      session.patchRuntime(nodeId, { uploadProgress: undefined, uploadError: null }); options.rememberAsset?.(asset);
      return true;
    },
    async uploadPort(expected: SpacePortMediaExpectation, file: File, position: SpacePosition): Promise<boolean> {
      const nodeId = expected.target.nodeId;
      if (!matches(expected.target, nodeId) || file.type.split("/")[0] !== expected.type) return false;
      cancel(nodeId);
      const abort = new AbortController(), transfer = { controller: abort, expected: expected.target };
      transfers.set(nodeId, transfer); session.patchRuntime(nodeId, { uploadProgress: 0, uploadError: null });
      const timeout = setTimeout(() => abort.abort(new Error("CANVAS_IMPORT_TIMEOUT")), 120_000);
      try {
        const asset = await options.upload(file, expected.type, abort.signal);
        return !abort.signal.aborted && transfers.get(nodeId) === transfer && controller.selectPort(expected, asset, position);
      } catch (error) {
        if (transfers.get(nodeId) === transfer && matches(expected.target, nodeId)
          && (!abort.signal.aborted || abort.signal.reason?.message === "CANVAS_IMPORT_TIMEOUT")) {
          session.patchRuntime(nodeId, { uploadError: options.errorMessage?.(error) ?? "Media upload failed." }); notify(error);
        }
        return false;
      } finally { clearTimeout(timeout); if (transfers.get(nodeId) === transfer) { transfers.delete(nodeId); session.patchRuntime(nodeId, { uploadProgress: undefined }); } }
    },
    select(nodeId: string, asset: MediaAssetDto, expected: SpaceInputExpectation | null = capture(nodeId)): boolean { return commit(nodeId, asset, expected, "user"); },
    upload(nodeId: string, file: File, expected?: SpaceInputExpectation | null): Promise<boolean> {
      return expected !== undefined && !matches(expected, nodeId) ? Promise.resolve(false) : upload(nodeId, file);
    },
    cancel,
    clear(nodeId: string): boolean {
      if (!capture(nodeId)) return false;
      invalidate(nodeId);
      const result = session.transact(document => ({ ...document,
        nodes: document.nodes.map(node => {
          if (node.id !== nodeId) return node;
          const config = { ...record(node.config), assetId: null };
          delete (config as Record<string, unknown>).resultSource;
          return { ...node, config: config as CanonicalNode["config"], selectedOutputAssetId: null };
        }), edges: document.edges.filter(edge => edge.targetNodeId !== nodeId),
      }), { origin: "user", label: "input.media.clear", selectionNodeIds: [nodeId] });
      if (!result.ok) { notify(new Error(result.message)); return false; }
      session.patchRuntime(nodeId, { uploadProgress: undefined, uploadError: null });
      return true;
    },
    async filesDrop(files: File[], position: SpacePosition, replaceNodeId?: string): Promise<void> {
      if (replaceNodeId) { if (files[0]) await upload(replaceNodeId, files[0]); return; }
      const state = session.getSnapshot();
      if (!state.writable || state.disposed || !files.length) return;
      if (files.some(file => !["image", "audio", "video"].includes(file.type.split("/")[0]))) { notify(new Error("UNSUPPORTED_MEDIA_TYPE")); return; }
      const createId = options.createId ?? (() => crypto.randomUUID());
      const nodes = files.map((file, index) => ({ id: createId(), kind: `input.${file.type.split("/")[0]}` as "input.image" | "input.audio" | "input.video",
        config: { assetId: null }, position: { x: position.x + index * 240, y: position.y } }));
      const result = session.dispatch({ type: "batch", commands: nodes.map(node => ({ type: "node.add", node })) });
      if (!result.ok) { notify(new Error(result.message)); return; }
      session.select(nodes.map(node => node.id));
      // Stable pending IDs are undoable as one batch; confirmations are system field patches.
      const expected = nodes.map(node => capture(node.id));
      for (const [index, file] of files.entries()) {
        if (!matches(expected[index], nodes[index].id)) continue;
        await upload(nodes[index].id, file, "system");
      }
    },
    start() {
      if (!stop) stop = session.store.subscribe((state, previous) => {
        if (state.id !== previous.id || state.disposed || (state.revision === 0 && state.history !== previous.history)) {
          epoch++; for (const id of [...transfers.keys()]) cancel(id);
        } else for (const [id, transfer] of [...transfers]) if (!matches(transfer.expected, id)) cancel(id);
      });
      videoCaptures.start();
      return () => controller.dispose();
    },
    dispose() { videoCaptures.dispose(); epoch++; stop?.(); stop = null; for (const id of [...transfers.keys()]) cancel(id); },
  };
  return controller;
}
export type SpaceInputMediaController = ReturnType<typeof createSpaceInputMediaController>;
