import { useEffect, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditorProvider } from "./space-editor-provider";
import { useSpaceImageFit } from "./space-image-view-settings";

const graph = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Image view", edges: [], groups: [], nodes: ["a", "b"].map(id => ({
  id, kind: "input.image", configVersion: 1, config: { assetId: null }, position: { x: 0, y: 0 }, selectedOutputAssetId: null,
})) });
const editor = (id = "image-fit-space") => createSpaceEditorSession({ id, version: 1, document: graph() });
const key = (graphId: string, nodeId = "a") => `node-studio.image-fit:${encodeURIComponent(graphId)}:${encodeURIComponent(nodeId)}`;

function Consumer({ nodeId, name, onCommit }: { nodeId: string; name: string; onCommit?: () => void }) {
  const { fit, setFit } = useSpaceImageFit(nodeId);
  useEffect(() => { onCommit?.(); });
  return <button aria-label={name} onClick={() => setFit(fit === "cover" ? "contain" : "cover")}>{fit}</button>;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useSpaceImageFit", () => {
  it("defaults to cover without writes, synchronizes only matching consumers, and leaves the graph untouched", () => {
    const session = editor(), original = session.getDocument(), durable = vi.fn(), commits = { a: vi.fn(), b: vi.fn() };
    session.subscribeDurable(durable);
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<SpaceEditorProvider session={session}>
      <Consumer nodeId="a" name="Image A" onCommit={commits.a} /><Consumer nodeId="a" name="Inspector A" />
      <Consumer nodeId="b" name="Image B" onCommit={commits.b} />
    </SpaceEditorProvider>);
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("cover");
    expect(write).not.toHaveBeenCalled();
    const initialA = commits.a.mock.calls.length, initialB = commits.b.mock.calls.length;
    act(() => { session.select(["a"]); session.hover("b"); session.setViewport({ x: 20, y: 10, zoom: 1.1 }); });
    expect(commits.a).toHaveBeenCalledTimes(initialA); expect(commits.b).toHaveBeenCalledTimes(initialB);
    fireEvent.click(screen.getByRole("button", { name: "Inspector A" }));
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("contain");
    expect(screen.getByRole("button", { name: "Inspector A" })).toHaveTextContent("contain");
    expect(screen.getByRole("button", { name: "Image B" })).toHaveTextContent("cover");
    expect(commits.b).toHaveBeenCalledTimes(initialB);
    expect(window.localStorage.getItem(key(session.getSnapshot().id))).toBe("contain");
    expect(session.getDocument()).toBe(original); expect(durable).not.toHaveBeenCalled();
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("restores prior preferences after unmount and isolates identical node IDs in other graphs", () => {
    const first = editor("first:space"), second = editor("second:space");
    const view = render(<SpaceEditorProvider session={first}><Consumer nodeId="a" name="First" /></SpaceEditorProvider>);
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    view.unmount();
    render(<><SpaceEditorProvider session={first}><Consumer nodeId="a" name="First" /></SpaceEditorProvider>
      <SpaceEditorProvider session={second}><Consumer nodeId="a" name="Second" /></SpaceEditorProvider></>);
    expect(screen.getByRole("button", { name: "First" })).toHaveTextContent("contain");
    expect(screen.getByRole("button", { name: "Second" })).toHaveTextContent("cover");
    expect(window.localStorage.getItem(key("second:space"))).toBeNull();
  });

  it("reads a saved setting and follows storage changes, removal and clear while ignoring session storage", () => {
    const session = editor("storage-events"), storageKey = key(session.getSnapshot().id);
    window.localStorage.setItem(storageKey, "contain");
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<SpaceEditorProvider session={session}><Consumer nodeId="a" name="Image A" /></SpaceEditorProvider>);
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("contain");
    expect(write).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "cover", storageArea: window.sessionStorage })); });
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("contain");
    for (const value of ["cover", "invalid", "contain", null]) {
      act(() => {
        if (value === null) window.localStorage.removeItem(storageKey); else window.localStorage.setItem(storageKey, value);
        window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: value, storageArea: window.localStorage }));
      });
      expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent(value === "contain" ? "contain" : "cover");
    }
    fireEvent.click(screen.getByRole("button", { name: "Image A" }));
    act(() => { window.localStorage.clear(); window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: window.localStorage })); });
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("cover");
  });

  it("switches namespaces when a session is reset and rejects a stale setter", () => {
    const session = editor("before-reset");
    const wrapper = ({ children }: { children: ReactNode }) => <SpaceEditorProvider session={session}>{children}</SpaceEditorProvider>;
    const { result } = renderHook(() => useSpaceImageFit("a"), { wrapper });
    act(() => result.current.setFit("contain"));
    const stale = result.current.setFit;
    act(() => { session.reset({ id: "after-reset", version: 1, document: graph() }); });
    expect(result.current.fit).toBe("cover");
    act(() => stale("cover"));
    expect(window.localStorage.getItem(key("before-reset"))).toBe("contain");
    expect(window.localStorage.getItem(key("after-reset"))).toBeNull();
    act(() => result.current.setFit("contain"));
    expect(window.localStorage.getItem(key("after-reset"))).toBe("contain");
  });

  it("reads current storage when delayed value and clear events arrive after a newer local choice", () => {
    const session = editor("delayed-storage-events"), storageKey = key(session.getSnapshot().id);
    const wrapper = ({ children }: { children: ReactNode }) => <SpaceEditorProvider session={session}>{children}</SpaceEditorProvider>;
    const { result } = renderHook(() => useSpaceImageFit("a"), { wrapper });
    // A remote contain event is queued while this tab makes newer choices.
    act(() => {
      window.localStorage.setItem(storageKey, "contain");
      result.current.setFit("contain"); result.current.setFit("cover");
    });
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "contain", storageArea: window.localStorage })); });
    expect(result.current.fit).toBe("cover");
    expect(window.localStorage.getItem(storageKey)).toBe("cover");
    expect(write).not.toHaveBeenCalled();
    act(() => result.current.setFit("contain"));
    write.mockClear();
    // A historical clear must not erase a value written after that clear.
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: window.localStorage })); });
    expect(result.current.fit).toBe("contain");
    expect(window.localStorage.getItem(storageKey)).toBe("contain");
    expect(write).not.toHaveBeenCalled();
  });

  it("retains its fallback during unreadable storage events and reconciles when reads recover", () => {
    const session = editor("unreadable-storage-events"), storageKey = key(session.getSnapshot().id);
    const wrapper = ({ children }: { children: ReactNode }) => <SpaceEditorProvider session={session}>{children}</SpaceEditorProvider>;
    const { result } = renderHook(() => useSpaceImageFit("a"), { wrapper });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    act(() => result.current.setFit("contain"));
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "cover", storageArea: window.localStorage }));
      window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: window.localStorage }));
    });
    expect(result.current.fit).toBe("contain");
    read.mockRestore(); write.mockRestore();
    window.localStorage.setItem(storageKey, "cover");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "contain", storageArea: window.localStorage })); });
    expect(result.current.fit).toBe("cover");
  });

  it("keeps a shared in-memory preference when writes fail and safely defaults when reads are blocked", () => {
    const session = editor("blocked-storage");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    const mount = () => render(<SpaceEditorProvider session={session}><Consumer nodeId="a" name="Image A" /><Consumer nodeId="a" name="Inspector A" /></SpaceEditorProvider>);
    const view = mount();
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("cover");
    fireEvent.click(screen.getByRole("button", { name: "Image A" }));
    expect(screen.getByRole("button", { name: "Inspector A" })).toHaveTextContent("contain");
    view.unmount(); mount();
    expect(screen.getByRole("button", { name: "Image A" })).toHaveTextContent("contain");
  });

  it("releases storage listeners and blocks preferences for read-only, deleted and disposed nodes", () => {
    const session = editor("guarded-settings"), write = vi.spyOn(Storage.prototype, "setItem");
    const add = vi.spyOn(window, "addEventListener"), remove = vi.spyOn(window, "removeEventListener");
    const wrapper = ({ children }: { children: ReactNode }) => <SpaceEditorProvider session={session}>{children}</SpaceEditorProvider>;
    const { result, unmount } = renderHook(() => useSpaceImageFit("a"), { wrapper });
    act(() => { session.setAccess(false); result.current.setFit("contain"); });
    expect(result.current.fit).toBe("cover");
    act(() => { session.setAccess(true); session.dispatch({ type: "node.remove", nodeId: "a" }); result.current.setFit("contain"); });
    expect(write).not.toHaveBeenCalled();
    act(() => { session.dispose(); result.current.setFit("contain"); });
    expect(write).not.toHaveBeenCalled();
    const storageListener = add.mock.calls.find(([type]) => type === "storage")?.[1];
    expect(storageListener).toBeDefined();
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", storageListener);
  });
});
