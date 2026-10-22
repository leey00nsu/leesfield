import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import english from "@/shared/i18n/messages/en.json";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { createSpaceEditorSession } from "../model/space-editor-store";
import { SpaceEditorProvider } from "./space-editor-provider";
import { SpaceNodeInspector } from "./space-node-inspector";
import { useSpaceImageFit } from "./space-image-view-settings";

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({ useMediaAsset: () => ({ data: undefined }), useMediaAssetList: () => [] }));

const graph = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Inspector", groups: [],
  nodes: ["a", "b"].map(id => ({ id, kind: "input.image", configVersion: 1, config: { assetId: null }, position: { x: 0, y: 0 }, selectedOutputAssetId: null })), edges: [],
});
function PreviewProbe({ nodeId }: { nodeId: string }) {
  const { fit } = useSpaceImageFit(nodeId);
  return <output aria-label={`Image ${nodeId} fit`}>{fit}</output>;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SpaceNodeInspector", () => {
  it("routes selected frame settings outside the node authoring provider", () => {
    const kind = "edit.video.extractFrames", title = "Video Frames settings";
    const document = graph();
    document.nodes[0] = { ...document.nodes[0], kind, config: { parameters: {} } };
    const session = createSpaceEditorSession({ id: "media-inspector", version: 1, document });
    session.select(["a"]);
    renderWithIntl(<SpaceEditorProvider session={session}><SpaceNodeInspector /></SpaceEditorProvider>, { locale: "en", messages: english });
    const panel = screen.getByRole("region", { name: title });
    fireEvent.change(within(panel).getByLabelText("Frame time"), { target: { value: "1.234" } });
    expect(session.getDocument().nodes[0].config).toMatchObject({ parameters: { timestampMs: 1234 } });
    act(() => session.select(["a", "b"]));
    expect(screen.queryByRole("region", { name: title })).not.toBeInTheDocument();
  });

  it.each(["edit.image.resize", "edit.video.stitch", "edit.video.trim"])("does not expose retained %s settings even if it is selected", kind => {
    const document = graph();
    document.nodes[0] = { ...document.nodes[0], kind, config: { parameters: {} } };
    const session = createSpaceEditorSession({ id: "hidden-inspector", version: 1, document });
    session.select(["a"]);
    renderWithIntl(<SpaceEditorProvider session={session}><SpaceNodeInspector /></SpaceEditorProvider>, { locale: "en", messages: english });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(session.getDocument()).toBe(document);
  });

  it("routes a single Memo to its persisted color settings and hides the panel for multiple nodes", () => {
    const document = graph();
    document.nodes[0] = { ...document.nodes[0], kind: "note.memo", config: { text: "Keep this note" } };
    const session = createSpaceEditorSession({ id: "memo-inspector", version: 1, document });
    session.select(["a"]);
    renderWithIntl(<SpaceEditorProvider session={session}><SpaceNodeInspector /></SpaceEditorProvider>, { locale: "en", messages: english });
    const panel = screen.getByRole("region", { name: "Memo settings" });
    fireEvent.change(within(panel).getByLabelText("Background color"), { target: { value: "#263c31" } });
    expect(session.getDocument().nodes[0].config).toEqual({ text: "Keep this note", backgroundColor: "#263c31" });
    expect(session.getDocument().nodes[1]).toEqual(document.nodes[1]);
    act(() => { session.select(["a", "b"]); });
    expect(screen.queryByRole("region", { name: "Memo settings" })).not.toBeInTheDocument();
  });

  it("shows local image fit on single selection and updates the preview without editing the graph", () => {
    const session = createSpaceEditorSession({ id: "inspector-images", version: 1, document: graph() });
    const original = session.getDocument(), durable = vi.fn(); session.subscribeDurable(durable);
    const write = vi.spyOn(Storage.prototype, "setItem");
    renderWithIntl(<SpaceEditorProvider session={session}><SpaceNodeInspector /><PreviewProbe nodeId="a" /></SpaceEditorProvider>, { locale: "en", messages: english });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    act(() => { session.select(["a"]); });
    const inspector = screen.getByRole("region", { name: "Image view settings" });
    expect(within(inspector).getByText("Image fit")).toBeVisible();
    expect(within(inspector).getByRole("radiogroup", { name: "Image fit" })).toBeVisible();
    expect(within(inspector).getByRole("radio", { name: "Cover" })).toBeChecked();
    expect(within(inspector).queryByRole("tab")).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(within(inspector).getByRole("radio", { name: "Contain" }));
    expect(screen.getByLabelText("Image a fit")).toHaveTextContent("contain");
    act(() => { session.select(["b"]); });
    expect(screen.getByRole("radio", { name: "Cover" })).toBeChecked();
    act(() => { session.select(["a", "b"]); });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    act(() => { session.select(["a"]); });
    expect(screen.getByRole("radio", { name: "Contain" })).toBeChecked();
    expect(session.getDocument()).toBe(original); expect(durable).not.toHaveBeenCalled();
  });

  it("labels Korean view settings and disables changes in a read-only Space", () => {
    const session = createSpaceEditorSession({ id: "inspector-readonly", version: 1, writable: false, document: graph() });
    session.select(["a"]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    renderWithIntl(<SpaceEditorProvider session={session}><SpaceNodeInspector /></SpaceEditorProvider>);
    const inspector = screen.getByRole("region", { name: "이미지 보기 설정" });
    expect(within(inspector).getByText("이미지 표시")).toBeVisible();
    for (const radio of within(inspector).getAllByRole("radio")) expect(radio).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(inspector).getByRole("radio", { name: "원본 맞춤" }));
    expect(within(inspector).getByRole("radio", { name: "채우기" })).toBeChecked();
    expect(write).not.toHaveBeenCalled();
  });

  it("shows the Assistant output format label and keeps the selector functional", async () => {
    const user = userEvent.setup();
    const session = createSpaceEditorSession({ id: "inspector-assistant", version: 1, document: { ...graph(), nodes: [{
      id: "assistant", kind: "generate.assistant", configVersion: 1, position: { x: 0, y: 0 }, selectedOutputAssetId: null,
      config: { prompt: "Draft", outputMode: "text", modelKey: null },
    }] } });
    session.select(["assistant"]);
    renderWithIntl(<SpaceEditorProvider session={session}><SpaceNodeInspector /></SpaceEditorProvider>, { locale: "en", messages: english });
    const inspector = screen.getByRole("region", { name: "AI Assistant settings" });
    expect(within(inspector).getByText("Output format")).toBeVisible();
    await user.click(within(inspector).getByRole("combobox", { name: "Output format" }));
    await user.click(await screen.findByRole("option", { name: "List" }));
    expect(session.getDocument().nodes[0].config).toMatchObject({ prompt: "Draft", outputMode: "list" });
  });
});
