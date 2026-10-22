import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import english from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession, type SpaceEditorSession } from "../../model/space-editor-store";
import { SpaceEditorProvider } from "../space-editor-provider";
import { SpaceTextNode } from "./space-node-text";

const flow = vi.hoisted(() => ({ updateInternals: vi.fn() }));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  Handle: ({ id, position, isConnectable, isConnectableStart, isConnectableEnd, ...props }:
    HTMLAttributes<HTMLDivElement> & { position: string; isConnectable: boolean; isConnectableStart: boolean; isConnectableEnd: boolean }) =>
    <div {...props} data-handleid={id} data-position={position} data-connectable={isConnectable}
      data-connectable-start={isConnectableStart} data-connectable-end={isConnectableEnd} />,
  NodeResizer: () => null,
  useUpdateNodeInternals: () => flow.updateInternals,
}));

const prompt = (id: string, text = "", variableName?: string): CanonicalNode => ({
  id, kind: "input.prompt", configVersion: 1, position: { x: 0, y: 0 }, selectedOutputAssetId: null,
  config: { text, ...(variableName ? { variableName } : {}) },
});
const constructor = (id: string, template = ""): CanonicalNode => ({ ...prompt(id), kind: "process.promptConstructor", config: { template } });
const edge = (id: string, sourceNodeId: string, targetNodeId: string, sortOrder = 0, hasPause = false): CanonicalEdge => ({
  id, sourceNodeId, sourcePortId: "text", targetNodeId, targetPortId: "text", sortOrder, hasPause,
});
function editor(nodes: CanonicalNode[], edges: CanonicalEdge[] = [], writable = true, id = "space-text") {
  return createSpaceEditorSession({ id, version: 1, writable, document: { schemaVersion: 3, title: "Text", nodes, edges, groups: [] } });
}
function config(session: SpaceEditorSession, nodeId: string) { return session.getSnapshot().nodeById.get(nodeId)?.config as Record<string, unknown>; }
function mount(session: SpaceEditorSession, nodeId: string) {
  function tree(current: SpaceEditorSession): ReactNode {
    return <NextIntlClientProvider locale="en" messages={english} timeZone="UTC">
      <SpaceEditorProvider session={current}><SpaceTextNode nodeId={nodeId} /></SpaceEditorProvider>
    </NextIntlClientProvider>;
  }
  const rendered = render(tree(session));
  return { ...rendered, switchSession: (next: SpaceEditorSession) => rendered.rerender(tree(next)) };
}
async function activate(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
  const input = screen.getByRole("textbox", { name });
  await waitFor(() => expect(input).toHaveFocus());
  return input as HTMLTextAreaElement;
}
async function expand() {
  const trigger = screen.getByRole("button", { name: "Expand editor" });
  act(() => trigger.focus());
  fireEvent.click(trigger);
  return { trigger, dialog: await screen.findByRole("dialog", { name: "Edit Prompt" }) };
}
function typeAt(input: HTMLTextAreaElement, value: string, cursor = value.length) {
  fireEvent.change(input, { target: { value, selectionStart: cursor, selectionEnd: cursor } });
}

