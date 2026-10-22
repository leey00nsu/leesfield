import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceOutputNode } from "./space-node-output";
const state = vi.hoisted(() => ({ assets: new Map<string, MediaAssetDto>(), openDetail: vi.fn(), errors: new Set<string>(), refetch: vi.fn(), pointer: vi.fn(), key: vi.fn(), click: vi.fn() }));
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({ useMediaAsset: (id: string | null) => ({ data: id ? state.assets.get(id) : undefined, isError: Boolean(id && state.errors.has(id)), refetch: state.refetch }) }));
vi.mock("./space-node-frame", () => ({ SpaceNodeFrame: ({ children, onAspectFit }: { children: ReactNode; onAspectFit?: () => void }) =>
  <section data-space-node="output" onPointerDown={state.pointer} onKeyDown={state.key} onClick={state.click}>{children}{onAspectFit && <button onClick={onAspectFit}>Fit</button>}</section> }));
function node(id: string, kind: string, config: CanonicalNode["config"]): CanonicalNode { return { id, kind, configVersion: 1, config, position: { x: 0, y: 0 }, selectedOutputAssetId: null }; }
function fixture(mediaType?: string): SpaceEditorDocument {
  const nodes = [node("image", "input.image", { assetId: "image" }), node("video", "input.video", { assetId: "video" }), node("audio", "input.audio", { assetId: "audio" }), node("output", "output.single", { mediaType: mediaType ?? null })];
  return { schemaVersion: 3, title: "Output", groups: [], nodes, edges: ["image", "video", "audio"].map(type => ({ id: type, sourceNodeId: type, sourcePortId: type, targetNodeId: "output", targetPortId: type, sortOrder: 0 })) };
}
function mount(mediaType?: string, writable = true, document = fixture(mediaType)) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document, writable }), scope = createSpaceEditorScope(session, { services: { openMediaDetail: state.openDetail } });
  const view = render(<NextIntlClientProvider locale="en" messages={messages}><SpaceEditorProvider session={session} scope={scope} services={{ openMediaDetail: state.openDetail }}><SpaceOutputNode nodeId="output" /></SpaceEditorProvider></NextIntlClientProvider>);
  return { ...view, session, scope };
}
function expectDetailFor(type: string) {
  const button = screen.getByRole("button", { name: "View details" });
  fireEvent.click(button);
  expect(state.openDetail).toHaveBeenLastCalledWith("output", state.assets.get(type), button, expect.any(Function));
  act(() => state.openDetail.mock.lastCall![3]());
  expect(button).not.toHaveAttribute("href");
}
beforeEach(() => {
  state.assets.clear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  for (const type of ["image", "video", "audio"] as const) state.assets.set(type, { id: type, version: 1, type, status: "completed", origin: "upload", mimeType: `${type}/test`, bytes: "123", width: 1280, height: 720, durationMs: null, sourceOperationId: null, url: `https://media.example/${type}`, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" });
});
afterEach(() => { cleanup(); state.errors.clear(); vi.clearAllMocks(); vi.restoreAllMocks(); });
it.each(["image", "video", "audio"])("displays only configured %s without running or changing the graph", type => {
  const view = mount(type), before = view.session.getDocument();
  expectDetailFor((`https://media.example/${type}`).split("/").at(-1)!);
  expect(screen.getByRole("link", { name: `Download ${type}` })).toHaveAttribute("href", `/api/media-assets/${type}/download`);
  expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  expect(view.session.getDocument()).toBe(before);
  expect(view.scope.view.getState().videoPreviewByNode.get("output")?.asset?.id).toBe(type === "video" ? "video" : undefined);
  if (type === "video") expect(view.scope.view.getState().videoPreviewByNode.get("output")?.getVideo()).toBe(view.container.querySelector("video"));
  expect(screen.queryByRole("button", { name: "Capture frame" })).not.toBeInTheDocument();
});
it("uses priority for mixed inputs, follows pause/disconnect and never mutates source data", () => {
  const view = mount(), originals = view.session.getDocument().nodes.slice(0, 3);
  expectDetailFor(("https://media.example/audio").split("/").at(-1)!);
  expect(view.scope.view.getState().videoPreviewByNode.size).toBe(0);
  act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "audio", hasPause: true }); });
  expectDetailFor(("https://media.example/video").split("/").at(-1)!);
  expect(view.scope.view.getState().videoPreviewByNode.get("output")?.asset?.id).toBe("video");
  act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "video" }); });
  expectDetailFor(("https://media.example/image").split("/").at(-1)!);
  expect(view.scope.view.getState().videoPreviewByNode.size).toBe(0);
  expect(view.session.getDocument().nodes.slice(0, 3)).toEqual(originals);
});
it("does not silently show another type after the chosen port empties", () => {
  const view = mount("video"); act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "video" }); });
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument(); expect(screen.getByRole("status")).toHaveTextContent("Connect input");
});
it.each(["image", "video", "audio"])("detaches only the visible %s input and preserves original assets and other consumers", type => {
  const document = fixture(type), sibling = node("sibling", "output.single", { mediaType: type });
  document.nodes.push(sibling);
  document.edges.push({ id: "sibling-wire", sourceNodeId: type, sourcePortId: type, targetNodeId: sibling.id, targetPortId: type, sortOrder: 0 });
  const view = mount(type, true, document), original = view.session.getDocument(), history = view.session.getSnapshot().history.undo.length;
  fireEvent.click(screen.getByRole("button", { name: `Remove ${type}` }));
  const cleared = view.session.getDocument();
  expect(cleared.edges).toEqual(original.edges.filter(edge => edge.id !== type));
  expect(cleared.nodes).toBe(original.nodes);
  expect(state.assets.has(type)).toBe(true);
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Connect input");
  expect(view.container.querySelector("[data-space-output]")).toHaveFocus();
  expect(view.scope.inputs.inputAssetId("sibling", type)).toBe(type);
  expect(view.session.getSnapshot().history.undo).toHaveLength(history + 1);
  act(() => { expect(view.session.undo().ok).toBe(true); });
  expect(view.session.getDocument()).toEqual(original);
  expectDetailFor((`https://media.example/${type}`).split("/").at(-1)!);
});
it("clears an automatic output without falling through to hidden media, including after reload and redo", () => {
  const view = mount(), original = view.session.getDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove audio" }));
  const cleared = view.session.getDocument();
  expect(cleared.edges).toEqual(original.edges.filter(edge => edge.id !== "audio"));
  expect(cleared.nodes.find(item => item.id === "output")?.config).toMatchObject({ mediaType: "audio" });
  expect(cleared.nodes.slice(0, 3)).toEqual(original.nodes.slice(0, 3));
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  act(() => { view.session.undo(); });
  expect(view.session.getDocument()).toEqual(original);
  expectDetailFor(("https://media.example/audio").split("/").at(-1)!);
  act(() => { view.session.redo(); });
  expect(view.session.getDocument()).toEqual(cleared);
  view.unmount();
  mount(undefined, true, cleared);
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Connect input");
});
it("leaves paused and lower-priority wires untouched when clearing the active source", () => {
  const document = fixture(); document.edges.find(edge => edge.id === "audio")!.hasPause = true;
  const view = mount(undefined, true, document), original = view.session.getDocument();
  expectDetailFor(("https://media.example/video").split("/").at(-1)!);
  fireEvent.click(screen.getByRole("button", { name: "Remove video" }));
  expect(view.session.getDocument().edges).toEqual(original.edges.filter(edge => edge.id !== "video"));
  expect(view.session.getDocument().edges.find(edge => edge.id === "audio")).toBe(original.edges.find(edge => edge.id === "audio"));
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
});
it("keeps an execution-bound input, producer representative and other downstream binding after detach and a late result", () => {
  const document = fixture("image"), input = document.nodes[0];
  input.config = { assetId: "image", resultSource: { nodeId: "producer", executionId: "run", portId: "image", index: 0, state: "completed" } };
  document.nodes.push({ ...node("producer", "generate.image", { modelKey: null, prompt: "", parameters: {} }), selectedOutputAssetId: "new-result" }, node("sibling", "output.single", { mediaType: "image" }));
  document.edges.push({ id: "producer-wire", sourceNodeId: "producer", sourcePortId: "image", targetNodeId: "image", targetPortId: "reference", sortOrder: 0 },
    { id: "sibling-wire", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "sibling", targetPortId: "image", sortOrder: 0 });
  const view = mount("image", true, document), original = view.session.getDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
  expect(view.session.getDocument().nodes).toBe(original.nodes);
  expect(view.session.getDocument().edges).toEqual(original.edges.filter(edge => edge.id !== "image"));
  act(() => { view.session.applySystemTransaction(current => ({ ...current, nodes: current.nodes.map(item => item.id === "producer" ? { ...item, selectedOutputAssetId: "late-result" } : item) })); });
  expect(view.scope.inputs.sourceAssetIds("image", "image")).toEqual(["image"]);
  expect(view.scope.inputs.inputAssetId("sibling", "image")).toBe("image");
  expect(view.session.getSnapshot().nodeById.get("producer")?.selectedOutputAssetId).toBe("late-result");
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
});
it.each([false, true])("allows detaching before the asset finishes loading, including failed queries (%s)", failed => {
  const asset = state.assets.get("image")!; state.assets.delete("image");
  if (failed) state.errors.add("image");
  const view = mount("image");
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
  act(() => { state.assets.set("image", asset); view.session.hover("output"); });
  expect(view.session.getDocument().edges.some(edge => edge.id === "image")).toBe(false);
  expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Connect input");
});
it.each(["image", "video", "audio"])("keeps %s Open/Download available while disabling detach in readonly mode", type => {
  const view = mount(type, false), before = view.session.getDocument(), remove = screen.getByRole("button", { name: `Remove ${type}` });
  expectDetailFor((`https://media.example/${type}`).split("/").at(-1)!);
  expect(screen.getByRole("link", { name: `Download ${type}` })).toHaveAttribute("href", `/api/media-assets/${type}/download`);
  expect(remove).toBeDisabled(); fireEvent.click(remove);
  expect(view.session.getDocument()).toBe(before);
});
it.each(["{Enter}", " "])("supports keyboard detach with %s without leaking canvas actions", async key => {
  const user = userEvent.setup(), view = mount("image"), remove = screen.getByRole("button", { name: "Remove image" });
  remove.focus(); await user.keyboard(key);
  expect(view.session.getDocument().edges.some(edge => edge.id === "image")).toBe(false);
  expect(view.container.querySelector("[data-space-output]")).toHaveFocus();
  expect(state.key).not.toHaveBeenCalled(); expect(state.click).not.toHaveBeenCalled();
});
it("isolates the X pointer action from the node body", () => {
  const view = mount("video"), remove = screen.getByRole("button", { name: "Remove video" });
  fireEvent.pointerDown(remove); fireEvent.click(remove);
  expect(view.session.getDocument().edges.some(edge => edge.id === "video")).toBe(false);
  expect(state.pointer).not.toHaveBeenCalled(); expect(state.click).not.toHaveBeenCalled();
});
it("rejects a stale X after its source is replaced with the same asset on a different wire", () => {
  const view = mount("image"), remove = screen.getByRole("button", { name: "Remove image" });
  act(() => {
    expect(view.session.dispatch({ type: "edge.replace", edgeId: "image", edge: { id: "replacement", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "output", targetPortId: "image" } }).ok).toBe(true);
    fireEvent.click(remove);
  });
  expect(view.session.getDocument().edges.some(edge => edge.id === "replacement")).toBe(true);
  expectDetailFor(("https://media.example/image").split("/").at(-1)!);
});
it("rejects a stale X after an output changes to a different media type", () => {
  const view = mount(), remove = screen.getByRole("button", { name: "Remove audio" });
  act(() => { view.session.dispatch({ type: "node.config.patch", nodeId: "output", patch: { mediaType: "video" } }); fireEvent.click(remove); });
  expect(view.session.getDocument().edges).toHaveLength(3);
  expectDetailFor(("https://media.example/video").split("/").at(-1)!);
});
it("rejects a stale X across a disconnect/undo cycle or Space reset", () => {
  const view = mount("image"), original = view.session.getDocument(), remove = screen.getByRole("button", { name: "Remove image" });
  act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "image" }); view.session.undo(); fireEvent.click(remove); });
  expect(view.session.getDocument()).toEqual(original);
  const nextRemove = screen.getByRole("button", { name: "Remove image" });
  act(() => { view.session.reset({ id: "another-space", version: 1, document: original }); fireEvent.click(nextRemove); });
  expect(view.session.getSnapshot().id).toBe("another-space"); expect(view.session.getDocument()).toEqual(original);
});
it.each(["readonly", "deleted", "disposed"])("rejects a stale X once the editor is %s", condition => {
  const view = mount("image"), remove = screen.getByRole("button", { name: "Remove image" });
  act(() => {
    if (condition === "readonly") view.session.setAccess(false);
    else if (condition === "deleted") view.session.dispatch({ type: "node.remove", nodeId: "output" });
    else view.session.dispose();
    const before = view.session.getDocument(); fireEvent.click(remove); expect(view.session.getDocument()).toBe(before);
  });
});
it("retries asset failures without changing selection or starting execution", () => {
  state.errors.add("image"); mount("image"); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
