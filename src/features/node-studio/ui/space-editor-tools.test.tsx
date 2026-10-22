import { useLayoutEffect, useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

import { createSpaceEditorSession, type SpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEdgeToolbar, SpaceFloatingActionBar, SpaceSelectionToolbar } from "./space-editor-toolbar";
import { SpaceGroup } from "./space-group";
import { SpaceNodeMenu } from "./space-node-menu";
import { SpaceCanvas } from "./space-canvas";
import { createSpaceEditorScope, SpaceEditorProvider } from "./space-editor-provider";
import { useSpaceMediaServices } from "./space-media-tools";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
type DetailFixtureProps = { asset: MediaAssetDto; writable: boolean; onClose: () => void; finalFocus: () => HTMLElement | false };
const detailFixture = vi.hoisted(() => ({ props: null as DetailFixtureProps | null }));
vi.mock("@/features/media-assets/ui/media-asset-detail", () => ({ MediaAssetDetail: (props: DetailFixtureProps) => {
  detailFixture.props = props;
  return <div role="dialog" data-asset-id={props.asset.id} data-writable={props.writable}>
    <button type="button" onClick={props.onClose}>Close fixture detail</button>
  </div>;
} }));

// jsdom lacks PointerEvent; use real MouseEvent coordinates and pointer identity.
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  if (!globalThis.PointerEvent) vi.stubGlobal("PointerEvent", class extends MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options); this.pointerId = options.pointerId ?? 1; this.isPrimary = options.isPrimary ?? true;
    }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

