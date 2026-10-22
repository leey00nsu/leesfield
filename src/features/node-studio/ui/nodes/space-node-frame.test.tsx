import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeResizerProps } from "@xyflow/react";
import messages from "@/shared/i18n/messages/en.json";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { spaceHandleId } from "../../model/space-editor-ports";
import type { SpacePortReference } from "../../model/space-editor-types";
import { SpaceNodeShell } from "./space-node-shell";
import { SpaceNodeHeader } from "./space-node-header";
import { SpaceNodePort } from "./space-node-port";
import { spaceFlowId } from "../../model/space-editor-flow";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import { SpaceEditorProvider } from "../space-editor-provider";
import { SpaceNodeFrame } from "./space-node-frame";

const flow = vi.hoisted(() => ({ resize: null as NodeResizerProps | null, updateInternals: vi.fn() }));
// Flow owns connection/resize mechanics. Exercise our event and measurement boundary.
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  Handle: ({ id, position, isConnectable, isConnectableStart, isConnectableEnd, ...props }:
    HTMLAttributes<HTMLDivElement> & { position: string; isConnectable: boolean; isConnectableStart: boolean; isConnectableEnd: boolean }) =>
    <div {...props} data-handleid={id} data-handlepos={position} data-connectable={isConnectable}
      data-connectable-start={isConnectableStart} data-connectable-end={isConnectableEnd} />,
  NodeResizer: (props: NodeResizerProps) => {
    flow.resize = props;
    return props.isVisible ? <div className="react-flow__resize-control" data-testid="resize" /> : null;
  },
  useUpdateNodeInternals: () => flow.updateInternals,
}));

