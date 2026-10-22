import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceMediaClearButton } from "./space-media-clear-button";

afterEach(cleanup);
function fixture(): SpaceEditorDocument {
  const source = (id: string) => ({ id, kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: id }, selectedOutputAssetId: null });
  return { schemaVersion: 3, title: "Media clear", groups: [], nodes: [
    source("before"), source("after"),
    { ...source("compare"), kind: "inspect.imageCompare", config: {} },
    { ...source("resize"), kind: "edit.image.resize", config: { parameters: { width: 1024, height: 1024, fit: "contain", format: "png", quality: 0.9 } }, selectedOutputAssetId: "result" },
  ], edges: [
    { id: "a", sourceNodeId: "before", sourcePortId: "image", targetNodeId: "compare", targetPortId: "before", sortOrder: 0 },
    { id: "b", sourceNodeId: "after", sourcePortId: "image", targetNodeId: "compare", targetPortId: "after", sortOrder: 0 },
    { id: "resize-input", sourceNodeId: "before", sourcePortId: "image", targetNodeId: "resize", targetPortId: "image", sortOrder: 0 },
  ] };
}
function mount(props: { nodeId: string; portIds?: string[]; clearOutput?: boolean }, writable = true) {
  const document = fixture();
  const session = createSpaceEditorSession({ id: "clear-space", version: 1, document, writable });
  const scope = createSpaceEditorScope(session);
  const view = render(<NextIntlClientProvider locale="en" messages={messages}><SpaceEditorProvider session={session} scope={scope}>
    <SpaceMediaClearButton {...props} label="Clear preview" />
  </SpaceEditorProvider></NextIntlClientProvider>);
  return { ...view, document, session, scope };
}

describe("media preview clear action", () => {
  it("disconnects only the displayed side and restores its original edge with one undo", () => {
    const view = mount({ nodeId: "compare", portIds: ["before"] });
    fireEvent.click(screen.getByRole("button", { name: "Clear preview" }));
    expect(view.session.getDocument().edges.map(edge => edge.id)).toEqual(["b", "resize-input"]);
    expect(view.session.getDocument().nodes).toEqual(view.document.nodes);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { view.session.undo(); });
    expect(view.session.getDocument()).toEqual(view.document);
  });

  it("clears a result selection while keeping the source input and its producer intact", () => {
    const view = mount({ nodeId: "resize", clearOutput: true });
    fireEvent.click(screen.getByRole("button", { name: "Clear preview" }));
    expect(view.session.getDocument().nodes.find(node => node.id === "resize")?.selectedOutputAssetId).toBeNull();
    expect(view.session.getDocument().edges).toEqual(view.document.edges);
    expect(view.session.getDocument().nodes[0]).toBe(view.document.nodes[0]);
    act(() => { view.session.undo(); });
    expect(view.session.getDocument()).toEqual(view.document);
  });

  it("keeps result clearing and declared input disconnection in one history operation", () => {
    const view = mount({ nodeId: "resize", portIds: ["image"], clearOutput: true });
    fireEvent.click(screen.getByRole("button", { name: "Clear preview" }));
    expect(view.session.getDocument().edges.map(edge => edge.id)).toEqual(["a", "b"]);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { view.session.undo(); });
    expect(view.session.getDocument()).toEqual(view.document);
  });

  it("disables read-only actions and removes the action when no declared media remains", () => {
    const view = mount({ nodeId: "compare", portIds: ["before"] }, false);
    const button = screen.getByRole("button", { name: "Clear preview" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(view.session.getDocument()).toEqual(view.document);
    act(() => { view.session.setAccess(true); view.session.dispatch({ type: "edge.disconnect", edgeId: "a" }); });
    expect(screen.queryByRole("button", { name: "Clear preview" })).not.toBeInTheDocument();
  });
});