describe("Space media detail service", () => {
  function mountDetail(type: MediaAssetDto["type"] = "image") {
    const asset: MediaAssetDto = { id: "media", version: 1, type, status: "completed", origin: "upload", url: "https://example.com/media",
      mimeType: type === "image" ? "image/png" : type === "video" ? "video/mp4" : "audio/wav", bytes: "42", width: null, height: null,
      durationMs: null, sourceOperationId: null, createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z" };
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Detail", edges: [], groups: [], nodes: [
      { id: "media-node", kind: `input.${type}`, configVersion: 1, config: { assetId: asset.id }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
    ] };
    const session = createSpaceEditorSession({ id: "detail-space", version: 1, document }), scope = createSpaceEditorScope(session);
    let openFrom: ((trigger: HTMLElement) => void) | undefined;
    const onClosed = vi.fn();
    function Harness() {
      const media = useSpaceMediaServices(scope);
      const { openMediaDetail } = media;
      useLayoutEffect(() => {
        openFrom = trigger => openMediaDetail("media-node", asset, trigger, onClosed);
        return () => { openFrom = undefined; };
      }, [openMediaDetail]);
      return <SpaceEditorProvider session={session} scope={scope}>{media.tools}
        <div data-space-canvas tabIndex={-1}><button onClick={event => media.openMediaDetail("media-node", asset, event.currentTarget, onClosed)}>Open fixture detail</button></div>
      </SpaceEditorProvider>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    return { ...view, session, scope, asset, onClosed, openFrom: (trigger: HTMLElement) => openFrom!(trigger) };
  }

  it.each(["image", "video", "audio"] as const)("opens %s only on demand, allows read-only viewing and restores the owning trigger", type => {
    const view = mountDetail(type), before = view.session.getDocument(), opener = screen.getByRole("button", { name: "Open fixture detail" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-asset-id", view.asset.id);
    expect(detailFixture.props?.asset).toBe(view.asset); expect(detailFixture.props?.finalFocus()).toBe(opener);
    act(() => view.session.setAccess(false));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-writable", "false");
    fireEvent.click(screen.getByRole("button", { name: "Close fixture detail" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.onClosed).toHaveBeenCalledOnce();
    fireEvent.click(opener); expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(view.session.getDocument()).toBe(before);
  });

  it.each(["replace", "remove/undo", "reset", "dispose"])("dismisses an old detail on %s without reopening it", mode => {
    const view = mountDetail(); fireEvent.click(screen.getByRole("button", { name: "Open fixture detail" }));
    act(() => {
      if (mode === "replace") view.session.dispatch({ type: "node.config.patch", nodeId: "media-node", patch: { assetId: "replacement" } });
      if (mode === "remove/undo") { view.session.dispatch({ type: "node.remove", nodeId: "media-node" }); view.session.undo(); }
      if (mode === "reset") view.session.reset({ id: "other-space", version: 1, document: view.session.getDocument() });
      if (mode === "dispose") view.session.dispose();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.onClosed).toHaveBeenCalledOnce();
  });

  it("keeps detail through node movement and falls back to the owning canvas when its trigger disappears", () => {
    const view = mountDetail(), opener = screen.getByRole("button", { name: "Open fixture detail" });
    const detached = document.createElement("button"), canvas = opener.closest<HTMLElement>("[data-space-canvas]")!;
    canvas.append(detached);
    act(() => view.openFrom(detached));
    act(() => view.session.dispatch({ type: "node.move", nodeId: "media-node", position: { x: 100, y: 100 } }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(detailFixture.props?.finalFocus()).toBe(detached);
    detached.remove();
    expect(detailFixture.props?.finalFocus()).toBe(canvas);
  });
});

function documentFixture(): SpaceEditorDocument {
  const node = (kind: CanonicalNodeKind, id: string, x: number) => ({
    id, kind, configVersion: 1, config: defaultConfigForKind(kind), position: { x, y: 40 }, selectedOutputAssetId: null,
  });
  return { schemaVersion: 3, title: "Tools", nodes: [node("input.image", "a", 20), node("generate.image", "b", 420)],
    edges: [{ id: "wire", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "b", targetPortId: "references", sortOrder: 7 }],
    groups: [{ id: "scene", title: "Scene", color: "blue", locked: false, memberNodeIds: ["a", "b"], bounds: { x: 0, y: 20, width: 900, height: 500 } }],
  };
}
function editor(document = documentFixture(), writable = true) {
  return createSpaceEditorSession({ id: "space", version: 1, document, writable });
}
function Frame({ session, zoom = 1 }: { session: SpaceEditorSession; zoom?: number }) {
  const group = useSyncExternalStore(session.store.subscribe, () => session.getDocument().groups.find(group => group.id === "scene"));
  return group ? <SpaceGroup group={group} session={session} zoom={zoom} /> : null;
}
const pointer = (x: number, y: number) => ({ button: 0, pointerId: 1, isPrimary: true, clientX: x, clientY: y });
function CanvasNode({ nodeId }: { nodeId: string }) { return <span>{nodeId}</span>; }
const canvasServices = { renderNode: CanvasNode };

describe("native node palette", () => {
  it("shows only the 14 authorable kinds and intersects the connection-compatible inventory", () => {
    const choose = vi.fn(), close = vi.fn();
    const { rerender, container } = render(<SpaceNodeMenu position={{ x: 100, y: 100 }} onChoose={choose} onClose={close} />);
    expect(screen.getAllByRole("option")).toHaveLength(14);
    for (const name of ["Split Grid", "Video Trim", "Video Stitch", "Image Resize"]) expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    const kinds = ["generate.video", "edit.image.annotation", "input.video", "edit.video.trim", "edit.video.stitch", "edit.image.resize"] as const;
    rerender(<SpaceNodeMenu position={{ x: 100, y: 100 }} kinds={kinds} onChoose={choose} onClose={close} />);
    expect(screen.getAllByRole("option").map(item => item.textContent)).toEqual(["Video Input", "Generate Video"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "generate.video" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(choose).toHaveBeenCalledExactlyOnceWith("generate.video");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not treat an empty compatible list as the full inventory", () => {
    const choose = vi.fn();
    render(<SpaceNodeMenu position={{ x: 1, y: 1 }} kinds={[]} onChoose={choose} onClose={vi.fn()} />);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No compatible nodes.");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(choose).not.toHaveBeenCalled();
  });

  it("guards composition, native isComposing and keyCode 229 before any choice/navigation/dismissal", () => {
    const choose = vi.fn(), close = vi.fn(), canvasKey = vi.fn();
    render(<div onKeyDown={canvasKey}><SpaceNodeMenu position={{ x: 60, y: 60 }}
      kinds={["input.video", "generate.video"]} onChoose={choose} onClose={close} /></div>);
    const input = screen.getByRole("combobox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "Video" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Video Input");
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    expect(choose).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(canvasKey).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(choose).toHaveBeenCalledExactlyOnceWith("generate.video");
  });

  it("loops focus/navigation, restores opening focus, and clamps at the viewport edge", () => {
    const close = vi.fn();
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const { unmount } = render(<SpaceNodeMenu position={{ x: 100000, y: 100000 }} kinds={["input.image", "input.video"]}
      onChoose={vi.fn()} onClose={close} returnFocus={trigger} />);
    const input = screen.getByRole("combobox"), dialog = screen.getByRole("dialog");
    expect(input).toHaveFocus();
    expect(parseFloat(dialog.style.left)).toBeLessThanOrEqual(window.innerWidth - 224 - 8);
    expect(parseFloat(dialog.style.top)).toBeLessThanOrEqual(window.innerHeight - 336 - 8);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Video Input");
    fireEvent.keyDown(input, { key: "Home" });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Image Input");
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("option", { name: "Video Input" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" }); expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1); expect(trigger).toHaveFocus();
    unmount(); trigger.remove();
  });

  it("closes outside and executes separated extra actions after focus restoration", () => {
    const close = vi.fn(), action = vi.fn();
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const { unmount } = render(<SpaceNodeMenu position={{ x: 20, y: 20 }} kinds={["input.image"]} onChoose={vi.fn()}
      onClose={close} extraActions={[{ label: "Upload", onSelect: action }]} returnFocus={trigger} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Upload" }));
    expect(action).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(trigger).toHaveFocus();
    unmount();
    render(<SpaceNodeMenu position={{ x: 20, y: 20 }} onChoose={vi.fn()} onClose={close} />);
    fireEvent.pointerDown(trigger);
    expect(close).toHaveBeenCalledTimes(2); trigger.remove();
  });
});

describe("native group frame", () => {
  it.each(["canvas", "title", "resize"] as const)("copies a selected locked group after move, resize and undo with %s focus", focus => {
    const draft = documentFixture(); draft.groups[0].locked = true;
    const session = editor(draft);
    render(<SpaceEditorProvider session={session} services={canvasServices}><SpaceCanvas /></SpaceEditorProvider>);
    const canvas = screen.getByRole("application", { name: "Workflow editor" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Scene" }), pointer(0, 0));
    fireEvent.pointerMove(window, pointer(100, 100)); fireEvent.pointerUp(window, pointer(100, 100));
    expect(session.getSnapshot().selectedNodeIds).toEqual(["a", "b"]);
    const corner = screen.getByRole("button", { name: "Resize group SE" });
    fireEvent.pointerDown(corner, pointer(0, 0));
    fireEvent.pointerMove(window, pointer(40, 20)); fireEvent.pointerUp(window, pointer(40, 20));
    const target = focus === "canvas" ? canvas : focus === "title" ? screen.getByRole("button", { name: "Scene" }) : corner;
    target.focus();
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    expect(session.getDocument().groups[0].bounds.width).toBe(900);
    expect(session.getSnapshot().selectedNodeIds).toEqual(["a", "b"]);
    fireEvent.keyDown(target, { key: "c", ctrlKey: true });
    fireEvent.keyDown(target, { key: "v", ctrlKey: true });
    expect(session.getDocument().nodes).toHaveLength(4);
    expect(session.getDocument().edges).toHaveLength(2);
    expect(session.getDocument().groups).toHaveLength(2);
    expect(session.getDocument().groups[1]).toMatchObject({ locked: true, memberNodeIds: session.getSnapshot().selectedNodeIds });
    expect(session.getDocument().groups[1].memberNodeIds.every(id => !["a", "b"].includes(id))).toBe(true);
    expect(session.getSnapshot().history.undo).toHaveLength(2);
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    expect(session.getDocument().nodes).toHaveLength(2);
    expect(session.getDocument().groups).toHaveLength(1);
    fireEvent.keyDown(target, { key: "Z", metaKey: true, shiftKey: true });
    expect(session.getDocument().nodes).toHaveLength(4);
    expect(session.getDocument().groups).toHaveLength(2);
  });

  it("keeps text and menu shortcuts native while the group clipboard remains available", () => {
    const session = editor(), before = session.getDocument();
    render(<SpaceEditorProvider session={session} services={canvasServices}><SpaceCanvas /></SpaceEditorProvider>);
    const title = screen.getByRole("button", { name: "Scene" });
    fireEvent.click(title);
    fireEvent.keyDown(title, { key: "c", metaKey: true });
    fireEvent.doubleClick(title);
    const input = screen.getByRole("textbox", { name: "Group name" });
    for (const key of ["c", "v", "z"]) expect(fireEvent.keyDown(input, { key, metaKey: true })).toBe(true);
    expect(session.getDocument()).toBe(before);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Group options" }));
    const menuItem = screen.getByRole("menuitem", { name: "Lock" });
    for (const key of ["c", "v", "z"]) expect(fireEvent.keyDown(menuItem, { key, metaKey: true })).toBe(true);
    expect(session.getDocument()).toBe(before);
    fireEvent.keyDown(menuItem, { key: "Escape" });
    const corner = screen.getByRole("button", { name: "Resize group SE" });
    corner.focus(); fireEvent.keyDown(corner, { key: "v", metaKey: true });
    expect(session.getDocument().nodes).toHaveLength(4);
    expect(session.getDocument().groups).toHaveLength(2);
  });

  it("guards composing, modified and dialog key events even on group geometry controls", () => {
    const session = editor();
    session.dispatch({ type: "group.move", groupId: "scene", delta: { x: 10, y: 10 } });
    const before = session.getDocument();
    const { rerender } = render(<SpaceEditorProvider session={session} services={canvasServices}><SpaceCanvas /></SpaceEditorProvider>);
    const corner = screen.getByRole("button", { name: "Resize group SE" });
    corner.focus();
    for (const guard of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }]) {
      for (const key of ["c", "v", "z"]) expect(fireEvent.keyDown(corner, { key, ctrlKey: true, ...guard })).toBe(true);
    }
    expect(session.getDocument()).toBe(before);
    rerender(<div role="dialog"><SpaceEditorProvider session={session} services={canvasServices}><SpaceCanvas /></SpaceEditorProvider></div>);
    const dialogCorner = screen.getByRole("button", { name: "Resize group SE" });
    for (const key of ["c", "v", "z"]) expect(fireEvent.keyDown(dialogCorner, { key, ctrlKey: true })).toBe(true);
    expect(session.getDocument()).toBe(before);
    expect(session.getSnapshot().history.undo).toHaveLength(1);
  });

  it("updates transient geometry synchronously and commits a zoom-correct drag in one undo step", () => {
    const session = editor(), before = session.getDocument(), durable = vi.fn(); session.subscribeDurable(durable);
    render(<Frame session={session} zoom={2} />);
    const header = screen.getByRole("button", { name: "Scene" });
    fireEvent.pointerDown(header, pointer(100, 100));
    fireEvent.pointerMove(window, pointer(120, 110));
    fireEvent.pointerMove(window, pointer(180, 140));
    expect(session.getSnapshot().gesture).toMatchObject({ kind: "group.move", delta: { x: 40, y: 20 } });
    expect(session.getNodePosition("a")).toEqual({ x: 60, y: 60 });
    expect(session.getDocument()).toBe(before); expect(durable).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, pointer(180, 140));
    expect(durable).toHaveBeenCalledTimes(1); expect(session.getSnapshot().history.undo).toHaveLength(1);
    expect(session.getDocument().groups[0].bounds).toMatchObject({ x: 40, y: 40 });
    expect(session.getDocument().nodes[1].position).toEqual({ x: 460, y: 60 });
    act(() => { session.undo(); });
    expect(session.getDocument()).toEqual(before);
  });

  it("cancels a drag immediately on Escape or pointer cancellation without history or durable writes", () => {
    const session = editor(), before = session.getDocument(), durable = vi.fn(); session.subscribeDurable(durable);
    render(<Frame session={session} />);
    const header = screen.getByRole("button", { name: "Scene" });
    fireEvent.pointerDown(header, pointer(100, 100)); fireEvent.pointerMove(window, pointer(200, 200));
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.pointerUp(window, pointer(200, 200));
    expect(session.getSnapshot().gesture).toBeNull();
    fireEvent.pointerDown(header, pointer(100, 100)); fireEvent.pointerMove(window, pointer(300, 300));
    fireEvent.pointerCancel(window, pointer(300, 300));
    expect(session.getDocument()).toBe(before); expect(session.getSnapshot().history.undo).toHaveLength(0);
    expect(durable).not.toHaveBeenCalled();
  });

  it("resizes from the opposite corner with minimum geometry and keeps member positions", () => {
    const session = editor(), nodes = session.getDocument().nodes;
    render(<Frame session={session} />);
    const corner = screen.getByRole("button", { name: "Resize group NW" });
    fireEvent.pointerDown(corner, pointer(0, 0)); fireEvent.pointerMove(window, pointer(1000, 1000));
    expect(session.getDocument().groups[0].bounds).toEqual({ x: 0, y: 20, width: 900, height: 500 });
    fireEvent.pointerUp(window, pointer(1000, 1000));
    expect(session.getDocument().groups[0].bounds).toEqual({ x: 700, y: 420, width: 200, height: 100 });
    expect(session.getDocument().nodes).toBe(nodes); expect(session.getSnapshot().history.undo).toHaveLength(1);
  });

  it("keeps locked group movement, resize and member config edits available", () => {
    const draft = documentFixture(); draft.groups[0].locked = true;
    const session = editor(draft), begin = vi.spyOn(session, "beginGesture");
    render(<Frame session={session} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Scene" }), pointer(0, 0));
    fireEvent.pointerMove(window, pointer(100, 100)); fireEvent.pointerUp(window, pointer(100, 100));
    expect(begin).toHaveBeenCalledOnce(); expect(screen.getByRole("button", { name: "Resize group SE" })).toBeInTheDocument();
    act(() => {
      expect(session.dispatch({ type: "node.move", nodeId: "a", position: { x: 30, y: 50 } }).ok).toBe(true);
      expect(session.dispatch({ type: "node.config.patch", nodeId: "b", patch: { prompt: "still editable" } }).ok).toBe(true);
    });
    expect(session.getDocument().groups[0].locked).toBe(true);
    expect(session.getDocument().nodes[0].position).toEqual({ x: 30, y: 50 });
    expect(session.getDocument().nodes[1].config).toMatchObject({ prompt: "still editable" });
  });

  it.each(["Delete", "Ungroup"])("%s removes the frame while retaining all member nodes and edges", action => {
    const session = editor(), before = session.getDocument();
    render(<Frame session={session} />);
    fireEvent.click(screen.getByRole("button", { name: "Group options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: action }));
    expect(session.getDocument().groups).toHaveLength(0); expect(session.getDocument().nodes).toBe(before.nodes);
    expect(session.getDocument().edges).toBe(before.edges);
    act(() => { session.undo(); }); expect(session.getDocument()).toEqual(before);
  });

  it("edits title/color/lock through canonical commands and guards title IME", () => {
    const session = editor(); render(<Frame session={session} />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Scene" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: "장면" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(session.getDocument().groups[0].title).toBe("Scene");
    fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(session.getDocument().groups[0].title).toBe("Scene");
    fireEvent.keyDown(input, { key: "Enter" }); expect(session.getDocument().groups[0].title).toBe("장면");
    fireEvent.click(screen.getByRole("button", { name: "Group options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Background" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Green" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Lock" }));
    expect(session.getDocument().groups[0]).toMatchObject({ title: "장면", color: "green", locked: true });
  });
});

describe("native toolbars", () => {
  it.each([98, 75])("keeps one-node actions inside the viewport and clear of node headers at y=%i", headerTop => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-space-selection-toolbar')) return new DOMRect(0, 0, 400, 38);
      if (this.hasAttribute('data-space-workspace-header')) return new DOMRect(0, 0, 1024, 44);
      if (this.dataset.spaceNodeHeader === 'selected') return new DOMRect(280, headerTop, 300, 22);
      if (this.dataset.spaceNodeHeader === 'neighbor') return new DOMRect(280, 630, 300, 22);
      if (this.hasAttribute('data-space-node')) return new DOMRect(280, headerTop + 22, 300, 500);
      return original.call(this);
    });
    render(<><div data-space-workspace-header="" /><div data-space-node-header="selected" /><div data-space-node-header="neighbor" /><div data-space-node="input.audio" data-selected="true" />
      <SpaceSelectionToolbar session={editor()} nodeIds={['a']} position={{ x: 400, y: 81 }} below={{ x: 400, y: 629 }} /></>);
    const toolbar = screen.getByRole('toolbar', { name: 'Selected nodes' });
    const y = Number.parseFloat(toolbar.style.top), x = Number.parseFloat(toolbar.style.left);
    expect(x - 200).toBeGreaterThanOrEqual(8); expect(x + 200).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(y).toBeGreaterThanOrEqual(52); expect(y + 38).toBeLessThanOrEqual(window.innerHeight - 8);
    for (const top of [headerTop, 630]) expect(y + 38 <= top - 4 || y >= top + 26).toBe(true);
    expect(y + 38 <= headerTop + 18 || y >= headerTop + 526).toBe(true);
  });

  it("keeps selection actions above the persistent canvas action bar near the viewport bottom", () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-space-selection-toolbar')) return new DOMRect(0, 0, 400, 38);
      if (this.hasAttribute('data-space-floating-bar')) return new DOMRect(0, 700, 1024, 48);
      return original.call(this);
    });
    render(<><div data-space-floating-bar="" /><SpaceSelectionToolbar session={editor()} nodeIds={['a']}
      position={{ x: 400, y: 760 }} below={{ x: 400, y: 900 }} /></>);
    const toolbar = screen.getByRole('toolbar', { name: 'Selected nodes' });
    expect(Number.parseFloat(toolbar.style.top) + 38).toBeLessThanOrEqual(692);
  });

  it("copies one node immediately in one undo step and keeps multi-node layouts disabled", () => {
    const session = editor(), before = session.getDocument();
    render(<SpaceSelectionToolbar session={session} nodeIds={["a"]} position={{ x: 100, y: 100 }} />);
    const toolbar = screen.getByRole("toolbar", { name: "Selected nodes" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Copy" }));
    expect(within(toolbar).queryByRole("button", { name: "Duplicate nodes" })).not.toBeInTheDocument();
    const afterCopy = session.getDocument();
    expect(afterCopy.nodes).toHaveLength(before.nodes.length + 1);
    const copied = afterCopy.nodes.find(node => !before.nodes.some(original => original.id === node.id))!;
    expect(copied).toMatchObject({ kind: before.nodes[0].kind, config: before.nodes[0].config, position: { x: 70, y: 90 } });
    expect(session.getSnapshot().selectedNodeIds).toEqual([copied.id]);
    expect(session.getSnapshot().history.undo).toHaveLength(1);
    expect(within(toolbar).getByRole("button", { name: "Stack horizontally (H)" })).toBeDisabled();
    expect(within(toolbar).getByRole("button", { name: "Stack vertically (V)" })).toBeDisabled();
    expect(within(toolbar).getByRole("button", { name: "Arrange as grid (G)" })).toBeDisabled();
    fireEvent.keyDown(toolbar, { key: "h" });
    expect(session.getDocument()).toBe(afterCopy);
    act(() => { session.undo(); });
    expect(session.getDocument()).toEqual(before);
    act(() => { session.redo(); });
    expect(session.getDocument()).toEqual(afterCopy);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Delete" }));
    expect(session.getDocument().nodes.some(node => node.id === "a")).toBe(false);
  });

  it("disables Copy for retained retired nodes while preserving deletion", () => {
    const draft = documentFixture();
    draft.nodes[0] = { ...draft.nodes[0], kind: "edit.image.splitGrid", config: defaultConfigForKind("edit.image.splitGrid") };
    draft.edges = [];
    const session = editor(draft);
    expect(session.getSnapshot().writable).toBe(true);
    render(<SpaceSelectionToolbar session={session} nodeIds={["a", "b"]} position={{ x: 100, y: 100 }} />);
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(session.getDocument()).toBe(draft);
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("pauses/deletes the exact canonical edge without changing port/order or nodes", () => {
    const session = editor(), nodes = session.getDocument().nodes;
    const props = { session, edgeId: "wire", position: { x: 300, y: 120 } };
    const { rerender } = render(<SpaceEdgeToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add pause" }));
    expect(session.getDocument().edges[0]).toMatchObject({ id: "wire", sourcePortId: "image", targetPortId: "references", sortOrder: 7, hasPause: true });
    expect(session.getDocument().nodes).toBe(nodes); expect(session.getSnapshot().history.undo).toHaveLength(1);
    rerender(<SpaceEdgeToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove pause" }));
    expect(session.getDocument().edges[0].hasPause).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete edge" }));
    expect(session.getDocument().edges).toHaveLength(0); expect(session.getDocument().nodes).toBe(nodes);
  });

  it("stacks measured nodes atomically, keeps ZIP download, and groups/ungroups the selection", () => {
    const draft = documentFixture(); draft.groups = [];
    const session = editor(draft), download = vi.fn();
    session.measure("a", { width: 120, height: 80 }); session.measure("b", { width: 300, height: 120 });
    const props = { session, nodeIds: ["a", "b"], position: { x: 400, y: 50 }, onDownload: download };
    const { rerender } = render(<SpaceSelectionToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Download as ZIP" }));
    expect(download).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stack horizontally (H)" }));
    expect(session.getDocument().nodes[1].position).toEqual({ x: 160, y: 40 }); expect(session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { session.undo(); });
    fireEvent.keyDown(screen.getByRole("toolbar"), { key: "v", keyCode: 229 });
    expect(session.getDocument().nodes[1].position).toEqual({ x: 420, y: 40 });
    fireEvent.keyDown(screen.getByRole("toolbar"), { key: "v" });
    expect(session.getDocument().nodes[1].position).toEqual({ x: 20, y: 140 });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(session.getDocument().groups[0].memberNodeIds).toEqual(["a", "b"]);
    rerender(<SpaceSelectionToolbar {...props} downloading />);
    expect(screen.getByRole("button", { name: "Download as ZIP" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove from group" }));
    expect(session.getDocument().groups[0].memberNodeIds).toEqual([]); expect(session.getDocument().nodes).toHaveLength(2);
  });

  it("copies a locked group with its internal edge atomically through the text action", () => {
    const draft = documentFixture(); draft.groups[0].locked = true;
    const session = editor(draft), before = session.getDocument();
    render(<SpaceSelectionToolbar session={session} nodeIds={["a", "b"]} position={{ x: 100, y: 100 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    const copiedIds = session.getSnapshot().selectedNodeIds;
    expect(copiedIds).toHaveLength(2);
    expect(copiedIds.every(id => !["a", "b"].includes(id))).toBe(true);
    expect(session.getDocument().groups[1]).toMatchObject({ locked: true, memberNodeIds: copiedIds });
    expect(session.getDocument().edges[1]).toMatchObject({ sourceNodeId: copiedIds[0], targetNodeId: copiedIds[1], sourcePortId: "image", targetPortId: "references", sortOrder: 7 });
    expect(session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { session.undo(); });
    expect(session.getDocument()).toEqual(before);
  });

  it("shows common tooltips on enabled controls and keyboard-focusable disabled controls", async () => {
    const session = editor(), before = session.getDocument(), user = userEvent.setup();
    const { rerender } = render(<SpaceSelectionToolbar session={session} nodeIds={["a"]} position={{ x: 100, y: 100 }} />);
    const copy = screen.getByRole("button", { name: "Copy" });
    await user.hover(copy);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy");
    expect(copy).toHaveAccessibleDescription("Copy");
    expect(within(screen.getByRole("toolbar")).queryByRole("tooltip")).not.toBeInTheDocument();
    await user.unhover(copy);
    const layout = screen.getByRole("button", { name: "Stack horizontally (H)" });
    const trigger = layout.parentElement!;
    expect(trigger).toHaveAttribute("tabindex", "0");
    act(() => { trigger.focus(); });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Stack horizontally (H)");
    expect(trigger).toHaveAccessibleDescription("Stack horizontally (H)");
    fireEvent.click(layout);
    expect(session.getDocument()).toBe(before);
    const readonly = editor(before, false);
    rerender(<SpaceSelectionToolbar session={readonly} nodeIds={["a", "b"]} position={{ x: 100, y: 100 }} />);
    const readonlyCopy = screen.getByRole("button", { name: "Copy" });
    expect(readonlyCopy).toBeDisabled(); fireEvent.click(readonlyCopy);
    expect(readonly.getDocument()).toBe(before);
    expect(readonly.getSnapshot().history.undo).toHaveLength(0);
  });

  it("preserves floating controls, native drag kind and exclusively one-selected-node run", () => {
    const add = vi.fn(), openNodes = vi.fn(), run = vi.fn(), toggle = vi.fn(), models = vi.fn();
    const props = { onAdd: add, onOpenNodes: openNodes, onOpenModels: models, runSelected: run, runReady: true, onToggleEdgeStyle: toggle };
    const { rerender } = render(<SpaceFloatingActionBar {...props} selectedNodeCount={2} edgeStyle="angular" />);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Image" })); expect(add).toHaveBeenCalledExactlyOnceWith("input.image");
    const setData = vi.fn(); fireEvent.dragStart(screen.getByRole("button", { name: "Video" }), { dataTransfer: { setData } });
    expect(setData).toHaveBeenCalledExactlyOnceWith("application/leesfield-node-kind", "input.video");
    fireEvent.click(screen.getByRole("button", { name: "All nodes" })); expect(openNodes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "All models" })); expect(models).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Switch to curved connectors" })); expect(toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    const menu = screen.getByRole("menu", { name: "Generate" }); expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "AI Assistant" })); expect(add).toHaveBeenLastCalledWith("generate.assistant");
    rerender(<SpaceFloatingActionBar {...props} selectedNodeCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" })); expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Run options" })).not.toBeInTheDocument();
    for (const state of [
      { selectedNodeCount: 0 }, { selectedNodeCount: 2 }, { selectedNodeCount: 1, runReady: false },
      { selectedNodeCount: 1, disabled: true }, { selectedNodeCount: 1, runSelected: undefined },
    ]) {
      rerender(<SpaceFloatingActionBar {...props} {...state} />);
      const button = screen.getByRole("button", { name: "Run" });
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(run).toHaveBeenCalledTimes(1);
    rerender(<SpaceFloatingActionBar onAdd={add} onOpenNodes={openNodes} />);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });
});
