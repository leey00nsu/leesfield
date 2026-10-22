import { describe, expect, it, vi } from "vitest";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { SpaceEditorDocument } from "./space-editor-types";
import { createSpaceEditorSession } from "./space-editor-store";
import { createSpaceEditorScope } from "../ui/space-editor-provider";
import { createSpaceInputMediaController } from "./space-editor-media";
import type { CapturedVideoFrame } from "../lib/space-video-capture";

function asset(id = "new-asset", type: MediaAssetDto["type"] = "image"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: type === "image" ? "image/png" : type === "audio" ? "audio/wav" : "video/mp4", bytes: "42", width: null, height: null,
    durationMs: null, sourceOperationId: null, url: "/assets/" + id, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" };
}
const document = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Media", edges: [], groups: [], nodes: [
  { id: "input", kind: "input.image", position: { x: 10, y: 20 }, configVersion: 1, config: { assetId: "old-asset" }, selectedOutputAssetId: null },
] });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(draft = document(), upload = vi.fn<(file: File, type: "image" | "video" | "audio", signal: AbortSignal) => Promise<MediaAssetDto>>()) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document: draft });
  const scope = createSpaceEditorScope(session), stop = scope.start(), onError = vi.fn(), rememberAsset = vi.fn();
  let id = 0;
  const media = createSpaceInputMediaController({ session, inputs: scope.inputs, upload, rememberAsset, onError, errorMessage: () => "Upload failed", createId: () => "dropped-" + (++id) });
  const finish = media.start();
  return { session, scope, media, upload, onError, rememberAsset, dispose: () => { finish(); stop(); } };
}
const file = () => new File(["binary"], "image.png", { type: "image/png" });
const captured = (): CapturedVideoFrame => ({ file: file(), timestampMs: 1250 });

