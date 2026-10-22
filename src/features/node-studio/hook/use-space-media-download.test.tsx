import { act, cleanup, renderHook } from "@testing-library/react";
import { createSpaceEditorSession } from "../model/space-editor-store";
import { createSpaceEditorScope } from "../ui/space-editor-provider";
import { useSpaceMediaDownload } from "./use-space-media-download";
import type { SpaceEditorDocument } from "../model/space-editor-types";
const pending = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../lib/media-zip-download", () => ({ downloadMediaZip: pending.download }));
const document: SpaceEditorDocument = { schemaVersion: 3, title: "ZIP", groups: [], edges: [], nodes: [{ id: "image", kind: "input.image", configVersion: 1, config: { assetId: "asset" }, selectedOutputAssetId: null, position: { x: 0, y: 0 } }] };
function mount() {
  const session = createSpaceEditorSession({ id: "space", version: 1, document }), scope = createSpaceEditorScope(session), stop = scope.start(), error = vi.fn();
  scope.view.setState({ services: { onError: error } }); session.select(["image"]);
  const view = renderHook(() => useSpaceMediaDownload(scope));
  return { ...view, session, scope, stop, error };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
it("captures ordered media once, blocks duplicate clicks and clears its own busy state", async () => {
  let finish!: () => void; pending.download.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const view = mount(); let work!: Promise<void>;
  act(() => { work = view.result.current.downloadSelected(); }); expect(view.result.current.downloadingSelected).toBe(true);
  await act(async () => { await view.result.current.downloadSelected(); }); expect(pending.download).toHaveBeenCalledOnce();
  expect(pending.download.mock.calls[0][0]).toEqual(["asset"]);
  await act(async () => { finish(); await work; }); expect(view.result.current.downloadingSelected).toBe(false); view.stop();
});
it.each(["reset", "readonly", "dispose", "unmount"])("cancels %s without late UI errors or graph edits", async reason => {
  let reject!: (error: Error) => void; pending.download.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const view = mount(); let work!: Promise<void>;
  act(() => { work = view.result.current.downloadSelected(); }); const signal = pending.download.mock.calls[0][1] as AbortSignal;
  act(() => {
    if (reason === "unmount") view.unmount(); else if (reason === "dispose") view.session.dispose();
    else view.session.reset({ id: "space", version: 1, document, writable: reason !== "readonly" });
  });
  expect(signal.aborted).toBe(true);
  await act(async () => { reject(new Error("late")); await work; });
  expect(view.error).not.toHaveBeenCalled(); expect(view.session.getDocument()).toEqual(document); view.stop();
});
it("times out after90s, reports a current failure and permits a later retry", async () => {
  vi.useFakeTimers(); pending.download.mockImplementation((_ids, signal: AbortSignal) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
  const view = mount(); let work!: Promise<void>; act(() => { work = view.result.current.downloadSelected(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(90_001); await work; });
  expect(view.error).toHaveBeenCalledOnce(); expect(view.result.current.downloadingSelected).toBe(false);
  pending.download.mockResolvedValue(undefined); await act(async () => view.result.current.downloadSelected());
  expect(pending.download).toHaveBeenCalledTimes(2); view.stop();
});
