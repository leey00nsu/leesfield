import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { GeneratedResultGalleryItem } from "@/shared/generation-graph/node-registry";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { spaceFilmstripScheduler, type SpaceFilmstripResult } from "../../lib/space-filmstrip";
import type { SpaceInputRuntime } from "../../model/space-editor-inputs";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceGalleryNode } from "./space-node-gallery";

const mocks = vi.hoisted(() => ({ getAsset: vi.fn(), getUsage: vi.fn(), patch: vi.fn(), deleteAsset: vi.fn(), poster: vi.fn(), releasePoster: vi.fn(), waveform: vi.fn() }));
vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  getMediaAsset: mocks.getAsset, getAssetUsage: mocks.getUsage, getAssetProjects: async () => [],
  patchAssetMetadata: mocks.patch, deleteMediaAsset: mocks.deleteAsset,
}));
vi.mock("@/shared/ui/use-audio-waveform", async importOriginal => ({
  ...await importOriginal<typeof import("@/shared/ui/use-audio-waveform")>(),
  useAudioWaveform: (...args: unknown[]) => { mocks.waveform(...args); return { state: "ready", duration: 8, peaks: [0.2, 0.8, 0.4] }; },
}));
vi.mock("../../hook/use-space-preferences", () => ({ useSpacePreferences: () => undefined }));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => () => {},
  Handle: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-space-port={props["data-space-port" as keyof typeof props]}>{children}</div>,
}));
vi.mock("../../lib/space-filmstrip", async importOriginal => {
  const actual = await importOriginal<typeof import("../../lib/space-filmstrip")>();
  return { ...actual, spaceFilmstripScheduler: actual.createSpaceFilmstripScheduler(mocks.poster) };
});

class Visibility {
  static all = new Set<Visibility>();
  target: Element | null = null;
  constructor(private callback: IntersectionObserverCallback) { Visibility.all.add(this); }
  observe(element: Element) { this.target = element; }
  disconnect() { this.target = null; Visibility.all.delete(this); }
  static emit(element: Element, isIntersecting: boolean) {
    for (const observer of Visibility.all) if (observer.target === element) observer.callback([{ isIntersecting } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
  }
}
function node(id: string, kind: string, config: CanonicalNode["config"] = {}): CanonicalNode {
  return { id, kind, configVersion: 1, config, position: { x: 10, y: 20 }, selectedOutputAssetId: null };
}
function input(id: string, assetId: string, type: MediaAssetDto["type"] = "image") { return node(id, `input.${type}`, { assetId }); }
function edge(id: string, sourceNodeId: string, type: MediaAssetDto["type"], sortOrder = 0, sourcePortId: string = type): CanonicalEdge {
  return { id, sourceNodeId, sourcePortId, targetNodeId: "gallery", targetPortId: type, sortOrder };
}
function resultItem(id: string, patch: Partial<GeneratedResultGalleryItem> = {}): GeneratedResultGalleryItem {
  return { id, nodeId: "producer", executionId: "accepted-old", portId: "image", index: 0, state: "completed", mediaType: "image", assetId: "a", ...patch };
}
function asset(id: string, type: MediaAssetDto["type"] = "image"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: type === "image" ? "image/png" : type === "video" ? "video/mp4" : "audio/mpeg",
    bytes: "4", width: 800, height: 600, durationMs: 8_000, sourceOperationId: null, url: `https://media.example/${id}`,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", originalFileName: `${id}.original.${type === "image" ? "png" : type === "video" ? "mp4" : "mp3"}` };
}
function mixed(): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Mixed Gallery", groups: [], nodes: [node("gallery", "output.gallery", { mediaType: "video" }),
    input("image-a", "a"), input("image-b", "b"), input("duplicate-a", "a"), input("video", "v", "video"), input("audio", "sound", "audio"), input("paused", "hidden")],
    edges: [edge("video", "video", "video", 1), edge("audio", "audio", "audio", 0), edge("image-a", "image-a", "image", 20),
      edge("image-b", "image-b", "image", 10), edge("duplicate-a", "duplicate-a", "image", 30), { ...edge("paused", "paused", "image", 0), hasPause: true }] };
}
const clients: QueryClient[] = [];
const assets = new Map<string, MediaAssetDto>();
const failures = new Set<string>();
function mount(document = mixed(), options: { writable?: boolean; inputRuntime?: SpaceInputRuntime } = {}) {
  let serial = 0, inputRuntime = options.inputRuntime ?? {};
  const session = createSpaceEditorSession({ id: "space", version: 1, document, writable: options.writable }, { createId: () => `extracted-${++serial}` });
  const onError = vi.fn(), runNode = vi.fn(), services = { onError, runNode };
  const catalog = { imageModels: [], isLoading: false, error: null, retry: vi.fn() };
  const scope = createSpaceEditorScope(session, { services, catalog, inputRuntime });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } }); clients.push(client);
  const tree = () => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><QueryClientProvider client={client}>
    <SpaceEditorProvider session={session} scope={scope} catalog={catalog} services={services} inputRuntime={inputRuntime}><SpaceGalleryNode nodeId="gallery" /></SpaceEditorProvider>
  </QueryClientProvider></NextIntlClientProvider>;
  const result = render(tree());
  // Controls are exercised after real body entry; Shell/browser suites cover the first click.
  const body = result.container.querySelector("[data-space-node-body]");
  if (body) fireEvent.click(body);
  return { ...result, session, scope, client, onError, runNode, document,
    setRuntime: (runtime: SpaceInputRuntime) => { inputRuntime = runtime; result.rerender(tree()); } };
}
function visible(container: HTMLElement) { return [...container.querySelectorAll<HTMLElement>("[data-gallery-asset]")].map(element => [element.dataset.galleryType, element.dataset.galleryAsset]); }
function tile(container: HTMLElement, id: string, occurrence = 0) { return container.querySelectorAll<HTMLElement>(`[data-gallery-asset="${id}"]`)[occurrence]; }
function open(container: HTMLElement, id: string, occurrence = 0) { const button = within(tile(container, id, occurrence)).getByRole("button", { name: /View full size/ }); fireEvent.click(button); return button; }

