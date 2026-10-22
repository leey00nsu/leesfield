import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import type { SpaceInputRuntime } from "../../model/space-editor-inputs";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceCompareNode } from "./space-node-compare";

const mocks = vi.hoisted(() => ({ getAsset: vi.fn(), assets: new Map<string, MediaAssetDto>(), errors: new Set<string>() }));
vi.mock("@/features/media-assets/api/media-asset-api", async importOriginal => ({
  ...await importOriginal<object>(), getMediaAsset: (...args: unknown[]) => mocks.getAsset(...args),
}));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => () => {},
  Handle: (props: HTMLAttributes<HTMLDivElement>) => <div data-space-port={props["data-space-port" as keyof typeof props]} />,
}));

function asset(id: string, type: MediaAssetDto["type"] = "image"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: `${type}/png`, bytes: "4", width: 800, height: 600,
    durationMs: null, sourceOperationId: null, url: `https://media.example/${id}`, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" };
}
function node(id: string, kind = "input.image", config: CanonicalNode["config"] = { assetId: id }): CanonicalNode {
  return { id, kind, configVersion: 1, config, position: { x: 0, y: 0 }, selectedOutputAssetId: null };
}
function edge(side: "before" | "after", sourceNodeId: string = side, sourcePortId = "image", sortOrder = 0): CanonicalEdge {
  return { id: `wire-${side}`, sourceNodeId, sourcePortId, targetNodeId: "compare", targetPortId: side, sortOrder };
}
function document(nodes = [node("before"), node("after")], edges = [edge("before"), edge("after")]): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Compare", nodes: [node("compare", "inspect.imageCompare", {}), ...nodes], edges, groups: [] };
}
const clients: QueryClient[] = [];
function mount(doc = document(), options: { runtime?: SpaceInputRuntime; locale?: string; writable?: boolean } = {}) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document: doc, writable: options.writable });
  const runNode = vi.fn(), cancelNode = vi.fn(), services = { runNode, cancelNode };
  const scope = createSpaceEditorScope(session, { inputRuntime: options.runtime, services });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  const keyboard = vi.fn(), submit = vi.fn((event: { preventDefault(): void }) => event.preventDefault()), durable = vi.fn();
  session.subscribeDurable(durable);
  let runtime = options.runtime;
  const tree = () => <NextIntlClientProvider locale={options.locale ?? "en"} messages={messages} timeZone="UTC"><QueryClientProvider client={client}>
    <SpaceEditorProvider session={session} scope={scope} services={services} inputRuntime={runtime}>
      <form onSubmit={submit} onKeyDown={keyboard}><SpaceCompareNode nodeId="compare" /></form>
    </SpaceEditorProvider>
  </QueryClientProvider></NextIntlClientProvider>;
  const view = render(tree());
  return { ...view, session, scope, runNode, cancelNode, durable, keyboard, submit, client,
    setRuntime: (value: SpaceInputRuntime) => { runtime = value; view.rerender(tree()); } };
}
beforeEach(() => {
  mocks.assets.clear(); mocks.errors.clear(); mocks.getAsset.mockReset();
  for (const id of ["before", "after", "start", "start-next", "end", "wrong-port", "new-result", "shared", "cell-zero", "cell-one"]) mocks.assets.set(id, asset(id));
  mocks.getAsset.mockImplementation(async (id: string) => {
    if (mocks.errors.has(id) || !mocks.assets.has(id)) throw new Error("PRIVATE_ASSET_ERROR");
    return mocks.assets.get(id);
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 240, top: 0, left: 0, right: 400, bottom: 240, x: 0, y: 0, toJSON() {} });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("SpaceCompareNode", () => {
  it("keeps canonical before/after independent of edge order and never executes on mount", async () => {
    const doc = document(undefined, [edge("after", "after", "image", 0), edge("before", "before", "image", 50)]), view = mount(doc);
    expect(await screen.findByAltText("Image A")).toHaveAttribute("src", "https://media.example/before");
    expect(screen.getByAltText("Image B")).toHaveAttribute("src", "https://media.example/after");
    expect([...view.container.querySelectorAll("[data-space-port]")].map(item => item.getAttribute("data-space-port"))).toEqual(["before", "after"]);
    expect(view.session.getDocument()).toBe(doc); expect(view.durable).not.toHaveBeenCalled();
    expect(view.runNode).not.toHaveBeenCalled(); expect(view.cancelNode).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-canvas-action="run"]')).toBeNull();
  });

  it("uses the exact Frames port and its zero result, never another port's representative", async () => {
    const frames = { ...node("frames", "edit.video.extractFrames", { parameters: {} }), selectedOutputAssetId: "wrong-port" };
    const view = mount(document([frames], [edge("before", "frames", "startFrame"), edge("after", "frames", "endFrame")]), {
      runtime: { mediaOutputs: new Map([["frames", [
        { portId: "endFrame", sortOrder: 0, assetId: "end" }, { portId: "startFrame", sortOrder: 1, assetId: "start-next" },
        { portId: "startFrame", sortOrder: 0, assetId: "start" },
      ]]]) },
    });
    expect(await screen.findByAltText("Image A")).toHaveAttribute("src", "https://media.example/start");
    expect(screen.getByAltText("Image B")).toHaveAttribute("src", "https://media.example/end");
    expect(mocks.getAsset.mock.calls.map(call => call[0])).toEqual(["start", "end"]);
    expect(view.durable).not.toHaveBeenCalled();
  });

  it("leaves a missing frame port empty while preserving the other side", async () => {
    mount(document([{ ...node("frames", "edit.video.extractFrames", { parameters: {} }), selectedOutputAssetId: "end" }],
      [edge("before", "frames", "startFrame"), edge("after", "frames", "endFrame")]), {
      runtime: { mediaOutputs: new Map([["frames", [{ portId: "endFrame", sortOrder: 0, assetId: "end" }]]]) },
    });
    expect(await screen.findByText("Image B connected")).toBeInTheDocument();
    expect(screen.getByText("Connect another image to compare")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(mocks.getAsset.mock.calls.map(call => call[0])).toEqual(["end"]);
  });

  it("uses a single-output producer's selected representative without requiring bindings", async () => {
    const generated = { ...node("generator", "generate.image", { modelKey: null, prompt: "", parameters: {} }), selectedOutputAssetId: "start" };
    mount(document([generated, node("after")], [edge("before", "generator"), edge("after")]));
    expect(await screen.findByAltText("Image A")).toHaveAttribute("src", "https://media.example/start");
  });

  it("uses ordered collection item zero rather than a later selected grid cell", async () => {
    const grid = { ...node("grid", "edit.image.splitGrid", { parameters: {} }), selectedOutputAssetId: "cell-one" };
    mount(document([grid, node("after")], [edge("before", "grid", "images"), edge("after")]), {
      runtime: { mediaOutputs: new Map([["grid", [
        { portId: "images", sortOrder: 1, assetId: "cell-one" }, { portId: "images", sortOrder: 0, assetId: "cell-zero" },
      ]]]) },
    });
    expect(await screen.findByAltText("Image A")).toHaveAttribute("src", "https://media.example/cell-zero");
  });

  it.each(["before", "after"] as const)("shows a placeholder after disconnecting %s and retains the other edge and asset", async side => {
    const view = mount(); await screen.findByRole("slider");
    const other = side === "before" ? "after" : "before", otherEdge = view.session.getDocument().edges.find(item => item.targetPortId === other);
    act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: `wire-${side}` }); });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByText(other === "after" ? "Image B connected" : "Image A connected")).toBeInTheDocument();
    expect(view.session.getDocument().edges).toEqual([otherEdge]);
    expect(view.client.getQueryData(["media-assets", "detail", other])).toEqual(asset(other));
    expect(view.session.getDocument().nodes[0].config).toEqual({}); expect(view.runNode).not.toHaveBeenCalled();
  });

  it("clears the compared input ports atomically and restores both sides with one undo", async () => {
    const view = mount(), original = view.session.getDocument();
    await screen.findByRole("slider");
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.session.getDocument().nodes).toBe(original.nodes);
    expect(view.durable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(view.client.getQueryData(["media-assets", "detail", "before"])).toEqual(asset("before"));
    expect(view.client.getQueryData(["media-assets", "detail", "after"])).toEqual(asset("after"));
    act(() => view.session.undo());
    expect(view.session.getDocument()).toEqual(original);
    expect(await screen.findByRole("slider")).toBeInTheDocument();
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("responds to pause/resume and new source bindings without swapping sides or writing slider state", async () => {
    const frames = node("frames", "edit.video.extractFrames", { parameters: {} });
    const view = mount(document([frames, node("after")], [edge("before", "frames", "startFrame"), edge("after")]), {
      runtime: { mediaOutputs: new Map([["frames", [{ portId: "startFrame", sortOrder: 0, assetId: "start" }]]]) },
    });
    await screen.findByRole("slider");
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "wire-before", hasPause: true }); });
    expect(screen.getByText("Image B connected")).toBeInTheDocument();
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "wire-before", hasPause: false }); });
    await screen.findByRole("slider"); view.durable.mockClear();
    view.setRuntime({ mediaOutputs: new Map([["frames", [{ portId: "startFrame", sortOrder: 0, assetId: "new-result" }]]]) });
    await waitFor(() => expect(screen.getByAltText("Image A")).toHaveAttribute("src", "https://media.example/new-result"));
    expect(screen.getByAltText("Image B")).toHaveAttribute("src", "https://media.example/after"); expect(view.durable).not.toHaveBeenCalled();
  });

  it("shares asset queries for identical sides, lazily loads variants and falls back to the original", async () => {
    const shared: MediaAssetDto = { ...asset("shared"), imageVariants: { version: 1, isAnimated: false,
      display: { url: "https://media.example/display", mimeType: "image/png", bytes: 2, width: 400, height: 300 }, thumbnail: null } };
    mocks.assets.set("shared", shared);
    const view = mount(document([node("before", "input.image", { assetId: "shared" }), node("after", "input.image", { assetId: "shared" })]));
    const image = await screen.findByAltText("Image A");
    expect(mocks.getAsset).toHaveBeenCalledExactlyOnceWith("shared", expect.any(AbortSignal));
    expect(image).toHaveAttribute("loading", "lazy"); expect(image).toHaveAttribute("decoding", "async"); expect(image).toHaveAttribute("src", "https://media.example/display");
    fireEvent.error(image); expect(screen.getByAltText("Image A")).toHaveAttribute("src", shared.url);
    expect(view.durable).not.toHaveBeenCalled();
  });

  it("shows a safe asset error, retries only the failed side and keeps the connected side", async () => {
    mocks.errors.add("before"); const view = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Image A: Assets could not be loaded.");
    expect(screen.getByText("Image B connected")).toBeInTheDocument(); expect(view.container).not.toHaveTextContent("PRIVATE_ASSET_ERROR");
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    mocks.errors.delete("before"); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("slider"); expect(mocks.getAsset.mock.calls.map(call => call[0])).toEqual(["before", "after", "before"]);
    expect(view.durable).not.toHaveBeenCalled();
  });

  it("keeps slider keyboard/focus/form and IME events local, with no durable writes even read-only", async () => {
    const view = mount(undefined, { writable: false }), slider = await screen.findByRole("slider", { name: "Image Compare" }), user = userEvent.setup();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(slider).toHaveAttribute("type", "button"); slider.focus();
    await user.keyboard("{ArrowRight}"); expect(slider).toHaveAttribute("aria-valuenow", "55");
    fireEvent.keyDown(slider, { key: "ArrowRight", isComposing: true }); expect(slider).toHaveAttribute("aria-valuenow", "55");
    fireEvent.keyDown(slider, { key: "ArrowRight", keyCode: 229 }); expect(slider).toHaveAttribute("aria-valuenow", "55");
    fireEvent.compositionStart(slider); fireEvent.keyDown(slider, { key: "ArrowRight" }); expect(slider).toHaveAttribute("aria-valuenow", "55");
    fireEvent.compositionEnd(slider); fireEvent.keyDown(slider, { key: "ArrowLeft" }); expect(slider).toHaveAttribute("aria-valuenow", "50");
    await user.keyboard("{Enter}{Delete}{Escape}");
    await waitFor(() => expect(view.container.querySelector('[data-space-node-body]')).toHaveFocus());
    expect(view.keyboard).not.toHaveBeenCalled(); expect(view.submit).not.toHaveBeenCalled(); expect(view.durable).not.toHaveBeenCalled();
    expect(view.session.getDocument().nodes[0].config).toEqual({}); expect(view.runNode).not.toHaveBeenCalled();
  });

  it("translates the comparison's accessible image and slider labels", async () => {
    mount(undefined, { locale: "ko" }); expect(await screen.findByRole("slider", { name: "이미지 비교" })).toBeInTheDocument();
    expect(screen.getByAltText("이미지 A")).toBeInTheDocument(); expect(screen.getByAltText("이미지 B")).toBeInTheDocument();
  });
});
