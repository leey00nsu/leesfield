import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import { createSpaceInputMediaController } from "../../model/space-editor-media";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceInputMediaProvider } from "../space-input-media-provider";
import { SpaceMediaInputNode } from "./space-node-media";

const queries = vi.hoisted(() => ({ assets: new Map<string, MediaAssetDto>(), errors: new Set<string>(), refetch: vi.fn(),
  fit: "cover" as "cover" | "contain",
  picker: null as null | { onSelect: (asset: MediaAssetDto) => void } }));
vi.mock("../space-image-view-settings", () => ({ useSpaceImageFit: () => ({ fit: queries.fit, setFit: vi.fn() }) }));
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({ useMediaAsset: (id: string | null) => ({
  data: id ? queries.assets.get(id) : undefined, isError: Boolean(id && queries.errors.has(id)),
  isLoading: Boolean(id && !queries.assets.has(id)), refetch: queries.refetch,
}) }));
vi.mock("@/features/media-assets/ui/media-asset-picker", () => ({ MediaAssetPicker: (props: {
  open: boolean; writable: boolean; onSelect: (asset: MediaAssetDto) => void; onOpenChange: (value: boolean) => void;
}) => {
  queries.picker = props;
  return props.open ? <div role="dialog" aria-label="Assets"><button type="button" disabled={!props.writable}
    onClick={() => props.onSelect(queries.assets.get("library")!)}>Select library asset</button>
    <button type="button" onClick={() => props.onOpenChange(false)}>Close assets</button></div> : null;
} }));
vi.mock("./space-media-preview", () => ({ SpaceMediaPreview: ({ asset, imageFit, videoInlineOnly }: { asset: MediaAssetDto; imageFit?: "cover" | "contain"; videoInlineOnly?: boolean }) =>
  <div data-testid="preview" data-asset-id={asset.id} data-original-url={asset.url} data-image-fit={imageFit} data-video-inline-only={videoInlineOnly}>{asset.type} preview</div> }));
vi.mock("./space-node-frame", () => ({ SpaceNodeFrame: ({ children, fullBleed, onAspectFit }: {
  children: ReactNode; fullBleed?: boolean; onAspectFit?: () => void;
}) => <section data-testid="frame" data-full-bleed={fullBleed}>{children}{onAspectFit && <button type="button" onClick={onAspectFit}>Fit media</button>}</section> }));