beforeEach(() => {
  mocks.getAsset.mockReset(); mocks.poster.mockReset(); mocks.releasePoster.mockReset(); assets.clear(); failures.clear(); Visibility.all.clear();
  mocks.getUsage.mockReset(); mocks.patch.mockReset(); mocks.deleteAsset.mockReset();
  mocks.waveform.mockClear();
  mocks.getUsage.mockResolvedValue({ graphIds: [], operationIds: [], generationRequestIds: [], generations: [], provenance: [], inUse: true });
  mocks.patch.mockImplementation(async (id: string, patch: Partial<MediaAssetDto>) => {
    const updated = { ...assets.get(id)!, ...patch, version: assets.get(id)!.version + 1 };
    assets.set(id, updated); return updated;
  });
  for (const id of ["a", "b", "c", "hidden", "frame-start", "frame-end"]) assets.set(id, asset(id));
  assets.set("v", asset("v", "video")); assets.set("sound", asset("sound", "audio"));
  mocks.getAsset.mockImplementation(async (id: string) => { if (failures.has(id) || !assets.has(id)) throw new Error("ASSET_UNAVAILABLE"); return assets.get(id)!; });
  mocks.poster.mockImplementation(async (value: MediaAssetDto) => ({ images: [`blob:poster-${value.id}`], bitmapBytes: 160 * 90 * 4, release: mocks.releasePoster }));
  vi.stubGlobal("IntersectionObserver", Visibility);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(async () => {
  cleanup(); for (const client of clients.splice(0)) client.clear(); spaceFilmstripScheduler.clear();
  await waitFor(() => expect(spaceFilmstripScheduler.stats().running).toBe(0));
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("native Output Gallery", () => {
  it("renders a silent audio waveform only with visible decode demand and owned asset binding", async () => {
    const view = mount();
    const audioTile = tile(view.container, "sound");
    await waitFor(() => expect(audioTile.querySelector('[data-app-audio-waveform="ready"] path')).not.toBeNull());
    expect(mocks.waveform).toHaveBeenLastCalledWith(assets.get("sound")!.url, assets.get("sound"), false);
    expect(audioTile.querySelector("audio, video, .lucide-music-2")).toBeNull();
    act(() => Visibility.emit(audioTile, true));
    expect(mocks.waveform).toHaveBeenLastCalledWith(assets.get("sound")!.url, assets.get("sound"), true);
    act(() => Visibility.emit(audioTile, false));
    expect(mocks.waveform).toHaveBeenLastCalledWith(assets.get("sound")!.url, assets.get("sound"), false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(view.session.getDocument()).toBe(view.document);
  });

  it("places Clear all before the rightmost Extract and clears connections in one undo step without deleting sources or assets", async () => {
    const view = mount(), before = view.session.getDocument(), durable = vi.fn();
    view.session.subscribeDurable(durable);
    await screen.findByAltText("b.original.png");
    const toolbar = screen.getByRole("button", { name: "Clear all" }).parentElement!;
    expect(within(toolbar).getAllByRole("button").map(button => button.textContent)).toEqual(["Clear all", "Extract"]);
    expect(screen.queryByRole("button", { name: "Clear gallery" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(visible(view.container)).toEqual([]);
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.session.getDocument().nodes.slice(1)).toEqual(before.nodes.slice(1));
    expect(durable).toHaveBeenCalledOnce();
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
    act(() => { view.session.undo(); });
    expect(view.session.getDocument()).toEqual(before);
    expect(visible(view.container)).toHaveLength(5);
  });

  it("keeps image/video/audio order, edge ordering and duplicates while sharing detail queries", async () => {
    const view = mount();
    expect(visible(view.container)).toEqual([["image", "b"], ["image", "a"], ["image", "a"], ["video", "v"], ["audio", "sound"]]);
    expect(screen.getByText("5 items")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAsset).toHaveBeenCalledTimes(4));
    expect(mocks.getAsset.mock.calls.map(call => call[0]).sort()).toEqual(["a", "b", "sound", "v"]);
    await screen.findByAltText("b.original.png");
    expect(view.container.querySelectorAll("video, audio")).toHaveLength(0);
    expect(mocks.poster).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('[data-space-port="image"], [data-space-port="video"], [data-space-port="audio"]')).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Run|ZIP/ })).not.toBeInTheDocument();
    expect(view.runNode).not.toHaveBeenCalled(); expect(view.session.getDocument()).toBe(view.document);
    expect(view.session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("resolves ordered collections and separate canonical frame ports, including repeated collection assets", async () => {
    const collection = { ...node("collection", "edit.image.splitGrid", { parameters: {} }), selectedOutputAssetId: "a" };
    const frames = { ...node("frames", "edit.video.extractFrames", { parameters: {} }), selectedOutputAssetId: "frame-start" };
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Ports", groups: [], nodes: [node("gallery", "output.gallery", { mediaType: null }), collection, frames],
      edges: [edge("collection", "collection", "image", 20, "images"), edge("end", "frames", "image", 10, "endFrame")] };
    const view = mount(document, { inputRuntime: { mediaOutputs: new Map([
      ["collection", [{ portId: "images", assetId: "a", sortOrder: 2 }, { portId: "images", assetId: "b", sortOrder: 0 }, { portId: "images", assetId: "a", sortOrder: 3 }]],
      ["frames", [{ portId: "startFrame", assetId: "frame-start", sortOrder: 0 }]],
    ]) } });
    expect(visible(view.container)).toEqual([["image", "b"], ["image", "a"], ["image", "a"]]);
    view.setRuntime({ mediaOutputs: new Map([
      ["collection", [{ portId: "images", assetId: "a", sortOrder: 2 }, { portId: "images", assetId: "b", sortOrder: 0 }, { portId: "images", assetId: "a", sortOrder: 3 }]],
      ["frames", [{ portId: "startFrame", assetId: "frame-start", sortOrder: 0 }, { portId: "endFrame", assetId: "frame-end", sortOrder: 0 }]],
    ]) });
    expect(visible(view.container)).toEqual([["image", "frame-end"], ["image", "b"], ["image", "a"], ["image", "a"]]);
    await screen.findByAltText("frame-end.original.png");
    expect(view.session.getDocument()).toBe(document); expect(view.runNode).not.toHaveBeenCalled();
  });

  it("keeps an older Gallery's completed assets when its producer is selected or starts a newer execution", async () => {
    const producer = { ...node("producer", "generate.image", { prompt: "", modelKey: null, parameters: {} }), selectedOutputAssetId: "c" };
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Frozen execution", groups: [], nodes: [
      node("gallery", "output.gallery", { mediaType: null, resultItems: [resultItem("first"), resultItem("second", { index: 1, assetId: "b" })] }), producer,
    ], edges: [edge("producer", "producer", "image")] };
    const view = mount(document);
    await screen.findByAltText("a.original.png");
    act(() => {
      expect(view.session.dispatch({ type: "output.select", nodeId: "producer", assetId: "hidden" }).ok).toBe(true);
      view.session.setRuntime("producer", { submissionPending: true, execution: { executionId: "accepted-new", graphNodeId: "producer", executionKind: "generation",
        mediaType: "image", status: "processing", progress: 0, errorCode: null, modelKey: null, outputAssetIds: [], createdAt: "2026-10-21T00:00:00Z" } });
    });
    view.setRuntime({ mediaOutputs: new Map([["producer", [{ portId: "image", assetId: "c", sortOrder: 0 }]]]) });
    expect(visible(view.container)).toEqual([["image", "a"], ["image", "b"]]);
    expect(view.container.querySelector("[data-space-gallery] [data-testid='generation-skeleton']")).not.toBeInTheDocument();
    expect(mocks.getAsset.mock.calls.map(call => call[0]).sort()).toEqual(["a", "b"]);
    open(view.container, "b");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByAltText("b.original.png");
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/media-assets/b/download");
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("shows all reserved slots inside an empty pending Gallery without using the producer's previous result", () => {
    const resultItems = Array.from({ length: 3 }, (_, index) => resultItem(`pending-${index}`, { executionId: null, index, state: "pending", assetId: null }));
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Pending Gallery", groups: [], nodes: [
      node("gallery", "output.gallery", { mediaType: null, resultItems }),
      { ...node("producer", "generate.image", { prompt: "", modelKey: null, parameters: {} }), selectedOutputAssetId: "a" },
    ], edges: [edge("producer", "producer", "image")] };
    const view = mount(document);
    expect(visible(view.container)).toEqual([]);
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getAllByTestId("generation-skeleton")).toHaveLength(3);
    expect(view.container.querySelectorAll('[data-gallery-state="pending"][aria-busy="true"]')).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Extract" })).toBeDisabled();
    expect(screen.queryByText("Connect image, video, or audio nodes to view gallery")).not.toBeInTheDocument();
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(view.session.getDocument()).toBe(document); expect(view.session.getDocument().nodes).toHaveLength(2);
  });

  it("keeps snapshot slot order, partial failures, duplicates and manual inputs through reconciliation, lightbox actions and extraction", async () => {
    const resultItems = [resultItem("pending", { state: "pending", assetId: null }),
      resultItem("audio", { mediaType: "audio", portId: "audio", assetId: "sound" }),
      resultItem("failed", { index: 2, state: "failed", assetId: null }), resultItem("first", { index: 3 }),
      resultItem("cancelled", { mediaType: "video", portId: "video", state: "cancelled", assetId: null }),
      resultItem("duplicate", { index: 5 }), resultItem("excluded", { index: 6, assetId: "b" })];
    // Completed results remain owned by the Gallery after reload without a producer or reference edge.
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Partial Gallery", groups: [], nodes: [
      node("gallery", "output.gallery", { mediaType: null, resultItems, excludedAssetIds: ["b"] }), input("manual-image", "a"), input("manual-video", "v", "video"),
    ], edges: [edge("manual-image", "manual-image", "image"), edge("manual-video", "manual-video", "video")] };
    const view = mount(document);
    const slots = () => [...view.container.querySelectorAll<HTMLElement>("[data-gallery-result], [data-gallery-asset]")]
      .map(element => element.dataset.galleryResult ?? element.dataset.galleryAsset);
    expect(slots()).toEqual(["pending", "audio", "failed", "first", "cancelled", "duplicate", "a", "v"]);
    expect(visible(view.container)).toEqual([["audio", "sound"], ["image", "a"], ["image", "a"], ["image", "a"], ["video", "v"]]);
    expect(screen.getByText("8 items")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The result could not be generated.");
    expect(screen.getByText("Generation was cancelled.")).toBeInTheDocument();
    expect(view.session.getDocument()).toBe(document);
    open(view.container, "a");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByAltText("a.original.png");
    expect(within(dialog).getByText("2 / 5")).toBeInTheDocument();
    const reconciled = resultItems.map(item => item.id === "pending" ? { ...item, state: "completed" as const, assetId: "c" } : item);
    act(() => { expect(view.session.dispatch({ type: "node.config.patch", nodeId: "gallery", patch: { resultItems: reconciled } }).ok).toBe(true); });
    expect(slots()).toEqual(["pending", "audio", "failed", "first", "cancelled", "duplicate", "a", "v"]);
    expect(within(dialog).getByText("3 / 6")).toBeInTheDocument();
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://media.example/a");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    expect(view.session.getDocument().nodes.slice(document.nodes.length).map(item => [item.kind, item.config])).toEqual([
      ["input.image", { assetId: "c" }], ["input.audio", { assetId: "sound" }], ["input.image", { assetId: "a" }],
      ["input.image", { assetId: "a" }], ["input.image", { assetId: "a" }], ["input.video", { assetId: "v" }],
    ]);
    open(view.container, "a");
    const reopened = await screen.findByRole("dialog");
    fireEvent.click(within(reopened).getByRole("button", { name: "Remove" }));
    expect(visible(view.container)).toEqual([["image", "c"], ["audio", "sound"], ["image", "a"], ["image", "a"], ["video", "v"]]);
    expect(view.container.querySelectorAll("[data-gallery-state]")).toHaveLength(2);
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ resultItems: reconciled.filter(item => item.id !== "first"), excludedAssetIds: ["b"] });
    expect(view.session.getDocument().edges).toBe(document.edges); expect(view.runNode).not.toHaveBeenCalled();
    const saved = view.session.getDocument(); view.unmount();
    const reentered = mount(saved);
    expect(visible(reentered.container)).toEqual([["image", "c"], ["audio", "sound"], ["image", "a"], ["image", "a"], ["video", "v"]]);
    expect(reentered.container.querySelectorAll("[data-gallery-state]")).toHaveLength(2);
    expect(reentered.session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("honors persisted exclusions on entry and after remount without deleting source data", () => {
    const document = mixed(); document.nodes[0] = { ...document.nodes[0], config: { mediaType: null, excludedAssetIds: ["a"] } };
    const first = mount(document);
    expect(visible(first.container)).toEqual([["image", "b"], ["video", "v"], ["audio", "sound"]]);
    first.unmount();
    const second = mount(first.session.getDocument());
    expect(visible(second.container)).toEqual([["image", "b"], ["video", "v"], ["audio", "sound"]]);
    expect(second.session.getDocument().nodes).toHaveLength(7); expect(second.session.getDocument().edges).toBe(document.edges);
  });

  it("merges removal with the latest document, disconnects only the clicked duplicate and makes one undo entry", async () => {
    const view = mount(); open(view.container, "a");
    const dialog = await screen.findByRole("dialog", { name: "Output Gallery" });
    const remove = within(dialog).getByRole("button", { name: "Remove" });
    act(() => {
      view.session.dispatch({ type: "node.config.patch", nodeId: "gallery", patch: { mediaType: "audio", excludedAssetIds: ["b"], presentation: { customTitle: "Latest", comment: "Keep comment" } } });
      view.session.dispatch({ type: "node.move", nodeId: "gallery", position: { x: 500, y: 700 } });
      fireEvent.click(remove);
    });
    expect(view.session.getDocument().nodes[0]).toMatchObject({ position: { x: 500, y: 700 }, config: { mediaType: "audio", excludedAssetIds: ["b"], presentation: { customTitle: "Latest", comment: "Keep comment" } } });
    expect(visible(view.container)).toEqual([["image", "a"], ["video", "v"], ["audio", "sound"]]);
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    expect(view.session.getDocument().nodes.slice(1)).toEqual(view.document.nodes.slice(1));
    expect(view.session.getDocument().edges).toEqual(view.document.edges.filter(edge => edge.id !== "image-a"));
    expect(view.session.getSnapshot().history.undo).toHaveLength(3);
    act(() => { view.session.undo(); });
    expect(view.session.getDocument().nodes[0]).toMatchObject({ position: { x: 500, y: 700 }, config: { excludedAssetIds: ["b"], presentation: { comment: "Keep comment" } } });
    expect(visible(view.container)).toHaveLength(4);
  });

  it("extracts the latest displayed entries in one atomic undo with measured geometry and media spacing", () => {
    const document = mixed(); document.nodes.push(input("second-audio", "sound", "audio")); document.edges.push(edge("second-audio", "second-audio", "audio", 10));
    const view = mount(document), extract = screen.getByRole("button", { name: "Extract" });
    act(() => {
      view.session.dispatch({ type: "node.config.patch", nodeId: "gallery", patch: { excludedAssetIds: ["b"], presentation: { comment: "Keep me" } } });
      view.session.dispatch({ type: "node.move", nodeId: "gallery", position: { x: 500, y: 700 } });
      view.session.measure("gallery", { width: 440, height: 400 });
      fireEvent.click(extract);
    });
    const added = view.session.getDocument().nodes.slice(document.nodes.length);
    expect(added.map(value => [value.kind, value.config, value.position])).toEqual([
      ["input.image", { assetId: "a" }, { x: 1040, y: 700 }], ["input.image", { assetId: "a" }, { x: 1040, y: 1060 }],
      ["input.video", { assetId: "v" }, { x: 1040, y: 1420 }], ["input.audio", { assetId: "sound" }, { x: 1040, y: 1780 }],
      ["input.audio", { assetId: "sound" }, { x: 1040, y: 2140 }],
    ]);
    expect(view.session.getSnapshot().history.undo).toHaveLength(3); expect(view.session.getDocument().edges).toBe(document.edges);
    expect(view.session.getDocument().nodes.slice(1, document.nodes.length)).toEqual(document.nodes.slice(1));
    act(() => { view.session.undo(); }); expect(view.session.getDocument().nodes).toHaveLength(document.nodes.length);
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ presentation: { comment: "Keep me" }, excludedAssetIds: ["b"] });
    act(() => { view.session.redo(); }); expect(view.session.getDocument().nodes.slice(document.nodes.length)).toEqual(added);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it.each([498, 499])("enforces the 500-node bound atomically when extracting from %i nodes", count => {
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Limit", groups: [], nodes: [node("gallery", "output.gallery", { mediaType: null }), input("one", "a"), input("two", "a"),
      ...Array.from({ length: count - 3 }, (_, index) => node(`memo-${index}`, "note.memo", { text: "Keep" }))], edges: [edge("one", "one", "image", 0), edge("two", "two", "image", 1)] };
    const view = mount(document); fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    expect(view.session.getDocument().nodes).toHaveLength(count === 498 ? 500 : 499);
    expect(view.session.getSnapshot().history.undo).toHaveLength(count === 498 ? 1 : 0);
    if (count === 499) { expect(view.session.getDocument()).toBe(document); expect(view.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: expect.stringMatching(/NODE_LIMIT|500/) })); }
  });

  it("allows lightbox navigation and original downloads in read-only mode while disabling durable actions", async () => {
    const view = mount(mixed(), { writable: false });
    expect(screen.getByRole("button", { name: "Extract" })).toBeDisabled();
    open(view.container, "b"); const dialog = await screen.findByRole("dialog", { name: "Output Gallery" });
    await within(dialog).findByAltText("b.original.png");
    expect(within(dialog).getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/media-assets/b/download");
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("download", "b.original.png");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" })); expect(within(dialog).getByText("2 / 5")).toBeInTheDocument();
    expect(view.session.getDocument()).toBe(view.document); expect(view.session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("rejects stale remove/extract events on permission revocation or a Space reset", async () => {
    const view = mount(); const extract = screen.getByRole("button", { name: "Extract" }); open(view.container, "a");
    const dialog = await screen.findByRole("dialog"), remove = within(dialog).getByRole("button", { name: "Remove" });
    act(() => {
      view.session.reset({ id: "other-space", version: 1, document: view.document, writable: false });
      fireEvent.click(remove); fireEvent.click(extract);
    });
    expect(view.session.getDocument()).toBe(view.document); expect(view.session.getSnapshot().history.undo).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    act(() => { view.session.reset({ id: "space", version: 1, document: view.document }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focuses the modal, guards IME/229 navigation and Escape, and restores focus on close", async () => {
    const view = mount(), trigger = open(view.container, "b"); const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus());
    expect(within(dialog).getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.compositionStart(dialog); fireEvent.keyDown(dialog, { key: "ArrowRight" }); fireEvent.keyDown(dialog, { key: "Escape" });
    expect(within(dialog).getByText("1 / 5")).toBeInTheDocument(); expect(dialog).toBeInTheDocument();
    fireEvent.compositionEnd(dialog); fireEvent.keyDown(dialog, { key: "ArrowRight", keyCode: 229 }); fireEvent.keyDown(dialog, { key: "Escape", isComposing: true });
    expect(within(dialog).getByText("1 / 5")).toBeInTheDocument(); expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowRight" }); expect(within(dialog).getByText("2 / 5")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" }); expect(within(dialog).getByText("1 / 5")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes a player menu with Escape before dismissing the shared asset detail", async () => {
    const user = userEvent.setup(), view = mount(); open(view.container, "sound");
    const detail = await screen.findByRole("dialog"), speed = await within(detail).findByRole("button", { name: /^Playback speed:/ });
    await user.click(speed);
    const menu = await screen.findByRole("dialog", { name: "Playback speed" });
    act(() => { speed.focus(); });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    expect(detail).toBeInTheDocument();
    expect(speed).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(detail).not.toBeInTheDocument());
  });

  it("clamps the last item after removal, closes after the final item and does not reopen on undo", async () => {
    const document = mixed(); document.nodes[0] = { ...document.nodes[0], config: { mediaType: null, excludedAssetIds: ["a", "b", "v"] } };
    const view = mount(document); open(view.container, "sound"); const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("1 / 1")).toBeInTheDocument(); expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Connect image, video, or audio nodes to view gallery")).toBeInTheDocument();
    act(() => { view.session.undo(); }); expect(visible(view.container)).toEqual([["audio", "sound"]]); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps failed asset slots and provides query retry plus original-media retry", async () => {
    failures.add("b"); const view = mount();
    const failedTile = tile(view.container, "b"); const error = await within(failedTile).findByRole("alert");
    expect(visible(view.container)).toHaveLength(5);
    failures.delete("b"); fireEvent.click(within(error).getByRole("button", { name: "Retry" }));
    await within(failedTile).findByAltText("b.original.png");
    const thumbnail = within(failedTile).getByRole("img"); fireEvent.error(thumbnail);
    fireEvent.click(within(failedTile).getByRole("button", { name: "Retry" }));
    expect(within(failedTile).getByRole("img")).not.toBe(thumbnail);
    open(view.container, "b"); const dialog = await screen.findByRole("dialog"); const original = await within(dialog).findByAltText("b.original.png");
    expect(original).toHaveAttribute("src", "https://media.example/b"); fireEvent.error(original);
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" })); expect(within(dialog).getByRole("img")).not.toBe(original);
    expect(view.session.getDocument()).toBe(view.document);
  });

  it("loads the actual asset into the common editable detail and saves its metadata without changing the Gallery", async () => {
    let finish!: (asset: MediaAssetDto) => void;
    mocks.getAsset.mockImplementation((id: string) => id === "b" ? new Promise<MediaAssetDto>(resolve => { finish = resolve; }) : Promise.resolve(assets.get(id)!));
    const view = mount(); open(view.container, "b");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-media-asset-detail");
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download" })).toBeDisabled();
    await act(async () => {
      const saved = { ...asset("b"), displayName: "Saved name", description: "Original notes" };
      assets.set("b", saved); mocks.getAsset.mockImplementation(async (id: string) => assets.get(id)!); finish(saved);
    });
    const name = await within(dialog).findByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Saved name");
    expect(within(dialog).getByRole("tab", { name: "Prompt" })).toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Reviewed name" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("b", expect.objectContaining({ displayName: "Reviewed name", expectedVersion: 1 })));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.session.getDocument()).toBe(view.document);
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
  });

  it("guards unsaved metadata on close, navigation and contextual removal, keeping duplicate occurrences independent", async () => {
    const view = mount(); open(view.container, "a");
    const dialog = await screen.findByRole("dialog"), name = await within(dialog).findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "Unsaved metadata" } });
    fireEvent.keyDown(name, { key: "ArrowRight" });
    expect(within(dialog).getByText("2 / 5")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    let confirmation = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(name).toHaveValue("Unsaved metadata");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    confirmation = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("2 / 5")).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(within(dialog).getByText("3 / 5")).toBeInTheDocument();
    const duplicateName = await within(dialog).findByRole("textbox", { name: "Name" });
    expect(duplicateName).toHaveValue("");
    fireEvent.change(duplicateName, { target: { value: "Second unsaved" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    confirmation = await screen.findByRole("alertdialog");
    expect(view.session.getDocument()).toBe(view.document);
    fireEvent.click(within(confirmation).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(visible(view.container)).toEqual([["image", "b"], ["image", "a"], ["video", "v"], ["audio", "sound"]]);
    expect(view.session.getDocument().edges).toEqual(view.document.edges.filter(edge => edge.id !== "duplicate-a"));
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    expect(mocks.deleteAsset).not.toHaveBeenCalled(); expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("rejects a confirmed late remove when its source changes and preserves the current focused occurrence after reorder", async () => {
    const view = mount(); open(view.container, "a");
    const dialog = await screen.findByRole("dialog"), name = await within(dialog).findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "Unsaved" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    const confirmation = await screen.findByRole("alertdialog");
    act(() => { view.session.dispatch({ type: "node.config.patch", nodeId: "image-a", patch: { assetId: "c" } }); });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(view.session.getDocument().edges).toBe(view.document.edges);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    await within(dialog).findByAltText("c.original.png");
    const currentName = within(dialog).getByRole("textbox", { name: "Name" }); currentName.focus();
    act(() => { view.session.dispatch({ type: "edge.reorder", targetNodeId: "gallery", targetPortId: "image", edgeIds: ["image-a", "duplicate-a", "image-b", "paused"] }); });
    expect(within(dialog).getByText("1 / 5")).toBeInTheDocument();
    expect(currentName).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(tile(view.container, "c").querySelector("button")).toHaveFocus());
  });

  it("plays only a visible hovered video in a selected Gallery and releases it on leave, deselect, detail or disposal", async () => {
    assets.set("v2", asset("v2", "video"));
    const document = mixed(); document.nodes.push(input("second-video", "v2", "video")); document.edges.push(edge("second-video", "second-video", "video", 2));
    const view = mount(document);
    await waitFor(() => expect(view.client.getQueryData(mediaAssetKeys.detail("v2"))).toBeDefined());
    const first = tile(view.container, "v"), second = tile(view.container, "v2");
    act(() => view.session.select([]));
    fireEvent.pointerEnter(first);
    act(() => { Visibility.emit(first, true); Visibility.emit(second, true); });
    expect(view.container.querySelector("video")).not.toBeInTheDocument();
    act(() => view.session.select(["gallery"]));
    expect(view.container.querySelector("video")).not.toBeInTheDocument();
    fireEvent.pointerEnter(first);
    const preview = first.querySelector("video")!;
    await waitFor(() => expect(preview).toHaveAttribute("src", "https://media.example/v"));
    expect(preview.muted).toBe(true); expect(preview).not.toHaveAttribute("controls");
    expect(second.querySelector("video")).not.toBeInTheDocument();
    fireEvent.pointerLeave(first); expect(preview).not.toHaveAttribute("src");
    fireEvent.pointerEnter(second); const next = second.querySelector("video")!;
    expect(view.container.querySelectorAll("video")).toHaveLength(1);
    act(() => view.session.select([])); expect(next).not.toHaveAttribute("src");
    act(() => view.session.select(["gallery"])); fireEvent.pointerEnter(second);
    const beforeDetail = second.querySelector("video")!;
    act(() => { within(second).getByRole("button", { name: /View full size/ }).focus(); });
    open(view.container, "v2");
    expect(beforeDetail).not.toHaveAttribute("src");
    const dialog = await screen.findByRole("dialog"); expect(view.container.querySelector("video")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.container.querySelector("video")).not.toBeInTheDocument();
    fireEvent.pointerEnter(first); const beforeDispose = first.querySelector("video")!;
    act(() => view.session.dispose()); expect(beforeDispose).not.toHaveAttribute("src");
    expect(view.container.querySelector("video")).not.toBeInTheDocument();
  });

  it("loads one video/audio player only in the lightbox and releases media on navigation and close", async () => {
    const view = mount(); open(view.container, "v"); const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.querySelector("video")).toHaveAttribute("src", "https://media.example/v"));
    const video = dialog.querySelector("video")!; expect(video).not.toHaveAttribute("controls"); expect(video).toHaveAttribute("autoplay");
    expect(dialog.querySelector("[data-app-video-player]")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(dialog.querySelector("audio")).toHaveAttribute("src", "https://media.example/sound"));
    expect(video).not.toHaveAttribute("src"); expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(dialog.querySelectorAll("video, audio")).toHaveLength(1);
    expect(dialog.querySelector("[data-app-audio-player]")).toBeInTheDocument();
    const audio = dialog.querySelector("audio")!;
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" })); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(audio).not.toHaveAttribute("src"); expect(view.container.querySelectorAll("video, audio")).toHaveLength(0);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("subscribes to one shared one-frame poster only on visibility and cancels the last subscriber", async () => {
    let finish!: (value: SpaceFilmstripResult) => void;
    mocks.poster.mockImplementation(() => new Promise<SpaceFilmstripResult>(resolve => { finish = resolve; }));
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Posters", groups: [], nodes: [node("gallery", "output.gallery", { mediaType: null }), input("first", "v", "video"), input("second", "v", "video")],
      edges: [edge("first", "first", "video", 0), edge("second", "second", "video", 1)] };
    const view = mount(document);
    await waitFor(() => expect(view.client.getQueryData(mediaAssetKeys.detail("v"))).toBeDefined());
    expect(mocks.poster).not.toHaveBeenCalled();
    act(() => { Visibility.emit(tile(view.container, "v"), true); Visibility.emit(tile(view.container, "v", 1), true); });
    await waitFor(() => expect(mocks.poster).toHaveBeenCalledTimes(1));
    expect(mocks.poster.mock.calls[0][1]).toEqual({ count: 1, width: 160, height: 90, quality: 0.7 });
    const signal: AbortSignal = mocks.poster.mock.calls[0][2]; expect(signal.aborted).toBe(false);
    expect(view.container.querySelector("video")).not.toBeInTheDocument();
    act(() => Visibility.emit(tile(view.container, "v"), false)); expect(signal.aborted).toBe(false);
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { finish({ images: ["blob:late"], bitmapBytes: 4, release: mocks.releasePoster }); });
    expect(mocks.releasePoster).toHaveBeenCalledTimes(1);
  });

  it("retries a failed visible poster only through an explicit user action", async () => {
    mocks.poster.mockRejectedValueOnce(new Error("DECODE_FAILED")); const view = mount();
    await waitFor(() => expect(view.client.getQueryData(mediaAssetKeys.detail("v"))).toBeDefined());
    act(() => Visibility.emit(tile(view.container, "v"), true));
    const error = await within(tile(view.container, "v")).findByRole("alert");
    expect(mocks.poster).toHaveBeenCalledTimes(1);
    fireEvent.click(within(error).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(tile(view.container, "v")).getByRole("img")).toHaveAttribute("src", "blob:poster-v"));
    expect(mocks.poster).toHaveBeenCalledTimes(2); expect(view.session.getDocument()).toBe(view.document);
  });
});