describe("native Input media transfers", () => {
  function captureDocument(kind = "input.video"): SpaceEditorDocument {
    const base = document().nodes[0], video = { ...base, kind: "input.video", config: { assetId: "source-video" } };
    return kind === "input.video" ? { ...document(), nodes: [video] } : { ...document(), nodes: [
      { ...video, id: "video" }, { ...base, kind, config: { mediaType: "video" } },
    ], edges: [{ id: "original-wire", sourceNodeId: "video", sourcePortId: "video", targetNodeId: "input", targetPortId: "video", sortOrder: 0 }] };
  }
  it.each(["input.video", "output.single"])("immediately reserves %s's pending node/wire and preserves it through decode, upload, selection changes and undo/redo", async kind => {
    const decode = deferred<CapturedVideoFrame>(), upload = deferred<MediaAssetDto>(), ctx = setup(captureDocument(kind), vi.fn(() => upload.promise));
    const before = ctx.session.getDocument(); let signal!: AbortSignal;
    const promise = ctx.media.captureFrame("input", "source-video", abort => { signal = abort; return decode.promise; });
    const pending = ctx.session.getDocument(), result = pending.nodes.at(-1)!;
    expect(pending.nodes).toHaveLength(before.nodes.length + 1); expect(pending.edges).toHaveLength(before.edges.length + 1);
    expect(result).toMatchObject({ kind: "input.image", config: { assetId: null, resultSource: { nodeId: "input", executionId: null, portId: "capturedFrame", state: "pending" } } });
    expect(ctx.session.getSnapshot().runtimeByNode.get("input")).toMatchObject({ submissionPending: true, resultReservationIds: [result.id] });
    expect(ctx.upload).not.toHaveBeenCalled(); expect(ctx.session.getSnapshot().selectedNodeIds).toEqual([result.id]);
    ctx.session.select([]); expect(signal.aborted).toBe(false);
    decode.resolve(captured()); await vi.waitFor(() => expect(ctx.upload).toHaveBeenCalledOnce());
    expect(ctx.upload).toHaveBeenCalledWith(expect.any(File), "image", expect.any(AbortSignal),
      { graphId: "space", sourceAssetId: "source-video", timestampMs: 1250 });
    expect(ctx.session.getDocument()).toBe(pending); expect(ctx.session.getSnapshot().history.undo).toHaveLength(1);
    upload.resolve(asset("captured-png")); expect(await promise).toBe(true);
    const after = ctx.session.getDocument();
    expect(after.nodes.slice(0, before.nodes.length)).toEqual(before.nodes); expect(after.edges).toEqual(pending.edges);
    expect(after.nodes.at(-1)).toMatchObject({ id: result.id, config: { assetId: "captured-png", resultSource: { state: "completed" } } });
    expect(ctx.session.getSnapshot().runtimeByNode.get("input")?.submissionPending).toBe(false);
    expect(ctx.scope.inputs.sourceAssetIds(result.id, "image")).toEqual(["captured-png"]);
    expect(ctx.session.getSnapshot().history.undo).toHaveLength(1);
    ctx.session.undo(); expect(ctx.session.getDocument()).toEqual(before);
    ctx.session.redo(); expect(ctx.session.getDocument()).toEqual(after);
    expect(ctx.media.clear(result.id)).toBe(true); expect(ctx.session.getDocument().edges).toEqual(before.edges);
    ctx.session.undo(); expect(ctx.session.getDocument()).toEqual(after); ctx.dispose();
  });
  it.each(["decode", "upload"])("cancels %s work on invalidation without resurrecting a removed or undone result", async stage => {
    for (const condition of ["replace", "source-delete", "result-delete/undo", "undo/redo", "readonly", "reset", "dispose", "disconnect"]) {
      const decode = deferred<CapturedVideoFrame>(), upload = deferred<MediaAssetDto>(), ctx = setup(captureDocument(), vi.fn(() => upload.promise));
      let signal!: AbortSignal;
      const promise = ctx.media.captureFrame("input", "source-video", abort => { signal = abort; return decode.promise; });
      const resultId = ctx.session.getDocument().nodes.at(-1)!.id;
      if (stage === "upload") { decode.resolve(captured()); await vi.waitFor(() => expect(ctx.upload).toHaveBeenCalledOnce()); }
      if (condition === "replace") ctx.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "replacement" } });
      if (condition === "source-delete") ctx.session.dispatch({ type: "node.remove", nodeId: "input" });
      if (condition === "result-delete/undo") { ctx.session.dispatch({ type: "node.remove", nodeId: resultId }); ctx.session.undo(); }
      if (condition === "undo/redo") { ctx.session.undo(); ctx.session.redo(); }
      if (condition === "readonly") ctx.session.setAccess(false);
      if (condition === "reset") ctx.session.reset({ id: "other", version: 1, document: captureDocument() });
      if (condition === "dispose") ctx.media.dispose();
      if (condition === "disconnect") ctx.session.dispatch({ type: "edge.disconnect", edgeId: ctx.session.getDocument().edges.at(-1)!.id });
      expect(signal.aborted, condition).toBe(true);
      decode.resolve(captured()); upload.resolve(asset("late-png")); expect(await promise, condition).toBe(false);
      const result = ctx.session.getDocument().nodes.find(node => node.id === resultId);
      if (result) {
        expect(result.config, condition).toMatchObject({ assetId: null });
        const binding = (result.config as { resultSource?: { state: string } }).resultSource;
        if (binding) expect(binding.state, condition).toBe("cancelled");
        else expect(["source-delete", "disconnect"], condition).toContain(condition);
      }
      expect(ctx.rememberAsset).not.toHaveBeenCalled(); ctx.dispose();
    }
  });
  it.each(["decode", "upload"])("settles a failed %s reservation, unlocks the source and leaves later captures independent", async stage => {
    const ctx = setup(captureDocument(), stage === "upload" ? vi.fn().mockRejectedValueOnce(new Error("failure")).mockResolvedValue(asset()) : vi.fn().mockResolvedValue(asset()));
    await expect(ctx.media.captureFrame("input", "source-video", async () => { if (stage === "decode") throw new Error("failure"); return captured(); })).rejects.toThrow("failure");
    const failed = ctx.session.getDocument().nodes.at(-1)!;
    expect(failed.config).toMatchObject({ assetId: null, resultSource: { state: "failed" } });
    expect(ctx.session.getSnapshot().runtimeByNode.get("input")?.submissionPending).toBe(false);
    expect(await ctx.media.captureFrame("input", "source-video", async () => captured())).toBe(true);
    expect(ctx.session.getDocument().nodes.find(node => node.id === failed.id)).toEqual(failed);
    expect(ctx.session.getDocument().nodes.at(-1)?.config).toMatchObject({ assetId: "new-asset", resultSource: { state: "completed" } }); ctx.dispose();
  });
  it("suppresses duplicate captures and cancels restored orphan reservations without touching generation reservations", async () => {
    const decode = deferred<CapturedVideoFrame>(), ctx = setup(captureDocument(), vi.fn().mockResolvedValue(asset())), makeFile = vi.fn(() => decode.promise);
    const promise = ctx.media.captureFrame("input", "source-video", makeFile);
    expect(await ctx.media.captureFrame("input", "source-video", makeFile)).toBe(false); expect(makeFile).toHaveBeenCalledOnce();
    decode.resolve(captured()); await promise; ctx.dispose();
    const draft = captureDocument(), base = draft.nodes[0];
    draft.nodes.push({ ...base, id: "orphan", kind: "input.image", config: { assetId: null, resultSource: { nodeId: "input", executionId: null, portId: "capturedFrame", index: 0, state: "pending" } } },
      { ...base, id: "generation-result", kind: "input.image", config: { assetId: null, resultSource: { nodeId: "producer", executionId: null, portId: "image", index: 0, state: "pending" } } });
    const restored = setup(draft);
    await vi.waitFor(() => expect(restored.session.getDocument().nodes.find(node => node.id === "orphan")?.config).toMatchObject({ resultSource: { state: "cancelled" } }));
    expect(restored.session.getDocument().nodes.find(node => node.id === "generation-result")?.config).toMatchObject({ resultSource: { state: "pending" } }); restored.dispose();
  });
  it("publishes cancellation after the triggering redo or source edit so autosave receives the current document last", async () => {
    for (const mode of ["redo", "replace"]) {
      const decode = deferred<CapturedVideoFrame>(), ctx = setup(captureDocument());
      let saved = ctx.session.getDocument();
      ctx.session.subscribeDurable(event => { saved = event.document; });
      const promise = ctx.media.captureFrame("input", "source-video", () => decode.promise);
      const resultId = ctx.session.getDocument().nodes.at(-1)!.id;
      if (mode === "redo") { ctx.session.undo(); ctx.session.redo(); }
      else ctx.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "replacement" } });
      await vi.waitFor(() => expect(ctx.session.getDocument().nodes.find(node => node.id === resultId)?.config).toMatchObject({ resultSource: { state: "cancelled" } }));
      expect(saved, mode).toBe(ctx.session.getDocument());
      decode.resolve(captured()); expect(await promise).toBe(false); ctx.dispose();
    }
  });
  it("patches the latest asset field after upload without reverting movement, and records one user change", async () => {
    const result = deferred<MediaAssetDto>(), ctx = setup(undefined, vi.fn(() => result.promise)), events = vi.fn();
    ctx.session.subscribeDurable(events);
    const promise = ctx.media.upload("input", file());
    expect(ctx.session.getSnapshot().runtimeByNode.get("input")?.uploadProgress).toBe(0);
    expect(ctx.upload.mock.calls[0][0]).toBeInstanceOf(File);
    ctx.session.dispatch({ type: "node.move", nodeId: "input", position: { x: 300, y: 200 } });
    result.resolve(asset());
    expect(await promise).toBe(true);
    expect(ctx.session.getDocument().nodes[0]).toMatchObject({ position: { x: 300, y: 200 }, config: { assetId: "new-asset" } });
    expect(events.mock.calls.at(-1)?.[0]).toMatchObject({ origin: "user", selectionNodeIds: ["input"] });
    ctx.session.undo();
    expect(ctx.session.getDocument().nodes[0]).toMatchObject({ position: { x: 300, y: 200 }, config: { assetId: "old-asset" } });
    expect(ctx.rememberAsset).toHaveBeenCalledWith(asset());
    ctx.dispose();
  });
  it("cancels a superseded upload and ignores a server which still resolves it", async () => {
    const result = deferred<MediaAssetDto>(), ctx = setup(undefined, vi.fn(() => result.promise));
    const promise = ctx.media.upload("input", file());
    const signal = ctx.upload.mock.calls[0][2];
    expect(ctx.media.select("input", asset("chosen"))).toBe(true);
    expect(signal.aborted).toBe(true);
    result.resolve(asset("late"));
    expect(await promise).toBe(false);
    expect(ctx.session.getDocument().nodes[0].config).toEqual({ assetId: "chosen" });
    ctx.dispose();
  });
  it("rejects an old chooser even after A→B→A or a same-asset explicit selection", () => {
    const ctx = setup(), old = ctx.media.capture("input");
    ctx.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "B" } });
    ctx.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "old-asset" } });
    expect(ctx.media.select("input", asset("stale"), old)).toBe(false);
    const current = ctx.media.capture("input"), events = vi.fn(); ctx.session.subscribeDurable(events);
    expect(ctx.media.select("input", asset("old-asset"))).toBe(true);
    expect(ctx.session.getSnapshot().history.undo).toHaveLength(2);
    expect(events.mock.calls.at(-1)?.[0]).toMatchObject({ documentChanged: false, selectionNodeIds: ["input"] });
    expect(ctx.media.select("input", asset("stale"), current)).toBe(false);
    ctx.dispose();
  });
  it.each(["delete/undo", "reset", "dispose"])("does not resurrect input after %s", async mode => {
    const result = deferred<MediaAssetDto>(), ctx = setup(undefined, vi.fn(() => result.promise));
    const promise = ctx.media.upload("input", file());
    if (mode === "delete/undo") { ctx.session.dispatch({ type: "node.remove", nodeId: "input" }); ctx.session.undo(); }
    if (mode === "reset") ctx.session.reset({ id: "space", version: 2, document: ctx.session.getDocument() });
    if (mode === "dispose") ctx.media.dispose();
    result.resolve(asset("stale"));
    expect(await promise).toBe(false);
    expect(ctx.session.getDocument().nodes[0].config).toEqual({ assetId: "old-asset" });
    ctx.dispose();
  });
  it("clears binding, representative and all incoming edges as one undo without removing assets or source nodes", () => {
    const draft = document();
    draft.nodes.push({ ...draft.nodes[0], id: "source", config: { assetId: "source-asset" } });
    draft.nodes[0] = { ...draft.nodes[0], selectedOutputAssetId: "old-asset", config: { assetId: "old-asset", resultSource: { nodeId: "generation", executionId: "finished", portId: "image", index: 0, state: "completed" } } };
    draft.edges.push({ id: "wire", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "input", targetPortId: "reference", sortOrder: 0 });
    const ctx = setup(draft);
    expect(ctx.media.clear("input")).toBe(true);
    expect(ctx.session.getDocument()).toMatchObject({ nodes: [{ id: "input", config: { assetId: null }, selectedOutputAssetId: null }, { id: "source" }], edges: [] });
    expect(ctx.session.getSnapshot().history.undo).toHaveLength(1);
    ctx.session.undo(); expect(ctx.session.getDocument()).toEqual(draft);
    ctx.dispose();
  });
  it("guards pending result nodes, read-only editors, cross-scope tokens and wrong media", () => {
    const ctx = setup(), other = setup();
    expect(ctx.media.select("input", asset(), other.media.capture("input"))).toBe(false);
    expect(ctx.media.select("input", asset("audio", "audio"))).toBe(false);
    ctx.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { resultSource: { nodeId: "generation", executionId: null, portId: "image", index: 0, state: "pending" } } });
    expect(ctx.media.capture("input")).toBeNull(); expect(ctx.media.clear("input")).toBe(false);
    ctx.session.reset({ id: "readonly", version: 1, document: document(), writable: false });
    expect(ctx.media.select("input", asset())).toBe(false);
    ctx.dispose(); other.dispose();
  });
  it("releases completed execution association on reselect and explicitly clears a result Input with no incoming edge", () => {
    const draft = document();
    draft.nodes[0].config = { assetId: "old-asset", resultSource: { nodeId: "producer", executionId: "finished", portId: "image", index: 0, state: "completed" } };
    const ctx = setup(draft);
    expect(ctx.media.select("input", asset("old-asset"))).toBe(true);
    expect(ctx.session.getDocument().nodes[0].config).toMatchObject({ resultSource: { nodeId: "producer", executionId: null, state: "completed" } });
    expect(ctx.media.clear("input")).toBe(true);
    expect(ctx.session.getDocument().nodes[0].config).toEqual({ assetId: null });
    ctx.session.undo(); expect(ctx.session.getDocument().nodes[0].config).toMatchObject({ assetId: "old-asset", resultSource: { executionId: null } });
    ctx.dispose();
  });
  it("keeps the previous asset on transfer failure and clears indeterminate progress", async () => {
    const ctx = setup(undefined, vi.fn(async () => { throw new Error("NETWORK"); }));
    expect(await ctx.media.upload("input", file())).toBe(false);
    expect(ctx.session.getDocument().nodes[0].config).toEqual({ assetId: "old-asset" });
    expect(ctx.session.getSnapshot().runtimeByNode.get("input")).toMatchObject({ uploadProgress: undefined, uploadError: "Upload failed" });
    expect(ctx.onError).toHaveBeenCalledTimes(1); ctx.dispose();
  });
  it("adds stable file batch IDs in one undo and completes as system patches without reverting moved nodes", async () => {
    const first = deferred<MediaAssetDto>(), second = deferred<MediaAssetDto>();
    const upload = vi.fn<(file: File, type: "image" | "video" | "audio", signal: AbortSignal) => Promise<MediaAssetDto>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ctx = setup(undefined, upload), events = vi.fn(); ctx.session.subscribeDurable(events);
    const promise = ctx.media.filesDrop([file(), file()], { x: 400, y: 500 });
    expect(ctx.session.getDocument().nodes.slice(1).map(node => node.id)).toEqual(["dropped-1", "dropped-2"]);
    expect(ctx.session.getSnapshot().selectedNodeIds).toEqual(["dropped-1", "dropped-2"]);
    ctx.session.select(["input"]);
    ctx.session.dispatch({ type: "node.move", nodeId: "dropped-1", position: { x: 900, y: 800 } });
    first.resolve(asset("first")); await Promise.resolve(); await Promise.resolve(); second.resolve(asset("second")); await promise;
    expect(ctx.session.getDocument().nodes[1]).toMatchObject({ position: { x: 900, y: 800 }, config: { assetId: "first" } });
    expect(ctx.session.getDocument().nodes[2].config).toEqual({ assetId: "second" });
    expect(ctx.session.getSnapshot().selectedNodeIds).toEqual(["input"]);
    expect(events.mock.calls.filter(([event]) => event.origin === "system")).toHaveLength(2);
    ctx.session.undo(); ctx.session.undo();
    expect(ctx.session.getDocument().nodes.map(node => node.id)).toEqual(["input"]);
    ctx.dispose();
  });
  it("leaves failed batch placeholders editable and never restores nodes removed while uploading", async () => {
    const result = deferred<MediaAssetDto>(), ctx = setup(undefined, vi.fn(() => result.promise));
    const promise = ctx.media.filesDrop([file(), file()], { x: 0, y: 0 });
    ctx.session.undo();
    result.resolve(asset()); await promise;
    expect(ctx.upload).toHaveBeenCalledTimes(1); expect(ctx.session.getDocument()).toEqual(document());
    ctx.dispose();
  });
  it("waits for durable port upload success, commits to the latest position as one undo, and reuses assets without upload", async () => {
    const result = deferred<MediaAssetDto>(), ctx = setup(undefined, vi.fn(() => result.promise));
    const target = ctx.media.capturePort({ nodeId: "input", direction: "input", portId: "reference" })!;
    const promise = ctx.media.uploadPort(target, file(), { x: -300, y: 20 });
    expect(ctx.session.getDocument().nodes).toHaveLength(1); expect(ctx.session.getDocument().edges).toHaveLength(0);
    ctx.session.dispatch({ type: "node.move", nodeId: "input", position: { x: 700, y: 200 } });
    result.resolve(asset()); expect(await promise).toBe(true);
    expect(ctx.session.getDocument().nodes[0].position).toEqual({ x: 700, y: 200 });
    expect(ctx.session.getDocument().nodes).toHaveLength(2); expect(ctx.session.getDocument().edges).toHaveLength(1);
    ctx.session.undo(); expect(ctx.session.getDocument().nodes).toHaveLength(1); expect(ctx.session.getDocument().nodes[0].position).toEqual({ x: 700, y: 200 });
    const direct = ctx.media.capturePort({ nodeId: "input", direction: "output", portId: "image" })!;
    expect(ctx.media.selectPort(direct, asset("library"), { x: 0, y: 0 })).toBe(true);
    expect(ctx.upload).toHaveBeenCalledTimes(1); ctx.dispose();
  });
  it("does not create a port input after cancellation or a changed target, even when the transfer resolves late", async () => {
    const first = deferred<MediaAssetDto>(), second = deferred<MediaAssetDto>();
    const upload = vi.fn<(file: File, type: "image" | "video" | "audio", signal: AbortSignal) => Promise<MediaAssetDto>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ctx = setup(undefined, upload), port = { nodeId: "input", direction: "input" as const, portId: "reference" };
    const firstPromise = ctx.media.uploadPort(ctx.media.capturePort(port)!, file(), { x: 0, y: 0 });
    ctx.media.cancel("input"); first.resolve(asset()); expect(await firstPromise).toBe(false);
    const secondPromise = ctx.media.uploadPort(ctx.media.capturePort(port)!, file(), { x: 0, y: 0 });
    ctx.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "new-input" } });
    second.resolve(asset()); expect(await secondPromise).toBe(false);
    expect(ctx.session.getDocument().nodes).toHaveLength(1); expect(ctx.session.getDocument().edges).toHaveLength(0);
    ctx.dispose();
  });
});