function asset(id: string, type: MediaAssetDto["type"] = "image"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: type === "image" ? "image/jpeg" : `${type}/mp4`,
    bytes: "4", width: type === "audio" ? null : 1280, height: type === "audio" ? null : 720, durationMs: type === "image" ? null : 65_000,
    sourceOperationId: null, url: `https://media.example/${id}`, originalFileName: `${id}.jpg`, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" };
}
function input(id = "input", assetId: string | null = null, kind = "input.image"): CanonicalNode {
  return { id, kind, configVersion: 1, config: { assetId }, position: { x: 0, y: 0 }, selectedOutputAssetId: null };
}
function document(nodes = [input()], edges: SpaceEditorDocument["edges"] = []): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Media inputs", nodes, edges, groups: [] };
}
function mount(doc = document(), options: { writable?: boolean; upload?: (file: File, type: string, signal: AbortSignal) => Promise<MediaAssetDto>; nodeId?: string } = {}) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document: doc, writable: options.writable });
  const scope = createSpaceEditorScope(session);
  const upload = vi.fn(options.upload ?? (async () => asset("uploaded")));
  const controller = createSpaceInputMediaController({ session, inputs: scope.inputs, upload,
    rememberAsset: value => queries.assets.set(value.id, value), errorMessage: () => "Upload failed. Try again." });
  const wrapper = ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;
  const view = render(<SpaceEditorProvider session={session} scope={scope}><SpaceInputMediaProvider controller={controller}>
    <SpaceMediaInputNode nodeId={options.nodeId ?? "input"} />
  </SpaceInputMediaProvider></SpaceEditorProvider>, { wrapper });
  return { ...view, session, scope, controller, upload };
}
function openAssets() {
  fireEvent.click(screen.getByRole("button", { name: "Assets" }));
}
function openUpload() {
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  return screen.getByLabelText("Upload file") as HTMLInputElement;
}
function dropFile(container: HTMLElement, file = new File(["binary"], "replace.jpg", { type: "image/jpeg" })) {
  fireEvent.drop(container.querySelector("[data-space-media-input]")!, { dataTransfer: { types: ["Files"], files: [file] } });
  return file;
}
beforeEach(() => {
  queries.assets.clear(); queries.errors.clear(); queries.refetch.mockClear(); queries.picker = null;
  queries.fit = "cover";
  for (const id of ["local", "remote", "newer", "library", "uploaded"]) queries.assets.set(id, asset(id));
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("SpaceMediaInputNode", () => {
  it("uses canonical connected input, disables local picking, and restores the retained local asset after pause/disconnect", () => {
    const source = input("source", "remote"), local = input("input", "local");
    const view = mount(document([source, local], [{ id: "wire", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "input", targetPortId: "reference", sortOrder: 0 }]));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "remote");
    expect(screen.getByLabelText("Upload file")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    dropFile(view.container); expect(view.upload).not.toHaveBeenCalled();
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "wire", hasPause: true }); });
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(screen.getByLabelText("Upload file")).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "wire", hasPause: false }); });
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "remote");
    act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "wire" }); });
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(view.session.getDocument().nodes[1].config).toMatchObject({ assetId: "local" });
    expect(view.session.getDocument().nodes[0]).toBe(source);
  });

  it("opens Assets directly with a captured expectation and exposes actions again only after X clears the input", () => {
    const view = mount(), capture = vi.spyOn(view.controller, "capture"), select = vi.spyOn(view.controller, "select");
    openAssets(); expect(screen.getByRole("dialog", { name: "Assets" })).toBeInTheDocument();
    const expected = capture.mock.results[0].value;
    fireEvent.click(screen.getByRole("button", { name: "Select library asset" }));
    expect(select).toHaveBeenCalledExactlyOnceWith("input", queries.assets.get("library"), expected);
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "library");
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /replace/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("preview"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(capture).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    openAssets();
    expect(screen.getByRole("dialog", { name: "Assets" })).toBeInTheDocument();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.results[1].value.inputRevision).toBeGreaterThan(expected.inputRevision);
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: null });
    expect(queries.assets.has("library")).toBe(true);
  });

  it("rejects a late asset-dialog callback after the canonical input changes", () => {
    const view = mount(document([input("input", "local")]));
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    openAssets(); const lateSelect = queries.picker!.onSelect;
    act(() => { view.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "newer" } }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => lateSelect(queries.assets.get("library")!));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "newer");
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: "newer" });
  });

  it("uses the expectation captured before the OS file chooser and rejects a file returned after an input change", async () => {
    const view = mount(document([input("input", "local")])), capture = vi.spyOn(view.controller, "capture"), upload = vi.spyOn(view.controller, "upload");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    const picker = openUpload(), expected = capture.mock.results[0].value;
    act(() => { view.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "newer" } }); });
    const file = new File(["binary"], "old-dialog.jpg", { type: "image/jpeg" });
    await act(async () => { fireEvent.change(picker, { target: { files: [file] } }); });
    expect(upload).toHaveBeenCalledExactlyOnceWith("input", file, expected);
    expect(view.upload).not.toHaveBeenCalled();
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "newer");
  });

  it.each(["assets", "upload"] as const)("rejects an old %s callback after switching the Space identity", async action => {
    const view = mount();
    const picker = action === "upload" ? openUpload() : null;
    if (action === "assets") openAssets();
    const lateSelect = queries.picker!.onSelect;
    act(() => view.session.reset({ id: "another-space", version: 1, document: document([input("input", "newer")]) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      if (picker) fireEvent.change(picker, { target: { files: [new File(["binary"], "old-space.jpg", { type: "image/jpeg" })] } });
      else lateSelect(queries.assets.get("library")!);
    });
    expect(view.upload).not.toHaveBeenCalled();
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "newer");
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: "newer" });
  });

  it("passes the original File directly to upload, resets the file input, and restores focus on cancel", async () => {
    const view = mount(), capture = vi.spyOn(view.controller, "capture"), upload = vi.spyOn(view.controller, "upload");
    const picker = openUpload(), expected = capture.mock.results[0].value;
    fireEvent(picker, new Event("cancel", { bubbles: true }));
    expect(screen.getByRole("button", { name: "Upload" })).toHaveFocus();
    const file = new File(["binary"], "original.jpg", { type: "image/jpeg" });
    await act(async () => { fireEvent.change(picker, { target: { files: [file] } }); });
    expect(upload).toHaveBeenCalledExactlyOnceWith("input", file, expected);
    expect(view.upload).toHaveBeenCalledWith(file, "image", expect.any(AbortSignal));
    expect(picker.value).toBe("");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "uploaded");
    fireEvent(picker, new Event("cancel", { bubbles: true }));
    expect(view.container.querySelector("[data-space-media-input]")).toHaveFocus();
  });

  it.each([null, "local"])("keeps the image body draggable and never opens a picker from the body for asset %s", async assetId => {
    const user = userEvent.setup(), view = mount(document([input("input", assetId)]));
    const capture = vi.spyOn(view.controller, "capture"), body = view.container.querySelector("[data-space-media-input]")!;
    expect(body).not.toHaveClass("nodrag", "nopan");
    await user.pointer([
      { keys: "[MouseLeft>]", target: body, coords: { clientX: 20, clientY: 30 } },
      { target: view.container, coords: { clientX: 100, clientY: 65 } },
      { target: body, coords: { clientX: 20, clientY: 30 } },
      { keys: "[/MouseLeft]", target: body, coords: { clientX: 20, clientY: 30 } },
    ]);
    await user.click(body);
    expect(capture).not.toHaveBeenCalled();
    expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId });
    if (assetId) {
      expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    } else {
      const upload = screen.getByRole("button", { name: "Upload" });
      act(() => upload.focus()); await user.keyboard("{Enter}");
      expect(HTMLInputElement.prototype.click).toHaveBeenCalledOnce();
      await user.click(screen.getByRole("button", { name: "Assets" }));
      expect(screen.getByRole("dialog", { name: "Assets" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close assets" }));
      expect(screen.getByRole("button", { name: "Assets" })).toHaveFocus();
    }
  });

  it("shows an indeterminate transfer, aborts on Cancel, and ignores its late asset without deleting the current data", async () => {
    let resolve!: (value: MediaAssetDto) => void, signal!: AbortSignal;
    const view = mount(document([input("input", "local")]), { upload: (_file, _type, abort) => { signal = abort; return new Promise(done => { resolve = done; }); } });
    const file = dropFile(view.container);
    expect(view.upload).toHaveBeenCalledWith(file, "image", expect.any(AbortSignal));
    expect(screen.getByRole("status")).toHaveTextContent("Uploading");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(asset("uploaded")); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(queries.assets.has("local")).toBe(true);
  });

  it("aborts a drop transfer when X clears the input and ignores its late completion", async () => {
    let resolve!: (value: MediaAssetDto) => void, signal!: AbortSignal;
    const view = mount(document([input("input", "local")]), { upload: (_file, _type, abort) => { signal = abort; return new Promise(done => { resolve = done; }); } });
    dropFile(view.container);
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Assets" })).toBeEnabled();
    await act(async () => { resolve(asset("late-drop")); });
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: null });
    expect(queries.assets.has("local")).toBe(true); expect(queries.assets.has("late-drop")).toBe(false);
  });

  it("retains the existing preview after a friendly upload error and retries the same file as a fresh intent", async () => {
    const transfer = vi.fn().mockRejectedValueOnce(new Error("PRIVATE_INTERNAL_UPLOAD_ERROR")).mockResolvedValueOnce(asset("uploaded"));
    const view = mount(document([input("input", "local")]), { upload: transfer });
    const file = dropFile(view.container);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed. Try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE_INTERNAL");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
    expect(transfer).toHaveBeenNthCalledWith(2, file, "image", expect.any(AbortSignal));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "uploaded");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(queries.assets.has("local")).toBe(true);
  });

  it("shows the common centered generation surface immediately for an unbound video capture result", async () => {
    queries.assets.set("video", asset("video", "video"));
    const view = mount(document([input("source", "video", "input.video")]), { nodeId: "source",
      upload: async () => ({ ...asset("local"), mimeType: "image/png" }) });
    let finishDecode!: (frame: { file: File; timestampMs: number }) => void;
    let capture!: Promise<boolean>;
    act(() => { capture = view.controller.captureFrame("source", "video", () => new Promise(resolve => { finishDecode = resolve; })); });
    const resultId = view.session.getDocument().nodes.find(node => node.kind === "input.image")!.id;
    view.rerender(<SpaceEditorProvider session={view.session} scope={view.scope}><SpaceInputMediaProvider controller={view.controller}>
      <SpaceMediaInputNode nodeId={resultId} />
    </SpaceInputMediaProvider></SpaceEditorProvider>);
    expect(view.container.querySelector("[data-space-media-input]")).toHaveAttribute("data-pending", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Generating"); expect(screen.getByTestId("generation-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("status").querySelector("svg.animate-spin")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    await act(async () => { finishDecode({ file: new File(["png"], "frame.png", { type: "image/png" }), timestampMs: 1250 }); expect(await capture).toBe(true); });
    expect(screen.queryByTestId("generation-skeleton")).not.toBeInTheDocument(); expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
  });

  it.each(["image", "audio", "video"] as const)("covers the full %s input while pending and preserves the previous asset on failure or cancel", type => {
    queries.assets.set("local", asset("local", type));
    const result = { ...input("input", "local", `input.${type}`), config: { assetId: "local", resultSource: { nodeId: "producer", executionId: "run", portId: type, index: 0, state: "pending" } } };
    const producer: CanonicalNode = { ...input("producer"), kind: `generate.${type}`, config: { modelKey: null, prompt: "", parameters: {} } };
    const clearLabel = `Remove ${type}`;
    const view = mount(document([producer, result]));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(screen.getByRole("status")).toHaveTextContent("Generating");
    expect(screen.getByTestId("frame")).toHaveAttribute("data-full-bleed", "true");
    expect(screen.getByRole("button", { name: clearLabel })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upload file")).toBeDisabled();
    dropFile(view.container); expect(view.upload).not.toHaveBeenCalled();
    act(() => { view.session.dispatch({ type: "node.config.fields", nodeId: "input", changes: [{ path: ["resultSource", "state"], value: "failed" }] }); });
    expect(screen.getByRole("alert")).toHaveTextContent("The result could not be generated.");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(screen.getByRole("button", { name: clearLabel })).toBeEnabled();
    const execution: NodeExecutionDto = { executionId: "run", executionKind: "generation", mediaType: type, graphNodeId: "producer", status: "processing", progress: 20,
      errorCode: null, modelKey: null, outputAssetIds: [], createdAt: "2026-10-20T00:00:00.000Z" };
    act(() => view.session.patchRuntime("producer", { execution }));
    expect(screen.getByRole("button", { name: clearLabel })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    act(() => view.session.patchRuntime("producer", { execution: { ...execution, executionId: "unrelated-run" } }));
    expect(screen.getByRole("button", { name: clearLabel })).toBeEnabled();
    act(() => { view.session.dispatch({ type: "node.config.fields", nodeId: "input", changes: [{ path: ["resultSource", "state"], value: "cancelled" }] }); });
    expect(screen.getByRole("status")).toHaveTextContent("Generation was cancelled.");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(screen.getByRole("button", { name: clearLabel })).toBeEnabled();
  });

  it("clears all incoming/result/selection references through the controller while preserving source nodes and assets", () => {
    const source = input("source", "remote"), target = { ...input("input", "local"), selectedOutputAssetId: "local",
      config: { assetId: "local", resultSource: { nodeId: "source", executionId: null, portId: "image", index: 0, state: "completed" } } };
    const downstream = input("downstream", "newer");
    const preserved = { id: "outgoing", sourceNodeId: "input", sourcePortId: "image", targetNodeId: "downstream", targetPortId: "reference", sortOrder: 0 };
    const view = mount(document([source, target, downstream], [
      { id: "wire", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "input", targetPortId: "reference", sortOrder: 0 }, preserved,
    ]));
    const clear = vi.spyOn(view.controller, "clear");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(clear).toHaveBeenCalledExactlyOnceWith("input");
    expect(view.session.getDocument().edges).toEqual([preserved]);
    expect(view.session.getDocument().nodes[1]).toMatchObject({ config: { assetId: null }, selectedOutputAssetId: null });
    expect(view.session.getDocument().nodes[1].config).not.toHaveProperty("resultSource");
    expect(view.session.getDocument().nodes[0]).toBe(source);
    expect(view.session.getDocument().nodes[2]).toBe(downstream);
    expect(queries.assets.has("remote")).toBe(true); expect(queries.assets.has("local")).toBe(true);
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Assets" })).toBeEnabled();
  });

  it("keeps an existing asset through query errors, supports query retry, and respects read-only input", () => {
    queries.errors.add("local");
    const view = mount(document([input("input", "local")]), { writable: false });
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "local");
    expect(screen.getByRole("alert")).toHaveTextContent("Assets could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); expect(queries.refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
    dropFile(view.container); expect(view.upload).not.toHaveBeenCalled();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: "local" });
  });

  it("consumes image fit without changing the original asset and keeps image aspect resizing separate from the view preference", () => {
    const view = mount(document([input("input", "local")]));
    expect(screen.getByTestId("frame")).toHaveAttribute("data-full-bleed", "true");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-image-fit", "cover");
    const original = view.session.getDocument();
    queries.fit = "contain";
    act(() => view.session.hover("input"));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-image-fit", "contain");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-original-url", queries.assets.get("local")!.url);
    expect(view.session.getDocument()).toBe(original);
    act(() => view.session.measure("input", { width: 400, height: 400 }));
    fireEvent.click(screen.getByRole("button", { name: "Fit media" }));
    expect(view.session.getSnapshot().geometryByNode.input).toEqual({ width: 400, height: 225 });
    expect(view.session.getDocument().nodes[0].config).toEqual({ assetId: "local" });
  });

  it.each(["image", "audio", "video"] as const)("exposes direct %s Upload/Assets actions and the MIME accept filter by default", type => {
    const view = mount(document([input("input", null, `input.${type}`)]));
    expect(screen.getByTestId("frame")).toHaveAttribute("data-full-bleed", "true");
    expect(view.container.querySelector(`[data-space-media-input="${type}"]`)).toBeInTheDocument();
    const upload = screen.getByRole("button", { name: "Upload" });
    const assets = screen.getByRole("button", { name: "Assets" });
    expect(upload).toBeEnabled(); expect(assets).toBeEnabled();
    expect(upload).toHaveAttribute("data-app-button"); expect(assets).toHaveAttribute("data-app-button");
    expect(screen.getByLabelText("Upload file")).toHaveAttribute("accept", expect.stringContaining(`${type}/`));
    fireEvent.click(assets);
    expect(screen.getByRole("dialog", { name: "Assets" })).toBeInTheDocument();
    expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close assets" }));
    expect(assets).toHaveFocus();
  });

  it.each(["image", "audio", "video"] as const)("disables direct actions for an empty read-only %s input", type => {
    const view = mount(document([input("input", null, `input.${type}`)]), { writable: false });
    const upload = screen.getByRole("button", { name: "Upload" }), assets = screen.getByRole("button", { name: "Assets" });
    expect(upload).toBeDisabled(); expect(assets).toBeDisabled();
    fireEvent.click(upload); fireEvent.click(assets);
    expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upload file")).toBeDisabled();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: null });
  });

  it.each(["image", "audio", "video"] as const)("offers X for an unresolved connected %s and releases only that input without duplicate warnings", type => {
    const source = { ...input("source", null, `generate.${type}`), config: { modelKey: null, prompt: "", parameters: {} } };
    const target = input("input", null, `input.${type}`);
    const edge = { id: "unresolved", sourceNodeId: "source", sourcePortId: type, targetNodeId: "input",
      targetPortId: type === "image" ? "reference" : type, sortOrder: 0 };
    const view = mount(document([source, target], [edge]));
    expect(screen.queryByText("There is no connected saved output.")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for connected image")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Remove ${type}` }));
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.session.getDocument().nodes[0]).toBe(source);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { view.session.undo(); });
    expect(view.session.getDocument().edges).toEqual([edge]);
  });

  it.each(["image", "audio", "video"] as const)("keeps filled %s clicks inert and enables direct actions again after X without deleting assets", async type => {
    const user = userEvent.setup();
    queries.assets.set("library", asset("library", type));
    const view = mount(document([input("input", null, `input.${type}`)]), { upload: async () => asset("uploaded", type) });
    await user.click(screen.getByRole("button", { name: "Upload" }));
    const picker = screen.getByLabelText("Upload file") as HTMLInputElement;
    await user.upload(picker, new File(["binary"], `original.${type === "image" ? "jpg" : type === "audio" ? "mp3" : "mp4"}`,
      { type: type === "image" ? "image/jpeg" : type === "audio" ? "audio/mpeg" : "video/mp4" }));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "uploaded");
    expect(screen.getByTestId("preview")).toHaveAttribute("data-video-inline-only", String(type === "video"));
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    const calls = vi.mocked(HTMLInputElement.prototype.click).mock.calls.length;
    await user.click(screen.getByTestId("preview"));
    expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(calls);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: "uploaded" });
    if (type !== "image") {
      expect(screen.queryByRole("button", { name: "Fit media" })).not.toBeInTheDocument();
      expect(screen.getByTestId("preview")).not.toHaveAttribute("data-image-fit");
    }
    await user.click(screen.getByRole("button", { name: `Remove ${type}` }));
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: null });
    expect(queries.assets.has("uploaded")).toBe(true);
    const upload = screen.getByRole("button", { name: "Upload" });
    await user.click(upload);
    fireEvent(picker, new Event("cancel", { bubbles: true }));
    expect(upload).toHaveFocus();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: null });
    await user.click(screen.getByRole("button", { name: "Assets" }));
    await user.click(screen.getByRole("button", { name: "Select library asset" }));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset-id", "library");
    expect(view.container.querySelector("[data-space-media-input]")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(queries.assets.has("uploaded")).toBe(true);
  });

  it("aborts a pending upload when the editor presenter is disposed", async () => {
    let signal!: AbortSignal, resolve!: (value: MediaAssetDto) => void;
    const view = mount(document([input("input", "local")]), { upload: (_file, _type, abort) => { signal = abort; return new Promise(done => { resolve = done; }); } });
    dropFile(view.container); view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(asset("uploaded")); });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ assetId: "local" });
  });
});