class PanelObserver {
  static instances: PanelObserver[] = [];
  target: Element | null = null;
  constructor(private readonly callback: ResizeObserverCallback) { PanelObserver.instances.push(this); }
  observe = vi.fn((target: Element) => { this.target = target; });
  unobserve = vi.fn();
  disconnect = vi.fn();
  emit(height: number, borderHeight = height) {
    this.callback([{ target: this.target, contentRect: { height }, borderBoxSize: [{ blockSize: borderHeight }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

function Frame({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">{children}</NextIntlClientProvider>;
}
function mount(children: ReactNode) { return render(children, { wrapper: Frame }); }

beforeEach(() => {
  PanelObserver.instances = [];
  flow.resize = null;
  flow.updateInternals.mockClear();
  vi.stubGlobal("ResizeObserver", PanelObserver);
  vi.stubGlobal("PointerEvent", MouseEvent);
});

describe("SpaceNodeShell keyboard actions after dragging", () => {
  it("keeps old Gallery completion separate from a pending batch on the same producer", () => {
    const slot = (id: string, executionId: string | null, state: "pending" | "completed", assetId: string | null) => ({
      id, nodeId: "producer", executionId, portId: "image", index: 0, state, mediaType: "image", assetId,
    });
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: { schemaVersion: 3, title: "Batch", edges: [], groups: [], nodes: [
      { id: "producer", kind: "generate.image", configVersion: 1, config: { modelKey: null, prompt: "", parameters: {} }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
      { id: "old", kind: "output.gallery", configVersion: 1, config: { mediaType: "image", resultItems: [slot("old-slot", "old-run", "completed", "fixed")] }, position: { x: 600, y: 0 }, selectedOutputAssetId: null },
      { id: "new", kind: "output.gallery", configVersion: 1, config: { mediaType: "image", resultItems: [slot("first", "current-run", "pending", null), slot("next", null, "pending", null)] }, position: { x: 600, y: 400 }, selectedOutputAssetId: null },
    ] } });
    editor.patchRuntime("producer", { execution: { executionId: "current-run", graphNodeId: "producer", executionKind: "generation", mediaType: "image", status: "processing", progress: 50,
      modelKey: null, outputAssetIds: [], errorCode: null, createdAt: "2026-10-21T00:00:00Z" } });
    const { container } = mount(<SpaceEditorProvider session={editor}><SpaceNodeFrame nodeId="old">Old</SpaceNodeFrame><SpaceNodeFrame nodeId="new">New</SpaceNodeFrame></SpaceEditorProvider>);
    expect(container.querySelector('[data-space-node-id="old"]')).toHaveAttribute("data-executing", "false");
    expect(container.querySelector('[data-space-node-id="old"] [data-space-node-execution-status]')).toHaveAttribute("data-space-node-execution-status", "completed");
    expect(container.querySelector('[data-space-node-id="new"]')).toHaveAttribute("data-executing", "true");
    expect(container.querySelector('[data-space-node-id="new"] [data-space-node-execution-status]')).toHaveTextContent("0/2");
    act(() => editor.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => node.id === "new" ? { ...node,
      config: { mediaType: "image", resultItems: [slot("first", "current-run", "completed", "one"), slot("next", "next-run", "completed", "two")] } } : node) })));
    expect(container.querySelector('[data-space-node-id="new"]')).toHaveAttribute("data-executing", "false");
    expect(container.querySelector('[data-space-node-id="new"] [data-space-node-execution-status]')).toHaveTextContent("2/2");
    expect(editor.getDocument().nodes[1].config).toMatchObject({ resultItems: [{ assetId: "fixed" }] });
  });
  it("enters body interaction when keyboard focus returns from an external toolbar after dragging", () => {
    const play = vi.fn();
    const { container } = mount(<><button>External toolbar</button><SpaceNodeShell id="audio" kind="input.audio" selected onBodyInteract={vi.fn()}>
      <button onClick={play}>Play audio</button>
    </SpaceNodeShell></>);
    const body = container.querySelector('[data-space-node-body]')!;
    fireEvent.pointerDown(body, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 40, clientY: 30 });
    fireEvent.pointerUp(body, { clientX: 40, clientY: 30 });
    const outside = screen.getByRole('button', { name: 'External toolbar' });
    act(() => outside.focus());
    fireEvent.keyDown(outside, { key: 'Tab', shiftKey: true });
    const button = screen.getByRole('button', { name: 'Play audio' });
    act(() => button.focus());
    expect(container.querySelector('[data-space-node]')).toHaveAttribute('data-body-interactive', 'true');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(play).toHaveBeenCalledOnce();
  });

  it("lets Enter and Space activate header actions after Flow suppresses a drag-end click", () => {
    const run = vi.fn();
    const { container } = mount(<SpaceNodeShell id="frames" kind="edit.video.extractFrames" selected onBodyInteract={vi.fn()}
      header={<div data-space-node-header="frames"><button onClick={run}>Run frames</button></div>}>Preview</SpaceNodeShell>);
    const body = container.querySelector('[data-space-node-body]')!;
    const button = screen.getByRole('button', { name: 'Run frames' });
    for (const key of ['Enter', ' ']) {
      fireEvent.pointerDown(body, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(body, { clientX: 40, clientY: 30 });
      fireEvent.pointerUp(body, { clientX: 40, clientY: 30 });
      // React Flow emits no click after dragging. A later keyboard click has
      // no relationship to that old pointer origin or movement threshold.
      fireEvent.keyDown(button, { key });
      fireEvent.keyUp(button, { key });
      fireEvent.click(button, { detail: 0 });
    }
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("SpaceNodeFrame execution footer", () => {
  it("shares resolved executing state with a bound Input and keeps one status outside each body without a QueryClient", () => {
    const run = vi.fn(), cancel = vi.fn();
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: { schemaVersion: 3, title: "Execution", edges: [], groups: [], nodes: [
      { id: "producer", kind: "generate.image", configVersion: 1, config: { modelKey: null, prompt: "Instructions", parameters: {} }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
      { id: "result", kind: "input.image", configVersion: 1, config: { assetId: null, resultSource: { nodeId: "producer", executionId: "run", portId: "image", index: 0, state: "pending" } }, position: { x: 600, y: 0 }, selectedOutputAssetId: null },
    ] } });
    const execution: NodeExecutionDto = { executionId: "run", executionKind: "generation", graphNodeId: "producer", mediaType: "image", status: "processing", progress: 20,
      modelKey: null, errorCode: null, outputAssetIds: [], createdAt: "2026-10-21T00:00:00.000Z", finishedAt: null };
    editor.patchRuntime("producer", { execution });
    const before = editor.getDocument();
    const { container } = mount(<SpaceEditorProvider session={editor} services={{ runNode: run, cancelNode: cancel }}>
      <SpaceNodeFrame nodeId="producer">Instructions</SpaceNodeFrame><SpaceNodeFrame nodeId="result">Result preview</SpaceNodeFrame>
    </SpaceEditorProvider>);
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-space-node]"));
    for (const node of nodes) {
      expect(node).toHaveAttribute("data-executing", "true");
      const footer = node.querySelector<HTMLElement>("[data-space-node-footer]")!;
      expect(footer).toHaveTextContent("Generating");
      expect(node.querySelector<HTMLElement>("[data-space-node-body]")).not.toContainElement(footer);
      expect(within(node).getAllByRole("status")).toHaveLength(1);
    }
    expect(screen.getAllByRole("button", { name: "Cancel operation" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(cancel).toHaveBeenCalledExactlyOnceWith("producer");
    act(() => editor.patchRuntime("producer", { execution: { ...execution, status: "completed", progress: 100, finishedAt: "2026-10-21T00:00:10.000Z" } }));
    for (const node of nodes) {
      expect(node).toHaveAttribute("data-executing", "false");
      expect(node.querySelector<HTMLElement>("[data-space-node-footer]")).toHaveTextContent("Completed10s total");
    }
    expect(editor.getDocument()).toBe(before); expect(run).not.toHaveBeenCalled();
  });

  it("keeps submission and repeat activity on the producer without a body overlay or stale elapsed time", () => {
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: { schemaVersion: 3, title: "Submission", edges: [], groups: [], nodes: [
      { id: "producer", kind: "generate.image", configVersion: 1, config: { modelKey: null, prompt: "Editable", parameters: {} }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
    ] } });
    editor.patchRuntime("producer", { submissionPending: true });
    const { container } = mount(<SpaceEditorProvider session={editor}><SpaceNodeFrame nodeId="producer"><textarea defaultValue="Editable" /></SpaceNodeFrame></SpaceEditorProvider>);
    const node = container.querySelector<HTMLElement>("[data-space-node]")!, body = node.querySelector<HTMLElement>("[data-space-node-body]")!;
    expect(node).toHaveAttribute("data-executing", "true");
    expect(node.querySelector<HTMLElement>("[data-space-node-footer]")).toHaveTextContent("Queued");
    expect(body).not.toHaveTextContent("Queued"); expect(screen.getByRole("textbox")).toBeEnabled();
    act(() => editor.patchRuntime("producer", { submissionPending: false, repeatProgress: { completed: 1, failed: 0, total: 3, running: true } }));
    expect(node).toHaveAttribute("data-executing", "true");
    expect(node.querySelector<HTMLElement>("[data-space-node-footer]")).toHaveTextContent("Generating · 1/3");
    expect(body).not.toHaveTextContent("Generating"); expect(screen.getByRole("textbox")).toBeEnabled();
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SpaceNodePort", () => {
  const reference: SpacePortReference = { nodeId: "node-a", portId: "clip", direction: "input", slot: 2 };
  it("opens a typed port at its contact after a click within 4px, with no visible text label", () => {
    const activate = vi.fn();
    mount(<SpaceNodePort reference={reference} valueType="video" label="Video" onActivate={activate} />);
    const port = screen.getByRole("button", { name: "Connect Video input" });
    vi.spyOn(port, "getBoundingClientRect").mockReturnValue({ right: 100, top: 60 } as DOMRect);
    fireEvent.pointerDown(port, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.click(port, { clientX: 24, clientY: 20 });
    expect(activate).toHaveBeenCalledExactlyOnceWith(reference, { x: 108, y: 60 });
    expect(port).toHaveAttribute("data-handleid", spaceHandleId(reference));
    expect(port).toHaveTextContent("");
  });

  it("does not open a menu after a drag beyond 4px, even when the pointer returns to its origin", () => {
    const activate = vi.fn();
    mount(<SpaceNodePort reference={reference} valueType="video" label="Video" onActivate={activate} />);
    const port = screen.getByRole("button");
    fireEvent.pointerDown(port, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(port, { clientX: 23, clientY: 23 });
    fireEvent.click(port, { clientX: 20, clientY: 20 });
    expect(activate).not.toHaveBeenCalled();
    fireEvent.pointerDown(port, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.click(port, { clientX: 25, clientY: 20 });
    expect(activate).not.toHaveBeenCalled();
    fireEvent.pointerDown(port, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerCancel(port);
    fireEvent.click(port, { clientX: 20, clientY: 20 });
    expect(activate).not.toHaveBeenCalled();
  });

  it("supports Enter/Space but ignores IME, key229 and repeats without suppressing Flow pointer events", () => {
    const activate = vi.fn(), pointer = vi.fn();
    mount(<div onPointerDown={pointer}><SpaceNodePort reference={reference} valueType="video" label="Video" onActivate={activate} /></div>);
    const port = screen.getByRole("button");
    fireEvent.pointerDown(port, { button: 0 });
    expect(pointer).toHaveBeenCalledOnce();
    fireEvent.keyDown(port, { key: "Enter", isComposing: true });
    fireEvent.keyDown(port, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(port, { key: " ", repeat: true });
    expect(activate).not.toHaveBeenCalled();
    fireEvent.keyDown(port, { key: "Enter" });
    fireEvent.keyDown(port, { key: " " });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("retains a saved invisible alias at the supplied anchor without an extra interactive contact", () => {
    const activate = vi.fn();
    const alias: SpacePortReference = { nodeId: "node-a", portId: "references", direction: "input" };
    const { container, rerender } = mount(<SpaceNodePort reference={alias} valueType="image" label="Images"
      visible={false} anchorPortId="primary" position={84} connected onActivate={activate} />);
    const port = container.querySelector<HTMLElement>("[data-space-port]")!;
    expect(port).toHaveAttribute("data-handleid", spaceHandleId(alias));
    expect(port).toHaveAttribute("data-anchor-port-id", "primary");
    expect(port).toHaveStyle({ top: "84px" });
    expect(port).toHaveAttribute("data-connected", "true");
    expect(port).toHaveAttribute("aria-hidden", "true");
    expect(port).toHaveAttribute("tabindex", "-1");
    fireEvent.click(port);
    fireEvent.keyDown(port, { key: "Enter" });
    expect(activate).not.toHaveBeenCalled();
    rerender(<SpaceNodePort reference={alias} valueType="image" label="Images" connectable={false} onActivate={activate} />);
    fireEvent.click(port);
    expect(port).toHaveAttribute("aria-disabled", "true");
    expect(activate).not.toHaveBeenCalled();
  });
});

describe("SpaceNodeHeader", () => {
  it("keeps Required/Optional available to Video Input through its explicit capability", () => {
    const optional = vi.fn();
    const { rerender } = mount(<SpaceNodeHeader id="video" title="Video Input" selected
      supportsOptionalInput onOptionalChange={optional} />);
    fireEvent.click(screen.getByRole("button", { name: "Required" }));
    expect(optional).toHaveBeenCalledExactlyOnceWith(true);
    rerender(<SpaceNodeHeader id="video" title="Video Input" selected supportsOptionalInput optional onOptionalChange={optional} />);
    fireEvent.click(screen.getByRole("button", { name: "Optional", pressed: true }));
    expect(optional).toHaveBeenLastCalledWith(false);
  });

  it("uses callbacks for the browse/custom/comment/expand/run order and exposes disabled Run reasons", () => {
    const browse = vi.fn(), expand = vi.fn(), run = vi.fn(), cancel = vi.fn();
    const props = { id: "custom", title: "A custom capability", selected: true, onBrowse: browse,
      onExpand: expand, onRun: run, onCancel: cancel, onCommentChange: vi.fn(),
      headerButtons: <button>Custom</button>, alwaysVisibleButtons: <button>Always</button> };
    const { rerender } = mount(<SpaceNodeHeader {...props} />);
    expect(screen.getAllByRole("button").map(button => button.getAttribute("aria-label") ?? button.textContent))
      .toEqual(["Click to edit title", "Always", "Browse models", "Custom", "Add comment", "Expand editor", "Run this node"]);
    fireEvent.click(screen.getByRole("button", { name: "Browse models" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Run this node" }));
    expect(browse).toHaveBeenCalledOnce(); expect(expand).toHaveBeenCalledOnce(); expect(run).toHaveBeenCalledOnce();
    rerender(<SpaceNodeHeader {...props} runReady={false} runDisabledReason="A video is required" />);
    const disabled = screen.getByRole("button", { name: "Run node unavailable: A video is required" });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(run).toHaveBeenCalledOnce();
    rerender(<SpaceNodeHeader {...props} executing />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Run node unavailable:/ })).toBeDisabled();
  });

  it("edits a title once on Enter/blur, preserves IME and cancels with Escape while restoring focus", () => {
    const change = vi.fn();
    mount(<SpaceNodeHeader id="note" title="Note" customTitle="Before" onCustomTitleChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Click to edit title" }));
    const input = screen.getByRole("textbox", { name: "Custom title..." });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "  한글 제목  " } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(change).not.toHaveBeenCalled();
    expect(input).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(change).toHaveBeenCalledExactlyOnceWith("한글 제목");
    expect(screen.getByRole("button", { name: "Click to edit title" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Click to edit title" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "discard" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(change).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Click to edit title" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Click to edit title" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "blur title" } });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(change).toHaveBeenLastCalledWith("blur title");
  });

  it("portals comments, focuses the editor, guards IME Escape and saves with Ctrl/Meta+Enter", async () => {
    const change = vi.fn();
    const { container } = mount(<SpaceNodeHeader id="note" title="Note" comment="Original" onCommentChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    const editor = await screen.findByRole("dialog", { name: "Edit comment" });
    expect(container).not.toContainElement(editor);
    const input = screen.getByRole("textbox", { name: "Add a comment..." });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "  새 댓글  " } });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(editor).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(change).toHaveBeenCalledExactlyOnceWith("새 댓글");
    expect(screen.getByRole("button", { name: "Edit comment" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "discard" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(change).toHaveBeenCalledOnce();
  });

  it("saves a comment on outside click and supports focused previous/next navigation in read-only mode", async () => {
    const change = vi.fn(), previous = vi.fn(), next = vi.fn();
    const { rerender } = mount(<SpaceNodeHeader id="note" title="Note" onCommentChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Saved outside" } });
    fireEvent.mouseDown(document.body);
    expect(change).toHaveBeenCalledExactlyOnceWith("Saved outside");
    rerender(<SpaceNodeHeader id="note" title="Note" comment="Saved" writable={false} focusedComment
      commentNavigation={{ currentIndex: 2, totalCount: 3, onPrevious: previous, onNext: next }} />);
    await screen.findByRole("group", { name: "Comment" });
    fireEvent.click(screen.getByRole("button", { name: "Previous comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Next comment" }));
    expect(previous).toHaveBeenCalledOnce(); expect(next).toHaveBeenCalledOnce();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("prevents writable callbacks in read-only mode while keeping expansion available", () => {
    const change = vi.fn(), expand = vi.fn();
    mount(<SpaceNodeHeader id="video" title="Video Input" writable={false} supportsOptionalInput
      onOptionalChange={change} onCustomTitleChange={change} onCommentChange={change} onBrowse={change} onRun={change} onExpand={expand} />);
    for (const name of ["Required", "Click to edit title", "Add comment", "Browse models"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand editor" }));
    expect(expand).toHaveBeenCalledOnce();
  });
});

describe("SpaceNodeShell", () => {
  it("uses the first body click for interaction mode without executing the underlying control, and resets after deselection", () => {
    const interact = vi.fn(), action = vi.fn();
    const props = { id: "audio", kind: "input.audio", selected: true, onBodyInteract: interact, children: <button onClick={action}>Play</button> };
    const { container, rerender } = mount(<SpaceNodeShell {...props} />);
    const shell = container.querySelector<HTMLElement>("[data-space-node]")!, play = screen.getByRole("button", { name: "Play" });
    expect(shell).toHaveAttribute("data-body-interactive", "false");
    fireEvent.pointerDown(play, { button: 0, clientX: 40, clientY: 50 });
    fireEvent.click(play, { clientX: 40, clientY: 50 });
    expect(action).not.toHaveBeenCalled(); expect(interact).toHaveBeenCalledOnce();
    expect(shell).toHaveAttribute("data-body-interactive", "true");
    fireEvent.click(play); expect(action).toHaveBeenCalledOnce();
    rerender(<SpaceNodeShell {...props} selected={false} />);
    rerender(<SpaceNodeShell {...props} />);
    expect(shell).toHaveAttribute("data-body-interactive", "false");
  });

  it("never turns a drag, return-to-origin drag or cancelled gesture into a body action", () => {
    const interact = vi.fn(), action = vi.fn();
    const { container } = mount(<SpaceNodeShell id="node" kind="output.single" selected onBodyInteract={interact}><button onClick={action}>Open</button></SpaceNodeShell>);
    const body = container.querySelector<HTMLElement>("[data-space-node-body]")!, open = screen.getByRole("button", { name: "Open" });
    for (const cancel of [false, true]) {
      fireEvent.pointerDown(body, { button: 0, clientX: 40, clientY: 50 });
      if (cancel) fireEvent.pointerCancel(body);
      else fireEvent.pointerMove(body, { clientX: 46, clientY: 50 });
      fireEvent.pointerUp(body, { clientX: 40, clientY: 50 });
      fireEvent.click(open, { clientX: 40, clientY: 50 });
    }
    expect(action).not.toHaveBeenCalled(); expect(interact).not.toHaveBeenCalled();
    expect(container.querySelector("[data-space-node]")).toHaveAttribute("data-body-interactive", "false");
  });

  it("permits keyboard control focus, leaves IME Escape alone and exits control mode on Escape", async () => {
    const interact = vi.fn(), action = vi.fn();
    const { container } = mount(<SpaceNodeShell id="node" kind="input.audio" selected onBodyInteract={interact}><button onClick={action}>Play</button></SpaceNodeShell>);
    const shell = container.querySelector<HTMLElement>("[data-space-node]")!, body = container.querySelector<HTMLElement>("[data-space-node-body]")!;
    const play = screen.getByRole("button", { name: "Play" });
    act(() => play.focus());
    expect(shell).toHaveAttribute("data-body-interactive", "true");
    fireEvent.click(play); expect(action).toHaveBeenCalledOnce();
    fireEvent.keyDown(play, { key: "Escape", isComposing: true });
    expect(shell).toHaveAttribute("data-body-interactive", "true");
    fireEvent.keyDown(play, { key: "Escape" });
    await waitFor(() => expect(shell).toHaveAttribute("data-body-interactive", "false")); expect(body).toHaveFocus();
  });

  it("keeps ports, resize and portalled controls independent of the body activation gate", () => {
    const interact = vi.fn(), connect = vi.fn();
    const { container } = mount(<SpaceNodeShell id="node" kind="input.image" selected onBodyInteract={interact}>
      <button data-space-port="image" onClick={connect}>Connect</button>
    </SpaceNodeShell>);
    const port = screen.getByRole("button", { name: "Connect" });
    fireEvent.pointerDown(port, { button: 0, clientX: 0, clientY: 0 }); fireEvent.click(port);
    fireEvent.click(screen.getByTestId("resize"));
    expect(connect).toHaveBeenCalledOnce(); expect(interact).not.toHaveBeenCalled();
    expect(container.querySelector("[data-space-node]")).toHaveAttribute("data-body-interactive", "false");
  });

  it("keeps Escape inside an ongoing composition even when the browser omits the key event flag", async () => {
    const { container } = mount(<SpaceNodeShell id="memo" kind="note.memo" selected onBodyInteract={() => {}}><textarea defaultValue="한글" /></SpaceNodeShell>);
    const input = screen.getByRole('textbox'), shell = container.querySelector('[data-space-node]');
    act(() => input.focus()); fireEvent.compositionStart(input);
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }); await Promise.resolve(); });
    expect(shell).toHaveAttribute('data-body-interactive', 'true'); expect(input).toHaveFocus();
    fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(shell).toHaveAttribute('data-body-interactive', 'false'));
  });

  it("does not expose Run or Browse for a future generation config version", () => {
    const run = vi.fn(), browse = vi.fn(), id = "future";
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: { schemaVersion: 3, title: "Future", edges: [], groups: [], nodes: [
      { id, kind: "generate.image", configVersion: 99, config: { opaque: [0, false, null] }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
    ] } });
    const before = editor.getDocument();
    const view = mount(<SpaceEditorProvider session={editor} services={{ runNode: run, browseModel: browse }}><SpaceNodeFrame nodeId={id}>Preserved</SpaceNodeFrame></SpaceEditorProvider>);
    expect(view.container.querySelector('[data-canvas-action="run"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Browse models" })).not.toBeInTheDocument();
    expect(editor.getDocument()).toBe(before); expect(run).not.toHaveBeenCalled(); expect(browse).not.toHaveBeenCalled();
  });
  it("reports panel height without changing the media body, handles collapse and ignores disconnected observers", async () => {
    const height = vi.fn();
    const props = { id: "video", kind: "input.video", bodyHeight: 240, onPanelHeightChange: height,
      settingsPanel: <input aria-label="Setting draft" defaultValue="before" />, children: <video data-testid="media" />,
      footer: <span>Completed · 12s total</span> };
    const { container, rerender, unmount } = mount(<SpaceNodeShell {...props} settingsExpanded />);
    const body = container.querySelector<HTMLElement>("[data-space-node-body]");
    const footer = container.querySelector<HTMLElement>("[data-space-node-footer]")!;
    expect(footer).toHaveTextContent("Completed · 12s total");
    expect(body).not.toContainElement(footer);
    expect(container.querySelector<HTMLElement>("[data-space-node-settings]")).not.toContainElement(footer);
    expect(body).toHaveStyle({ height: "240px", flex: "0 0 auto" });
    const observer = PanelObserver.instances[0];
    const setting = screen.getByRole("textbox", { name: "Setting draft" });
    fireEvent.change(setting, { target: { value: "draft" } });
    act(() => observer.emit(100, 112));
    act(() => observer.emit(100, 112));
    expect(height.mock.calls.filter(([value]) => value === 112)).toHaveLength(1);
    expect(body).toHaveStyle({ height: "240px" });
    rerender(<SpaceNodeShell {...props} settingsExpanded={false} />);
    expect(container.querySelector<HTMLElement>("[data-space-node-footer]")).toBe(footer);
    expect(body).toHaveStyle({ height: "240px" });
    expect(height).toHaveBeenLastCalledWith(0);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    act(() => observer.emit(200));
    expect(height).toHaveBeenLastCalledWith(0);
    rerender(<SpaceNodeShell {...props} settingsExpanded />);
    expect(container.querySelector<HTMLElement>("[data-space-node-footer]")).toBe(footer);
    expect(screen.getByRole("textbox", { name: "Setting draft" })).toBe(setting);
    expect(setting).toHaveValue("draft");
    const current = PanelObserver.instances[1];
    act(() => current.emit(150));
    expect(height).toHaveBeenLastCalledWith(150);
    expect(body).toHaveStyle({ height: "240px" });
    unmount();
    expect(current.disconnect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByTestId("media")).not.toBeInTheDocument());
  });

  it("uses the latest panel callback and ignores invalid observer heights", () => {
    const first = vi.fn(), latest = vi.fn();
    const { rerender } = mount(<SpaceNodeShell id="image" kind="input.image" settingsExpanded
      settingsPanel={<div>Settings</div>} onPanelHeightChange={first}>Image</SpaceNodeShell>);
    const observer = PanelObserver.instances[0];
    rerender(<SpaceNodeShell id="image" kind="input.image" settingsExpanded
      settingsPanel={<div>New settings</div>} onPanelHeightChange={latest}>Image</SpaceNodeShell>);
    act(() => observer.emit(90));
    expect(first).not.toHaveBeenCalledWith(90);
    expect(latest).toHaveBeenCalledExactlyOnceWith(90);
    act(() => observer.emit(Number.NaN));
    act(() => observer.emit(-1));
    expect(latest).toHaveBeenCalledOnce();
  });

  it("exposes resize progress/final callbacks, scopes aspect-fit to the resize affordance, and respects writable", () => {
    const resize = vi.fn(), start = vi.fn(), aspect = vi.fn(), hover = vi.fn();
    const props = { id: "image /한글", kind: "input.image", selected: true, onResizeStart: start, onResize: resize, onAspectFit: aspect, onHover: hover };
    const { container, rerender } = mount(<SpaceNodeShell {...props} header={<SpaceNodeHeader id="image" title="Image Input" />}>Image</SpaceNodeShell>);
    expect(flow.resize?.nodeId).toBe(spaceFlowId(props.id));
    expect(flow.resize?.isVisible).toBe(true);
    const size = { width: 360, height: 270, x: -40, y: -30 };
    act(() => flow.resize?.onResizeStart?.({} as never, size as never));
    expect(start).toHaveBeenCalledOnce();
    act(() => flow.resize?.onResize?.({} as never, size as never));
    act(() => flow.resize?.onResizeEnd?.({} as never, size as never));
    expect(resize.mock.calls).toEqual([[size, false], [size, true]]);
    fireEvent.doubleClick(screen.getByText("Image"));
    expect(aspect).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByTestId("resize"));
    expect(aspect).toHaveBeenCalledOnce();
    const shell = container.querySelector("[data-space-node]")!;
    fireEvent.mouseEnter(shell, { buttons: 1 });
    expect(hover).not.toHaveBeenCalled();
    fireEvent.mouseEnter(shell, { buttons: 0 });
    fireEvent.mouseLeave(shell);
    expect(hover.mock.calls).toEqual([[true], [false]]);
    rerender(<SpaceNodeShell {...props} writable={false}>Image</SpaceNodeShell>);
    expect(flow.resize?.isVisible).toBe(false);
    expect(screen.queryByTestId("resize")).not.toBeInTheDocument();
    act(() => flow.resize?.onResizeStart?.({} as never, size as never));
    act(() => flow.resize?.onResizeEnd?.({} as never, size as never));
    expect(start).toHaveBeenCalledOnce();
    expect(resize).toHaveBeenCalledTimes(2);
  });

  it("preserves width/height-only callbacks and omits nonfinite origin coordinates", () => {
    const resize = vi.fn();
    mount(<SpaceNodeShell id="memo" kind="note.memo" onResize={resize}>Memo</SpaceNodeShell>);
    act(() => flow.resize?.onResize?.({} as never, { width: 400, height: 300 } as never));
    act(() => flow.resize?.onResizeEnd?.({} as never, { width: 420, height: 320, x: Number.NaN, y: 0 } as never));
    expect(resize.mock.calls).toEqual([[{ width: 400, height: 300 }, false], [{ width: 420, height: 320, y: 0 }, true]]);
  });

  it("cancels active resizes on pointer cancellation, read-only transition and unmount", () => {
    const resize = vi.fn(), cancel = vi.fn();
    const props = { id: "memo", kind: "note.memo", selected: true, onResize: resize, onResizeCancel: cancel, children: "Memo" };
    const { container, rerender, unmount } = mount(<SpaceNodeShell {...props} />);
    const size = { width: 400, height: 300, x: 0, y: 0 };
    const begin = () => act(() => flow.resize?.onResizeStart?.({} as never, size as never));
    begin();
    fireEvent.pointerCancel(container.querySelector("[data-space-node]")!);
    expect(cancel).toHaveBeenCalledOnce();
    act(() => flow.resize?.onResizeEnd?.({} as never, size as never));
    expect(resize).not.toHaveBeenCalled();
    begin();
    rerender(<SpaceNodeShell {...props} writable={false} />);
    expect(cancel).toHaveBeenCalledTimes(2);
    rerender(<SpaceNodeShell {...props} />);
    begin(); unmount();
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it("connects Frame resize gestures to canonical history and reconciles the rendered body after undo/redo", () => {
    const id = "memo-frame";
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: { schemaVersion: 3, title: "Memo", edges: [], groups: [], nodes: [
      { id, kind: "note.memo", configVersion: 1, config: { text: "Keep me" }, position: { x: 100, y: 80 }, selectedOutputAssetId: null },
    ] } });
    editor.select([id]);
    const { container } = mount(<SpaceEditorProvider session={editor}><SpaceNodeFrame nodeId={id}>Keep me</SpaceNodeFrame></SpaceEditorProvider>);
    expect(flow.resize?.nodeId).toBe(spaceFlowId(id));
    expect(flow.updateInternals).toHaveBeenCalledWith(spaceFlowId(id));
    const size = { width: 420, height: 320, x: -20, y: -20 };
    act(() => flow.resize?.onResizeStart?.({} as never, size as never));
    act(() => flow.resize?.onResize?.({} as never, size as never));
    expect(editor.getSnapshot().gesture?.kind).toBe("nodes");
    act(() => flow.resize?.onResizeEnd?.({} as never, size as never));
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(editor.getDocument().nodes[0]).toMatchObject({ position: { x: -20, y: -20 }, config: { text: "Keep me", size: { width: 420, height: 320 } } });
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(container.querySelector("[data-space-node-body]")).toHaveStyle({ height: "320px" });
    act(() => { editor.undo(); });
    expect(container.querySelector("[data-space-node-body]")).toHaveStyle({ height: "220px" });
    act(() => { editor.redo(); });
    expect(container.querySelector("[data-space-node-body]")).toHaveStyle({ height: "320px" });
    const cancelled = { width: 500, height: 400, x: -100, y: -100 };
    act(() => flow.resize?.onResizeStart?.({} as never, cancelled as never));
    act(() => flow.resize?.onResize?.({} as never, cancelled as never));
    act(() => editor.cancelGesture());
    // An Escape cancellation can precede Flow's remaining pointer callbacks.
    act(() => flow.resize?.onResize?.({} as never, cancelled as never));
    act(() => flow.resize?.onResizeEnd?.({} as never, cancelled as never));
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(editor.getDocument().nodes[0]).toMatchObject({ position: { x: -20, y: -20 }, config: { size: { width: 420, height: 320 } } });
    expect(container.querySelector("[data-space-node-body]")).toHaveStyle({ height: "320px" });
  });
});
