import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { GradioField } from "@/shared/model-catalog/gradio-contract";
import type { RuntimeAudioModel, RuntimeImageModel, RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import messages from "@/shared/i18n/messages/en.json";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument, SpaceNodeRuntime } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider, type SpaceEditorCatalog } from "../space-editor-provider";
import { SpaceNodeAuthoringProvider } from "./space-node-authoring-provider";
import { SpaceGenerationNode } from "./space-node-generation";

const mocks = vi.hoisted(() => ({
  inline: true, assets: new Map<string, MediaAssetDto>(), assetErrors: new Set<string>(),
  executions: [] as NodeExecutionDto[], historyError: false,
  historyQuery: vi.fn(), assetQuery: vi.fn(), assetList: vi.fn(), retry: vi.fn(),
  picker: null as null | { onSelect: (asset: MediaAssetDto) => void },
}));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => () => {},
  Handle: ({ children }: HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
}));
vi.mock("../../hook/use-space-preferences", () => ({ useSpacePreferences: () => ({ inlineParametersEnabled: mocks.inline }) }));
vi.mock("../../hook/use-node-executions", async importOriginal => {
  const { nodeExecutionKeys } = await importOriginal<typeof import("../../hook/use-node-executions")>();
  return { nodeExecutionKeys, useNodeExecutions: (...args: unknown[]) => {
    mocks.historyQuery(...args); return { data: mocks.executions, isError: mocks.historyError, refetch: mocks.retry };
  } };
});
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  mediaAssetKeys: { detail: (id: string) => ["media-assets", id], list: (type: string) => ["media-assets", "list", type] },
  useMediaAsset: (id: string | null) => {
    mocks.assetQuery(id); return { data: id ? mocks.assets.get(id) : undefined, isError: Boolean(id && mocks.assetErrors.has(id)), refetch: mocks.retry };
  },
  useMediaAssetList: (ids: string[]) => {
    mocks.assetList(ids); return ids.map(id => ({ data: mocks.assets.get(id), isError: mocks.assetErrors.has(id), refetch: mocks.retry }));
  },
}));
vi.mock("@/features/media-assets/ui/media-asset-picker", () => ({ MediaAssetPicker: (props: {
  open: boolean; writable: boolean; onSelect: (asset: MediaAssetDto) => void;
}) => {
  mocks.picker = props;
  return props.open ? <div role="dialog" aria-label="Assets"><button type="button" disabled={!props.writable}
    onClick={() => props.onSelect(mocks.assets.get("library")!)}>Select library asset</button></div> : null;
} }));
vi.mock("@/entities/prompt-preset/model/use-prompt-preset-catalog", () => ({
  usePromptPresetCatalog: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/entities/prompt-preset/ui/generation-prompt-preset-controls", () => ({
  GenerationPromptPresetControls: ({ disabled }: { disabled: boolean }) => <button type="button" disabled={disabled}>Presets</button>,
}));
vi.mock("@/shared/ui/cinema/cinema-studio-controls", () => ({
  CinemaStudioControls: ({ disabled }: { disabled: boolean }) => <button type="button" disabled={disabled}>Cinema</button>,
}));
vi.mock("@/shared/ui/generation-model-section", () => ({ GenerationModelSection: (props: {
  activeId: string | null; disabled: boolean; items: { id: string; name: string }[]; onSelect: (id: string) => void;
}) => <select aria-label="Model" value={props.activeId ?? ""} disabled={props.disabled} onChange={event => props.onSelect(event.target.value)}>
  <option value="">Choose a model</option>{props.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
</select> }));
vi.mock("@/shared/ui/generation-image-count-selector", () => ({ GenerationImageCountSelector: ({ value }: { value: number }) => <span>{value} runs</span> }));
vi.mock("@/shared/ui/app-prompt-editor", () => ({ AppPromptEditor: (props: {
  value: string; disabled: boolean; "aria-label": string; onChange: (text: string, present: boolean, offset: number) => void;
}) => <textarea aria-label={props["aria-label"]} value={props.value} disabled={props.disabled}
  onChange={event => props.onChange(event.target.value, false, 0)} /> }));
vi.mock("./space-media-preview", () => ({ SpaceMediaPreview: ({ asset, selected, hovered }: { asset: MediaAssetDto; selected: boolean; hovered: boolean }) =>
  <div data-testid="preview" data-asset={asset.id} data-selected={selected} data-hovered={hovered}>{asset.type} preview</div> }));

class PanelObserver {
  static instances: PanelObserver[] = [];
  target: Element | null = null;
  constructor(private readonly callback: ResizeObserverCallback) { PanelObserver.instances.push(this); }
  observe(target: Element) { this.target = target; }
  disconnect() {}
  emit(height: number) {
    this.callback([{ target: this.target, contentRect: { height }, borderBoxSize: [{ blockSize: height }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}
function field(name: string, kind: GradioField["kind"] = "string", extra: Partial<GradioField> = {}): GradioField {
  return { name, label: name, kind, required: false, nullable: false, schema: { type: kind === "json" ? ["object", "null"] : kind }, ...extra };
}
function model(type: "image" | "audio" | "video" = "image", inputs?: GradioField[]): RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel {
  return { type, key: `${type}-model`, label: `${type} model`, vendor: "Leesfield", provider: "hf_space", isActive: true, isDefault: true,
    parameters: {}, meta: {}, ...(inputs ? { providerConfig: { gradio_contract: { version: 1, apiName: "/generate", inputs,
      output: { media: type, path: [0], multiple: false }, diagnostics: [], reviewed: true } } } : {}) };
}
function generation(type: "image" | "audio" | "video" = "image", extra: Partial<CanonicalNode> = {}): CanonicalNode {
  return { id: "generation", kind: `generate.${type}`, configVersion: 1, position: { x: 0, y: 0 },
    config: { prompt: "Saved prompt", modelKey: `${type}-model`, parameters: {} }, selectedOutputAssetId: null, ...extra };
}
function asset(id: string, type: MediaAssetDto["type"] = "image"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: `${type}/mp4`, bytes: "4", width: 800, height: 600,
    durationMs: null, sourceOperationId: null, url: `https://media.example/${id}`, originalFileName: `${id}.mp4`,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" };
}
function execution(id = "execution", overrides: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return { executionId: id, executionKind: "generation", mediaType: "image", graphNodeId: "generation", status: "completed", progress: 100,
    errorCode: null, modelKey: "image-model", outputAssetIds: ["newest"], createdAt: "2026-10-20T00:02:00.000Z", finishedAt: "2026-10-20T00:03:00.000Z", ...overrides };
}
function mount(node = generation(), options: { writable?: boolean; models?: ReturnType<typeof model>[]; nodes?: CanonicalNode[]; edges?: SpaceEditorDocument["edges"]; persisted?: boolean; runtime?: SpaceNodeRuntime } = {}) {
  const doc: SpaceEditorDocument = { schemaVersion: 3, title: "Generation", nodes: [node, ...(options.nodes ?? [])], edges: options.edges ?? [], groups: [] };
  const session = createSpaceEditorSession({ id: "space", version: 1, document: doc, writable: options.writable,
    ...(options.persisted === false ? { persistedNodeIds: [] } : {}) });
  const catalog: SpaceEditorCatalog = { imageModels: [], videoModels: [], audioModels: [], isLoading: false, error: null, retry: vi.fn() };
  for (const item of options.models ?? [model("image"), model("video"), model("audio")]) {
    if (item.type === "image") catalog.imageModels = [...catalog.imageModels, item];
    if (item.type === "video") catalog.videoModels = [...catalog.videoModels ?? [], item];
    if (item.type === "audio") catalog.audioModels = [...catalog.audioModels ?? [], item];
  }
  const runNode = vi.fn(), cancelNode = vi.fn(), browseModel = vi.fn();
  const services = { runNode, cancelNode, browseModel }, scope = createSpaceEditorScope(session, { catalog, services });
  if (options.runtime) session.patchRuntime(node.id, options.runtime);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><QueryClientProvider client={client}>
    <SpaceEditorProvider session={session} scope={scope} catalog={catalog} services={services}><SpaceNodeAuthoringProvider nodeId={node.id}>
      <SpaceGenerationNode nodeId={node.id} />
    </SpaceNodeAuthoringProvider></SpaceEditorProvider>
  </QueryClientProvider></NextIntlClientProvider>;
  const result = render(tree());
  // Controls are exercised after real body entry; Shell/browser suites cover the first click.
  const body = result.container.querySelector("[data-space-node-body]");
  if (body) fireEvent.click(body);
  return { ...result, session, scope, catalog, runNode, cancelNode, browseModel, refresh: () => result.rerender(tree()) };
}
beforeEach(() => {
  mocks.inline = true; mocks.assets.clear(); mocks.assetErrors.clear(); mocks.executions = []; mocks.historyError = false; mocks.picker = null;
  for (const id of ["selected", "newest", "older", "library"]) mocks.assets.set(id, asset(id));
  mocks.historyQuery.mockClear(); mocks.assetQuery.mockClear(); mocks.assetList.mockClear(); mocks.retry.mockReset();
  PanelObserver.instances = [];
  vi.stubGlobal("ResizeObserver", PanelObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("SpaceGenerationNode", () => {
  it.each(["image", "audio", "video"] as const)("reuses the %s source form and routes one Run/Cancel through the header services", type => {
    const view = mount(generation(type), { models: [model(type, [field("text", "string", { canonical: "prompt", required: true })])] });
    expect(screen.getByLabelText("Prompt")).toHaveValue("Saved prompt");
    const run = screen.getByRole("button", { name: "Run this node" });
    expect(run).toBeEnabled(); fireEvent.click(run); expect(view.runNode).toHaveBeenCalledExactlyOnceWith("generation");
    expect(view.container.querySelectorAll('[data-canvas-action="run"]')).toHaveLength(1);
    act(() => view.session.patchRuntime("generation", { execution: execution("active", { mediaType: type, status: "processing", progress: 37 }) }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(view.cancelNode).toHaveBeenCalledExactlyOnceWith("generation");
    expect(within(view.container.querySelector<HTMLElement>("[data-space-generation]")!).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-space-node]')).toHaveAttribute("data-executing", "true");
  });

  it("uses a connected empty prompt, disables local authoring, and restores its saved prompt after disconnect", () => {
    const upstream: CanonicalNode = { id: "upstream", kind: "input.prompt", configVersion: 1, position: { x: 0, y: 0 }, config: { text: "" }, selectedOutputAssetId: null };
    const view = mount(generation(), { nodes: [upstream], edges: [{ id: "prompt-wire", sourceNodeId: "upstream", sourcePortId: "text", targetNodeId: "generation", targetPortId: "prompt", sortOrder: 0 }] });
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.getByLabelText("Prompt")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Presets" })).toBeDisabled();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ prompt: "Saved prompt" });
    act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "prompt-wire" }); });
    expect(screen.getByLabelText("Prompt")).toHaveValue("Saved prompt");
    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Edited prompt" } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ prompt: "Edited prompt" });
  });

  it("edits Drama Script in the shared audio schema without inventing an additional prompt", () => {
    const audio = model("audio", [field("script", "string", { label: "Drama Script", required: true })]);
    const view = mount(generation("audio", { config: { modelKey: audio.key, prompt: "", parameters: { dynamicParams: { script: "Saved script" } } } }), { models: [audio] });
    expect(screen.queryByLabelText("Prompt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("textbox", { name: "Drama Script" })).toHaveValue("Saved script");
    fireEvent.change(screen.getByRole("textbox", { name: "Drama Script" }), { target: { value: "Updated script" } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ prompt: "", parameters: { dynamicParams: { script: "Updated script" } } });
  });

  it("synchronizes a declared primary text alias through the existing prompt form", () => {
    const image = model("image", [field("description", "string", { canonical: "prompt", required: true })]);
    const view = mount(generation("image", { config: { modelKey: image.key, prompt: "Local", parameters: { dynamicParams: { description: "Local" } } } }), { models: [image] });
    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Updated" } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ prompt: "Updated", parameters: { dynamicParams: { description: "Updated" } } });
  });

  it("retains 0, false, null and structured values when editing the shared parameter controls", () => {
    const image = model("image", [field("seed", "number", { default: 42 }), field("enabled", "boolean", { default: true }), field("metadata", "json", { nullable: true, default: { default: true } })]);
    const view = mount(generation("image", { config: { modelKey: image.key, prompt: "", parameters: { dynamicParams: { seed: 0, enabled: false, metadata: null } } } }), { models: [image] });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("spinbutton", { name: "seed" })).toHaveValue(0);
    expect(screen.getByRole("switch", { name: "enabled" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("textbox", { name: "metadata" })).toHaveValue("null");
    fireEvent.change(screen.getByRole("textbox", { name: "metadata" }), { target: { value: '{"nested":[0,false,null]}' } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { dynamicParams: { seed: 0, enabled: false, metadata: { nested: [0, false, null] } } } });
  });

  it("preserves the current source-only body and selected durable output when results complete", () => {
    mocks.executions = [execution()];
    const view = mount(generation("image", { selectedOutputAssetId: "selected" }));
    const body = view.container.querySelector("[data-space-generation]")!;
    expect(body).not.toHaveTextContent("Completed");
    expect(body).not.toHaveTextContent("1m 0s total");
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
    expect(mocks.assetQuery).not.toHaveBeenCalled();
    expect(mocks.assetList).not.toHaveBeenCalled();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("selected");
    act(() => { view.session.select(["generation"]); view.session.hover("generation"); });
    expect(screen.getByLabelText("Prompt")).toHaveValue("Saved prompt");
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
    expect(mocks.assetQuery).not.toHaveBeenCalled();
    expect(mocks.assetList).not.toHaveBeenCalled();
  });

  it("passes actual repeat progress to the source form and keeps earlier successful outputs on partial failure", () => {
    const repeat = { completed: 3, failed: 1, total: 4, running: true };
    const runtime: SpaceNodeRuntime & { repeatProgress: typeof repeat } = { execution: execution("repeat", { status: "processing", progress: 25 }), repeatProgress: repeat };
    mocks.executions = [execution("success", { outputAssetIds: ["older"] }), execution("failed", { status: "failed", outputAssetIds: [], errorCode: "PRIVATE_PROVIDER_DETAIL" })];
    const view = mount(generation("image", { selectedOutputAssetId: "older", config: { modelKey: "image-model", prompt: "Saved", parameters: {}, repeatCount: 4 } }), { runtime });
    expect(screen.getByText("3/4 runs · 2 succeeded · 1 failed · generating")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cinema" })).toBeDisabled();
    expect(screen.queryByText("PRIVATE_PROVIDER_DETAIL")).not.toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("older");
  });

  it("does not invent repeat completion counts from repeatCount and historical executions", () => {
    mocks.executions = [execution("old-success"), execution("old-failure", { status: "failed", outputAssetIds: [] })];
    mount(generation("image", { config: { modelKey: "image-model", prompt: "Saved", parameters: {}, repeatCount: 4 } }));
    expect(screen.queryByText(/succeeded.*failed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("keeps a newer runtime execution over old history and accepts the same run's terminal history update", () => {
    mocks.executions = [execution("old", { status: "failed", errorCode: "PRIVATE_PROVIDER_ERROR", createdAt: "2026-10-19T00:00:00.000Z" })];
    const current = execution("current", { status: "processing", progress: 62 });
    const view = mount(generation(), { runtime: { execution: current } });
    expect(view.container.querySelector("[data-space-generation]")).not.toHaveTextContent("elapsed");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    mocks.executions = [{ ...current, status: "failed", errorCode: "PRIVATE_PROVIDER_ERROR" }];
    view.refresh();
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
    expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE_PROVIDER_ERROR");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("preserves the body height across measured inline settings expansion/collapse without saving view state", () => {
    const view = mount();
    const before = view.session.getDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const observer = PanelObserver.instances.find(item => item.target?.hasAttribute("data-space-node-settings"))!;
    act(() => observer.emit(150));
    expect(view.scope.view.getState().bodyHeightByNode.get("generation")).toBe(360);
    expect(view.session.getSnapshot().geometryByNode.generation.height).toBe(510);
    expect(view.container.querySelector("[data-space-node-body]")).toHaveStyle({ height: "360px" });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(view.session.getSnapshot().geometryByNode.generation.height).toBe(360);
    expect(view.session.getDocument()).toBe(before);
    mocks.inline = false; view.refresh();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("blocks read-only authoring/output selection and leaves an unavailable stored model untouched", () => {
    const view = mount(generation("image", { config: { modelKey: "old-model", prompt: "Saved", parameters: { seed: 0 } }, selectedOutputAssetId: "selected" }), { writable: false });
    const before = view.session.getDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("status")).toHaveTextContent("Unavailable · old-model");
    expect(screen.getByLabelText("Prompt")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Model" })).toBeDisabled();
    expect(view.session.getDocument()).toBe(before);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("enables history only after persistence and retries history read errors", () => {
    mocks.historyError = true;
    const view = mount(generation(), { persisted: false });
    expect(mocks.historyQuery).toHaveBeenLastCalledWith("space", "generation", false);
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
    act(() => view.session.ack({ version: 2, persistedNodeIds: ["generation"] }));
    expect(mocks.historyQuery).toHaveBeenLastCalledWith("space", "generation", true);
  });
});
