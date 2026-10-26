import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpaceMediaEditController } from "./space-media-edit-controller";
import { createSpaceEditorSession } from "./space-editor-store";
import { createSpaceEditorScope } from "../ui/space-editor-provider";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { DirectEditDto } from "@/shared/media-assets/direct-media-edit";
import type { SpaceEditorDocument } from "./space-editor-types";
const asset: MediaAssetDto = { id: "original", version: 1, type: "image", status: "completed", origin: "upload", mimeType: "image/png", bytes: "1000", width: 200, height: 100,
  durationMs: null, sourceOperationId: null, url: "/source.png", createdAt: "2026-10-23T00:00:00Z", updatedAt: "2026-10-23T00:00:00Z" };
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const releases: Array<() => void> = [];
function setup(saved?: SpaceEditorDocument) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document: saved ?? { schemaVersion: 3, title: "Edit", groups: [], edges: [], nodes: [
    { id: "source", kind: "input.image", configVersion: 1, config: { assetId: asset.id }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
  ] } });
  const scope = createSpaceEditorScope(session), stop = scope.start();
  const api = { start: vi.fn(), get: vi.fn(), cancel: vi.fn().mockResolvedValue({}) }, prepare = vi.fn().mockResolvedValue(2), complete = vi.fn();
  const controller = createSpaceMediaEditController({ session, api, prepare, epoch: () => scope.view.getState().epoch,
    revision: id => scope.inputs.inputRevision(id), asset: id => id === asset.id ? asset : undefined, onComplete: complete, pollMs: 5 });
  session.select(["source"]); controller.start(); releases.push(() => { controller.dispose(); stop(); });
  const operation = (status: DirectEditDto["status"] = "processing"): DirectEditDto => {
    const request = api.start.mock.calls[0][2];
    return { id: request.requestId, type: "direct.image.crop", status, progress: status === "completed" ? 100 : 10,
      resultNodeId: request.resultNodeId, sourceNodeId: "source", sourceAssetId: asset.id, outputAssetId: status === "completed" ? "cropped" : null,
      errorCode: null, createdAt: "2026-10-23T00:00:00Z", finishedAt: status === "completed" ? "2026-10-23T00:00:02Z" : null };
  };
  api.start.mockImplementation(async () => operation());
  api.get.mockImplementation(async () => operation("completed"));
  return { session, scope, api, prepare, controller, complete, operation };
}
afterEach(() => { releases.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
describe("direct editing draft and durable result lifecycle", () => {
  it("rejects empty, multiple, unfinished and read-only selection without reserving a result", () => {
    const c = setup(), original = c.session.getDocument();
    c.session.select([]); expect(c.controller.begin("source", asset, "image.crop")).toBe(false);
    c.session.select(["source"]);
    expect(c.controller.begin("source", { ...asset, status: "failed" }, "image.crop")).toBe(false);
    c.session.setAccess(false, "READ_ONLY"); expect(c.controller.begin("source", asset, "image.crop")).toBe(false);
    expect(c.session.getDocument()).toBe(original); expect(c.api.start).not.toHaveBeenCalled();
  });
  it("explicit result cancellation blocks a late completion and never changes the source", async () => {
    const c = setup(), pending = deferred<DirectEditDto>(); c.api.start.mockReturnValue(pending.promise);
    const original = c.session.getDocument().nodes[0];
    c.controller.begin("source", asset, "image.crop"); const submitted = c.controller.confirm();
    await vi.waitFor(() => expect(c.api.start).toHaveBeenCalledOnce());
    const result = c.session.getDocument().nodes.at(-1)!;
    c.controller.cancelResult(result.id); pending.resolve(c.operation("completed")); await submitted;
    expect(c.session.getDocument().nodes.at(-1)?.config).toMatchObject({ assetId: null, resultSource: { state: "cancelled" } });
    expect(c.session.getDocument().nodes[0]).toBe(original); expect(c.api.cancel).toHaveBeenCalled();
  });
  it("keeps draft changes/cancel out of Graph history", () => {
    const c = setup(), before = c.session.getDocument();
    expect(c.controller.begin("source", asset, "image.crop")).toBe(true);
    c.controller.change({ kind: "image.crop", rect: { x: 100, y: 0, width: 80, height: 100 } });
    c.controller.close();
    expect(c.session.getDocument()).toBe(before); expect(c.session.getSnapshot().history.undo).toHaveLength(0); expect(c.api.start).not.toHaveBeenCalled();
  });
  it("reserves once, survives selection changes, then freezes result through undo/redo", async () => {
    const c = setup(), pending = deferred<DirectEditDto>(); c.api.start.mockReturnValue(pending.promise);
    const before = c.session.getDocument(); c.controller.begin("source", asset, "image.crop");
    const submitted = c.controller.confirm(); expect(await c.controller.confirm()).toBe(false);
    await vi.waitFor(() => expect(c.api.start).toHaveBeenCalledOnce());
    const result = c.session.getDocument().nodes.at(-1)!;
    c.session.select([]);
    pending.resolve(c.operation("completed")); expect(await submitted).toBe(true);
    expect(c.session.getDocument().nodes.at(-1)).toMatchObject({ config: { assetId: "cropped", resultSource: { state: "completed" } } });
    expect(c.session.getDocument().nodes[0]).toEqual(before.nodes[0]); expect(c.complete).toHaveBeenCalledWith("cropped");
    expect(c.api.cancel).not.toHaveBeenCalled();
    c.session.undo(); expect(c.session.getDocument()).toEqual(before);
    c.session.redo(); expect(c.session.getDocument().nodes.at(-1)).toMatchObject({ id: result.id, config: { assetId: "cropped" } });
    expect(c.api.start).toHaveBeenCalledOnce();
  });
  it("invalidates A→B→A before an in-flight POST returns and never applies its late result", async () => {
    const c = setup(), pending = deferred<DirectEditDto>(); c.api.start.mockReturnValue(pending.promise);
    c.controller.begin("source", asset, "image.crop"); const submitted = c.controller.confirm();
    await vi.waitFor(() => expect(c.api.start).toHaveBeenCalledOnce());
    for (const id of ["replacement", "original"]) c.session.transact(d => ({ ...d, nodes: d.nodes.map(n => n.id === "source" ? { ...n, config: { assetId: id } } : n) }));
    pending.resolve(c.operation("completed")); expect(await submitted).toBe(false);
    expect(c.session.getDocument().nodes.at(-1)?.config).toMatchObject({ assetId: null, resultSource: { state: "cancelled" } });
    expect(c.complete).not.toHaveBeenCalled(); expect(c.api.cancel).toHaveBeenCalled();
  });
  it("undo of pending followed by redo does not restart or resurrect a spinner", async () => {
    const c = setup(), pending = deferred<DirectEditDto>(); c.api.start.mockReturnValue(pending.promise);
    const events: Array<{ revision: number; document: SpaceEditorDocument }> = [];
    c.session.subscribeDurable(event => events.push(event));
    c.controller.begin("source", asset, "image.crop"); const submitted = c.controller.confirm();
    await vi.waitFor(() => expect(c.api.start).toHaveBeenCalledOnce());
    c.session.undo(); c.session.redo();
    expect(c.session.getDocument().nodes.at(-1)?.config).toMatchObject({ resultSource: { state: "cancelled" } });
    expect(events.map(event => event.revision)).toEqual([...events.map(event => event.revision)].sort((a, b) => a - b));
    expect(events.at(-1)?.document).toEqual(c.session.getDocument());
    pending.resolve(c.operation()); await submitted; expect(c.api.start).toHaveBeenCalledOnce();
  });
  it("reopens pending reservations by GET only, without resubmission", async () => {
    const c = setup(); c.controller.begin("source", asset, "image.crop");
    await c.controller.confirm();
    const reopened = setup(structuredClone(c.session.getDocument()));
    reopened.api.get.mockResolvedValue(c.operation("completed"));
    await vi.waitFor(() => expect(reopened.api.get).toHaveBeenCalled());
    expect(reopened.session.getDocument().nodes.at(-1)?.config).toMatchObject({ assetId: "cropped" });
    expect(reopened.api.start).not.toHaveBeenCalled();
  });
});