beforeEach(() => {
  window.localStorage.clear();
  flow.updateInternals.mockClear();
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SpaceTextNode", () => {
  it("activates Prompt controls before editing text and preserves its variable name while typing", async () => {
    const session = editor([prompt("target", "Before", "topic")]);
    mount(session, "target");
    const display = screen.getByRole("button", { name: "Describe what to generate..." });
    const input = screen.getByRole("textbox", { name: "Describe what to generate..." });
    fireEvent.pointerDown(display, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(display, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.click(display, { button: 0, clientX: 20, clientY: 20 });
    expect(session.getSnapshot().selectedNodeIds).toEqual(["target"]);
    expect(input).toHaveAttribute("readonly");
    expect(session.getSnapshot().history.undo).toHaveLength(0);
    fireEvent.pointerDown(display, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(display, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.click(display, { button: 0, clientX: 20, clientY: 20 });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).not.toHaveAttribute("readonly");
    expect(session.getSnapshot().history.undo).toHaveLength(0);
    fireEvent.change(input, { target: { value: "A new prompt" } });
    expect(config(session, "target")).toEqual({ text: "A new prompt", variableName: "topic" });
    act(() => { session.undo(); });
    expect(input).toHaveValue("Before");
    expect(config(session, "target").variableName).toBe("topic");
  });

  it("keeps Memo display draggable, edits canonical text, and preserves saved size/presentation through undo", async () => {
    const memo: CanonicalNode = { ...prompt("memo", "Before"), kind: "note.memo", config: {
      text: "Before", backgroundColor: "#f7df91", size: { width: 510, height: 350 }, presentation: { customTitle: "Notes", comment: "Keep comment" },
    } };
    const session = editor([memo]), { container } = mount(session, "memo");
    const input = screen.getByRole("textbox", { name: "Memo" });
    const display = screen.getByRole("button", { name: "Memo" });
    expect(input).toHaveAttribute("readonly");
    expect(container.querySelector("[data-space-node-body]")).toHaveStyle({ height: "350px" });
    fireEvent.pointerDown(display, { clientX: 10, clientY: 10 });
    fireEvent.click(display, { clientX: 20, clientY: 10 });
    expect(input).toHaveAttribute("readonly");
    await activate("Memo");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "한글 메모" } });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.compositionEnd(input);
    expect(config(session, "memo")).toEqual({ text: "한글 메모", backgroundColor: "#f7df91", size: { width: 510, height: 350 }, presentation: { customTitle: "Notes", comment: "Keep comment" } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute("readonly");
    act(() => { session.undo(); });
    expect(input).toHaveValue("Before");
    expect(config(session, "memo").size).toEqual({ width: 510, height: 350 });
    expect(config(session, "memo").backgroundColor).toBe("#f7df91");
  });

  it("makes connected empty text authoritative and restores the authored draft after disconnect", async () => {
    const session = editor([prompt("empty"), prompt("target", "Local")]);
    mount(session, "target");
    const input = await activate("Describe what to generate...");
    typeAt(input, "My local draft");
    act(() => { expect(session.dispatch({ type: "edge.connect", edge: edge("incoming", "empty", "target") }).ok).toBe(true); });
    const connected = screen.getByRole("textbox", { name: "Text from connected Prompt node" });
    expect(connected).toBeDisabled();
    expect(connected).toHaveValue("");
    expect(config(session, "target").text).toBe("My local draft");
    fireEvent.change(connected, { target: { value: "Cannot replace" } });
    expect(config(session, "target").text).toBe("My local draft");
    act(() => { session.dispatch({ type: "edge.disconnect", edgeId: "incoming" }); });
    expect(screen.getByRole("textbox", { name: "Describe what to generate..." })).toHaveValue("My local draft");
  });

  it("edits connected Prompt variable metadata with IME guards and removes an emptied optional name", async () => {
    const target = prompt("target", "Local", "color");
    target.config = { ...configOf(target), presentation: { isOptional: true, comment: "Keep" } };
    const session = editor([prompt("empty"), target], [edge("incoming", "empty", "target")]);
    mount(session, "target");
    const trigger = screen.getByRole("button", { name: "@color" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Set Variable Name" });
    const input = within(dialog).getByRole("textbox", { name: "Variable name" });
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: "new-color 12" } });
    expect(input).toHaveValue("newcolor12");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(config(session, "target").variableName).toBe("color");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(config(session, "target").variableName).toBe("newcolor12");
    expect(screen.getByRole("button", { name: "@newcolor12" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "@newcolor12" }));
    const rename = await screen.findByRole("dialog", { name: "Set Variable Name" });
    fireEvent.change(within(rename).getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(within(rename).getByRole("button", { name: "Save" }));
    expect(config(session, "target")).not.toHaveProperty("variableName");
    expect(config(session, "target")).toMatchObject({ text: "Local", presentation: { isOptional: true, comment: "Keep" } });
  });

  it("renders named/inline Constructor variables, preserves unresolved tokens and resolves only once", () => {
    const session = editor([
      prompt("subject", "@color", "subject"),
      prompt("tags", '<var="color">blue</var><var="subject">wrong</var>'),
      prompt("long", "red", "subject_red"), prompt("paused", "hidden", "hidden"),
      constructor("build", "@subject @color @missing @subject_red"),
    ], [edge("one", "subject", "build"), edge("two", "tags", "build", 1), edge("three", "long", "build", 2), edge("paused", "paused", "build", 3, true)]);
    mount(session, "build");
    const input = screen.getByRole("textbox", { name: "Type @ to insert variables..." });
    expect(input).toHaveAttribute("title", "Preview: @color blue @missing red");
    expect(screen.getByText("Available: @subject, @subject_red, @color")).toBeInTheDocument();
    expect(screen.getByText("1 var missing")).toBeInTheDocument();
    act(() => { session.dispatch({ type: "node.config.patch", nodeId: "tags", patch: { text: '<var="newcolor">gold</var>' } }); });
    expect(screen.getByText("Available: @subject, @subject_red, @newcolor")).toBeInTheDocument();
    expect(input).toHaveAttribute("title", "Preview: @color @color @missing red");
    expect(config(session, "build")).toEqual({ template: "@subject @color @missing @subject_red" });
  });

  it("navigates Constructor suggestions with Arrow/Enter/Tab without accepting composition keys", async () => {
    const session = editor([prompt("tone", "calm", "tone"), prompt("color", "blue", "color"), constructor("build")], [edge("one", "tone", "build"), edge("two", "color", "build", 1)]);
    mount(session, "build");
    const input = await activate("Type @ to insert variables...");
    typeAt(input, "A @");
    const list = screen.getByRole("listbox", { name: "Available variables" });
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(within(list).getByRole("option", { name: "@color blue" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(config(session, "build").template).toBe("A @");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(config(session, "build").template).toBe("A @color");
    await waitFor(() => expect(input.selectionStart).toBe(8));
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    typeAt(input, "A @color @to");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(config(session, "build").template).toBe("A @color @tone");
  });

  it("selects suggestions without blurring, and dismisses suggestions before leaving text editing", async () => {
    const session = editor([prompt("tone", "calm", "tone"), constructor("build")], [edge("one", "tone", "build")]);
    mount(session, "build");
    const input = await activate("Type @ to insert variables...");
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    typeAt(input, "@");
    fireEvent.mouseDown(screen.getByRole("option", { name: "@tone calm" }));
    expect(config(session, "build").template).toBe("@tone");
    expect(input).toHaveFocus();
    expect(frames).toHaveLength(1);
    typeAt(input, "@tone @t");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Type @ to insert variables..." })).toHaveFocus());
    expect(input).toHaveAttribute("readonly");
    act(() => { frames.splice(0).forEach(callback => callback(0)); });
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Type @ to insert variables..." })).toHaveFocus();
  });

  it("stages expanded Prompt edits in a body portal, confirms discard, and restores focus", async () => {
    const session = editor([prompt("target", "Original")]), { container } = mount(session, "target");
    const { dialog, trigger } = await expand();
    expect(container).not.toContainElement(dialog);
    const input = within(dialog).getByRole("textbox", { name: "Prompt" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "Expanded draft" } });
    expect(config(session, "target").text).toBe("Original");
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const discard = await screen.findByRole("alertdialog", { name: "Unsaved prompt changes" });
    fireEvent.click(within(discard).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(input).toHaveValue("Expanded draft");
    fireEvent.keyDown(input, { key: "Escape" });
    const confirm = await screen.findByRole("alertdialog", { name: "Unsaved prompt changes" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(config(session, "target").text).toBe("Original");
    expect(trigger).toHaveFocus();
  });

  it("writes expanded Prompt text only on Submit and keeps other config fields", async () => {
    const target = prompt("target", "Original", "topic");
    target.config = { ...configOf(target), presentation: { isOptional: true, customTitle: "My prompt" } };
    const session = editor([target]);
    mount(session, "target");
    const { dialog, trigger } = await expand();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), { target: { value: "Submitted" } });
    expect(config(session, "target").text).toBe("Original");
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(config(session, "target")).toEqual({ text: "Submitted", variableName: "topic", presentation: { isOptional: true, customTitle: "My prompt" } });
    expect(trigger).toHaveFocus();
    expect(session.getSnapshot().history.undo).toHaveLength(1);
  });

  it("supports Constructor autocomplete in the expanded draft without writing before Submit", async () => {
    const session = editor([prompt("tone", "calm", "tone"), constructor("build", "Before")], [edge("one", "tone", "build")]);
    mount(session, "build");
    const { dialog } = await expand();
    const input = within(dialog).getByRole("textbox", { name: "Type @ to insert variables..." }) as HTMLTextAreaElement;
    await waitFor(() => expect(input).toHaveFocus());
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    typeAt(input, "@");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toHaveValue("@");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("@tone");
    expect(input).toHaveAttribute("title", "Preview: calm");
    expect(config(session, "build").template).toBe("Before");
    const submit = within(dialog).getByRole("button", { name: "Submit" });
    act(() => submit.focus());
    expect(frames).toHaveLength(1);
    act(() => { frames.splice(0).forEach(callback => callback(0)); });
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(5);
    fireEvent.click(submit);
    expect(config(session, "build").template).toBe("@tone");
  });

  it("protects newer canonical text from a stale expanded draft", async () => {
    const session = editor([prompt("target", "Original")]);
    mount(session, "target");
    const { dialog } = await expand();
    const input = within(dialog).getByRole("textbox", { name: "Prompt" });
    fireEvent.change(input, { target: { value: "Stale modal draft" } });
    act(() => { session.dispatch({ type: "node.config.patch", nodeId: "target", patch: { text: "Newer canonical text" } }); });
    const submit = within(dialog).getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(config(session, "target").text).toBe("Newer canonical text");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    expect(config(session, "target").text).toBe("Newer canonical text");
  });

  it("drops an expanded draft when switching Space even when node IDs match", async () => {
    const first = editor([prompt("target", "First")], [], true, "first");
    const second = editor([prompt("target", "Second")], [], true, "second");
    const rendered = mount(first, "target");
    const { dialog } = await expand();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), { target: { value: "First unsaved draft" } });
    rendered.switchSession(second);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Describe what to generate..." })).toHaveValue("Second");
    expect(config(first, "target").text).toBe("First");
    expect(config(second, "target").text).toBe("Second");
  });

  it("keeps an expanded draft stale after canonical text changes away and back", async () => {
    const session = editor([prompt("target", "Original")]);
    mount(session, "target");
    const { dialog } = await expand();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), { target: { value: "Old expanded draft" } });
    act(() => { session.dispatch({ type: "node.config.patch", nodeId: "target", patch: { text: "Intervening edit" } }); });
    act(() => { session.dispatch({ type: "node.config.patch", nodeId: "target", patch: { text: "Original" } }); });
    const submit = within(dialog).getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(config(session, "target").text).toBe("Original");
  });

  it("opens connected empty Prompt text read-only while retaining the local authored value", async () => {
    const session = editor([prompt("empty"), prompt("target", "Local", "topic")], [edge("incoming", "empty", "target")]);
    mount(session, "target");
    const { dialog } = await expand();
    const input = within(dialog).getByRole("textbox", { name: "Prompt" });
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("button", { name: "Submit" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(config(session, "target")).toEqual({ text: "Local", variableName: "topic" });
  });

  it("allows read-only expansion while disabling text and variable writes", async () => {
    const session = editor([prompt("target", "Read only", "topic")], [], false);
    mount(session, "target");
    expect(screen.getByRole("textbox", { name: "Describe what to generate..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "@topic" })).toBeDisabled();
    const { dialog } = await expand();
    expect(within(dialog).getByRole("textbox", { name: "Prompt" })).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("button", { name: "Submit" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), { target: { value: "Blocked" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(config(session, "target").text).toBe("Read only");
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });
});

function configOf(node: CanonicalNode) { return node.config as Record<string, CanonicalNode["config"]>; }
