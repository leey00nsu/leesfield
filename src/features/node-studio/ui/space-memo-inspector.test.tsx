import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeCanonicalGraphSupport, graphDocumentV3Schema, type CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import english from "@/shared/i18n/messages/en.json";
import { canonicalGraphToEditorDocument, editorDocumentToCanonicalGraph } from "../model/space-editor-document";
import { createSpaceEditorSession, type SpaceEditorSession } from "../model/space-editor-store";
import { SpaceEditorProvider } from "./space-editor-provider";
import { SpaceMemoInspector } from "./space-memo-inspector";

function memo(backgroundColor?: string): CanonicalNode {
  return { id: "memo", kind: "note.memo", configVersion: 1, position: { x: 10, y: 20 }, selectedOutputAssetId: null,
    config: { text: "Remember this", size: { width: 510, height: 350 }, presentation: { customTitle: "주석", comment: "Keep comment" },
      ...(backgroundColor ? { backgroundColor } : {}) } };
}
function editor(node = memo(), writable = true) {
  return createSpaceEditorSession({ id: "memo-space", version: 2, writable,
    document: { schemaVersion: 3, title: "Memo controls", nodes: [node], edges: [], groups: [] } }, { createId: () => "memo-copy" });
}
function mount(session: SpaceEditorSession) {
  return render(<NextIntlClientProvider locale="en" messages={english} timeZone="UTC">
    <SpaceEditorProvider session={session}><SpaceMemoInspector nodeId="memo" /></SpaceEditorProvider>
  </NextIntlClientProvider>);
}
function colorInput() { return screen.getByLabelText("Background color") as HTMLInputElement; }

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SpaceMemoInspector", () => {
  it("keeps legacy Memo defaults absent until a color is chosen and preserves text, size and the user's title", () => {
    const session = editor(), original = session.getDocument(), durable = vi.fn();
    session.subscribeDurable(durable);
    mount(session);
    expect(session.getDocument()).toBe(original);
    expect(durable).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use default color" })).toBeDisabled();
    fireEvent.change(colorInput(), { target: { value: "#f7df91" } });
    expect(session.getDocument().nodes[0].config).toEqual({ ...(memo().config as object), backgroundColor: "#f7df91" });
    expect(durable).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().history.undo).toHaveLength(1);
    fireEvent.change(colorInput(), { target: { value: "#f7df91" } });
    expect(durable).toHaveBeenCalledTimes(1);
  });

  it("undoes/redoes color changes and resets only the optional color field", () => {
    const session = editor();
    mount(session);
    fireEvent.change(colorInput(), { target: { value: "#445566" } });
    act(() => { session.undo(); });
    expect(session.getDocument().nodes[0]).toEqual(memo());
    expect(screen.getByRole("button", { name: "Use default color" })).toBeDisabled();
    act(() => { session.redo(); });
    expect(colorInput()).toHaveValue("#445566");
    act(() => { session.dispatch({ type: "node.config.patch", nodeId: "memo", patch: { text: "A newer memo" } }); });
    fireEvent.click(screen.getByRole("button", { name: "Use default color" }));
    expect(session.getDocument().nodes[0].config).toEqual({ ...(memo().config as object), text: "A newer memo" });
    act(() => { session.undo(); });
    expect(session.getDocument().nodes[0].config).toEqual({ ...(memo().config as object), text: "A newer memo", backgroundColor: "#445566" });
    expect(colorInput()).toHaveValue("#445566");
  });

  it("retains the color through canonical serialization, support validation, reload and node copy", () => {
    const session = editor();
    const view = mount(session);
    fireEvent.change(colorInput(), { target: { value: "#123456" } });
    const wire = graphDocumentV3Schema.parse(JSON.parse(JSON.stringify(editorDocumentToCanonicalGraph(session.getDocument(), session.getSnapshot()))));
    expect(analyzeCanonicalGraphSupport(wire).writable).toBe(true);
    view.unmount();
    const restored = createSpaceEditorSession({ id: wire.id, version: wire.version, document: canonicalGraphToEditorDocument(wire) }, { createId: () => "memo-copy" });
    mount(restored);
    expect(colorInput()).toHaveValue("#123456");
    act(() => { expect(restored.dispatch({ type: "nodes.duplicate", nodeIds: ["memo"], offset: { x: 40, y: 40 } }).ok).toBe(true); });
    const copy = restored.getSnapshot().nodeById.get("memo-copy")!;
    expect(copy.config).toEqual({ ...(memo().config as object), backgroundColor: "#123456" });
    expect(copy.position).toEqual({ x: 50, y: 60 });
    expect(restored.getSnapshot().nodeById.get("memo")?.position).toEqual({ x: 10, y: 20 });
  });

  it("disables color writes in read-only Spaces", () => {
    const session = editor(memo("#123456"), false), original = session.getDocument();
    mount(session);
    expect(colorInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use default color" })).toBeDisabled();
    fireEvent.change(colorInput(), { target: { value: "#ffffff" } });
    fireEvent.click(screen.getByRole("button", { name: "Use default color" }));
    expect(session.getDocument()).toBe(original);
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("excludes non-Memo nodes from the Memo control", () => {
    const session = editor({ ...memo(), kind: "input.prompt", config: { text: "Prompt" } });
    mount(session);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });
});
