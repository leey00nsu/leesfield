import { useEffect, type ComponentType, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flow = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  controlsProps: null as Record<string, unknown> | null,
  runDisabled: false,
  renders: 0,
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    Background: () => null,
    Controls: (props: Record<string, unknown>) => {
      flow.controlsProps = props;
      return null;
    },
    MiniMap: () => <div data-testid="minimap" />,
    Panel: ({ children }: { children: ReactNode }) => <>{children}</>,
    ReactFlow: (props: Record<string, unknown> & { children: ReactNode }) => {
      flow.props = props;
      flow.renders += 1;
      useEffect(() => {
        (props.onInit as ((instance: unknown) => void) | undefined)?.({
          screenToFlowPosition: (point: { x: number; y: number }) => point,
          fitView: vi.fn().mockResolvedValue(true),
          setCenter: vi.fn().mockResolvedValue(true),
        });
      }, [props.onInit]);
      return (
        <div data-testid="react-flow">
          {props.children}
          {(props.nodes as Array<{ id: string }>)[0] ? (
            <div data-id={(props.nodes as Array<{ id: string }>)[0].id}>
              <button type="button" data-node-run disabled={flow.runDisabled}>
                node-run
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() =>
              (props.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
                {
                  id: (props.nodes as Array<{ id: string }>)[0]?.id,
                  type: "select",
                  selected: true,
                },
              ])
            }
          >
            select-first
          </button>
          <button
            type="button"
            onClick={() =>
              (props.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
                {
                  id: (props.nodes as Array<{ id: string }>)[0]?.id,
                  type: "dimensions",
                  dimensions: { width: 240, height: 160 },
                  setAttributes: true,
                },
              ])
            }
          >
            measure-first
          </button>
          <button
            type="button"
            onClick={() =>
              (props.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
                {
                  id: (props.nodes as Array<{ id: string }>)[1]?.id,
                  type: "dimensions",
                  dimensions: { width: 320, height: 180 },
                  setAttributes: true,
                },
              ])
            }
          >
            measure-second
          </button>
        </div>
      );
    },
  };
});

import {
  ModelSearchDialog,
  NodeBananaUpstreamHostProvider,
  NodeBananaCanvasRuntime,
  type NodeBananaCanvasProps,
  type NodeBananaCanvasLabels,
  type NodeBananaRuntimeGraph,
} from "@node-banana-runtime/runtime-entry";

const labels: NodeBananaCanvasLabels = {
  application: "Node Banana Canvas",
  addNode: "Add node",
  selectTool: "Select",
  panTool: "Pan",
  undo: "Undo",
  redo: "Redo",
  copy: "Copy",
  paste: "Paste",
  fitView: "Fit",
  searchPlaceholder: "Search nodes",
  closeMenu: "Close",
  emptyTitle: "Empty",
  emptyDescription: "Add your first node",
  readOnly: "Read-only",
};

const emptyGraph: NodeBananaRuntimeGraph = { nodes: [], edges: [] };

function renderRuntime(
  graph: NodeBananaRuntimeGraph,
  onGraphChange = vi.fn(),
  writable = true,
  isNodeRunnable: (nodeId: string) => boolean = () => true,
  onRunNode?: (nodeId: string) => void | Promise<unknown>,
  options: Partial<Pick<NodeBananaCanvasProps, "onUndoRecorderChange" | "remapPastedNodes" | "onImportCanvasMedia" | "onInputError" | "renderAssetPicker" | "onCreateNode">> = {},
) {
  let index = 0;
  render(
    <NodeBananaCanvasRuntime
      {...options}
      graph={graph}
      nodeTypes={{}}
      paletteItems={[
        { kind: "input.image", label: "Image Input", mediaType: "image", category: "Input" },
        { kind: "input.audio", label: "Audio Input", mediaType: "audio", category: "Input" },
        { kind: "input.prompt", label: "Prompt", mediaType: "text", category: "Text" },
        { kind: "generate.image", label: "Generate Image", mediaType: "image", category: "Generate" },
      ]}
      modelItems={[{ key: "image/model-a", label: "Image Model A", provider: "Leesfield", mediaType: "image", capabilities: ["text-to-image"] }]}
      labels={labels}
      writable={writable}
      isNodeRunnable={isNodeRunnable}
      createId={() => `created_${++index}`}
      onGraphChange={onGraphChange}
      onCreateNode={options.onCreateNode ?? ((item, position) => ({
        node: { id: `node_${item.kind}`, type: "canonicalNode", position, data: { initialModelKey: item.initialModelKey } },
      }))}
      onRunNode={onRunNode}
    />,
  );
  return onGraphChange;
}

describe("NodeBananaCanvasRuntime", () => {
  beforeEach(() => {
    flow.props = null;
    flow.controlsProps = null;
    flow.runDisabled = false;
    flow.renders = 0;
  });

  it("indexed image inputs show upload progress and ignore results after picker cancellation", async () => {
    let resolve!: (value: {assetId: string; mediaType: "image"}) => void;
    const importer = vi.fn().mockImplementation(() => new Promise(done => { resolve = done; }));
    const changed = renderRuntime({ nodes: [{ id: "compare", type: "canonicalNode", position: { x: 0, y: 0 }, data: {} }], edges: [] }, vi.fn(), true, undefined, undefined, {
      onImportCanvasMedia: importer,
      renderAssetPicker: (_type, select, close) => <><button onClick={() => select("asset")}>fixture-select</button><button onClick={close}>fixture-cancel</button></>,
      onCreateNode: (_item, position, pending) => ({ node: { id: "input-new", type: "canonicalNode", position, data: {} }, edge: { id: "edge-new", source: "input-new", target: pending!.nodeId, targetHandle: pending!.handleId } }),
    });
    fireEvent(screen.getByRole("application"), new CustomEvent("node-banana-port-menu", { bubbles: true, detail: { nodeId: "compare", handleId: "image-1", handleType: "target", x: 100, y: 100 } }));
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    fireEvent.change(document.querySelector('input[type="file"]')!, {target: {files: [new File(["image"], "upload.png", {type: "image/png"})]}});
    await waitFor(() => expect(importer).toHaveBeenCalledOnce());
    expect((flow.props?.nodes as {data: {mediaUploading?: boolean}}[])[0].data.mediaUploading).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "fixture-cancel" }));
    expect(importer.mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolve({assetId:"late",mediaType:"image"}));
    expect((flow.props?.nodes as {data: {mediaUploading?: boolean}}[])[0].data.mediaUploading).toBeUndefined();
    expect(changed).not.toHaveBeenCalled();
  });

  it("IME composition in connection search does not create a node", () => {
    const changed = renderRuntime({ nodes: [{ id: "prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: {} }], edges: [] });
    fireEvent(screen.getByRole("application"), new CustomEvent("node-banana-port-menu", { bubbles: true, detail: { nodeId: "prompt", handleId: "text", handleType: "source", x: 100, y: 100 } }));
    const search=screen.getByRole("textbox", {name:"Search connections"});
    fireEvent.keyDown(search,{key:"Enter",isComposing:true,keyCode:229});
    expect(changed).not.toHaveBeenCalled();
    expect(search).toBeInTheDocument();
  });

  it("opens the categorized All nodes menu, creates a node, and keeps command-search available", async () => {
    const onGraphChange = renderRuntime(emptyGraph);

    expect(screen.getByRole("application")).toHaveAttribute(
      "data-node-banana-component",
      "WorkflowCanvas",
    );
    expect(screen.getByRole("toolbar", { name: "Node Banana Canvas" })).toHaveAttribute(
      "data-node-banana-component",
      "FloatingActionBar",
    );
    fireEvent.click(screen.getByRole("button", { name: /All nodes/ }));
    expect(screen.getByRole("menu", { name: "All nodes" })).toHaveAttribute("data-node-banana-component", "AllNodesMenu");
    expect(screen.getByRole("heading", { name: "Input" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Generate" })).toHaveClass(
      "node-banana-runtime__section-heading--divided",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Image Input" }));
    });

    expect(onGraphChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: "node_input.image" })],
      }),
      "create",
    );
    fireEvent.keyDown(screen.getByRole("application"), { key: "z", ctrlKey: true });
    expect(onGraphChange).toHaveBeenLastCalledWith(emptyGraph, "undo");

    fireEvent.keyDown(screen.getByRole("application"), { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Add node" })).toHaveAttribute("data-node-banana-component", "NodeSearchMenu");
  });

  it("opens All models and creates a generation node with the selected model", () => {
    const onGraphChange = renderRuntime(emptyGraph);
    fireEvent.click(screen.getByRole("button", { name: "All models" }));
    expect(screen.getByRole("dialog", { name: "All models" })).toHaveAttribute("data-node-banana-component", "ModelSearchDialog");
    fireEvent.click(screen.getByRole("button", { name: /Image Model A/ }));
    expect(onGraphChange).toHaveBeenCalledWith(expect.objectContaining({
      nodes: [expect.objectContaining({ data: { initialModelKey: "image/model-a" } })],
    }), "create");
  });

  it("uses original catalog filters and excludes stale recent models before selection", () => {
    const selected = vi.fn();
    const tracked = vi.fn();
    const opened = vi.fn();
    const closed = vi.fn();
    const view = render(
      <NodeBananaUpstreamHostProvider value={{
        hostedModels: [
          { id: "same", name: "Allowed image", provider: "fal", description: null, capabilities: ["text-to-image"] },
          { id: "same", name: "Allowed video", provider: "replicate", description: null, capabilities: ["text-to-video"] },
          { id: "excluded", name: "Excluded 3D", provider: "fal", description: null, capabilities: ["text-to-3d"] },
        ],
        recentModels: [
          { modelId: "stale", displayName: "Stale model", provider: "fal", timestamp: 3 },
          { modelId: "same", displayName: "Allowed video", provider: "replicate", timestamp: 2 },
        ],
        trackModelUsage: tracked, incrementModalCount: opened, decrementModalCount: closed,
      }}>
        <ModelSearchDialog isOpen onClose={vi.fn()} onModelSelected={selected} />
      </NodeBananaUpstreamHostProvider>,
    );
    expect(screen.getByText("Recently Used")).toBeInTheDocument();
    expect(screen.queryByText("Stale model")).not.toBeInTheDocument();
    expect(screen.queryByText("Excluded 3D")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "3D" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("fal.ai"));
    expect(screen.queryByText("Recently Used")).not.toBeInTheDocument();
    expect(screen.queryByText("Allowed video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Allowed image/ }));
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: "same", provider: "fal" }));
    expect(tracked).toHaveBeenCalledWith({ modelId: "same", provider: "fal", displayName: "Allowed image" });
    expect(opened).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("filters host providers with real buttons and keeps same-ID recent identities separate", () => {
    const selected = vi.fn();
    render(<NodeBananaUpstreamHostProvider value={{
      hostedModels: [
        { id: "shared-id", name: "Space model", provider: "hf_space", description: null, capabilities: ["text-to-image"] },
        { id: "shared-id", name: "Bridge model", provider: "codex_bridge", description: null, capabilities: ["text-to-image"] },
      ],
      recentModels: [
        { modelId: "shared-id", displayName: "Space recent", provider: "hf_space", timestamp: 2 },
        { modelId: "shared-id", displayName: "Bridge recent", provider: "codex_bridge", timestamp: 1 },
      ],
    }}><ModelSearchDialog isOpen onClose={vi.fn()} onModelSelected={selected} /></NodeBananaUpstreamHostProvider>);
    expect(screen.getByText("Space recent")).toBeInTheDocument();
    expect(screen.getByText("Bridge recent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "hf_space" }));
    expect(screen.getByRole("button", { name: "hf_space" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Space model")).toBeInTheDocument();
    expect(screen.queryByText("Bridge model")).not.toBeInTheDocument();
    expect(screen.queryByText("Bridge recent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "codex_bridge" }));
    expect(screen.getByText("Bridge model")).toBeInTheDocument();
    expect(screen.queryByText("Space model")).not.toBeInTheDocument();
    expect(screen.queryByText("Space recent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bridge model/ }));
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: "shared-id", provider: "codex_bridge" }));
  });

  it("keeps search, focus and modal registration when callback identities change", () => {
    const opened = vi.fn();
    const closed = vi.fn();
    const close = vi.fn();
    const host = { incrementModalCount: opened, decrementModalCount: closed, hostedModels: [] };
    const view = render(<NodeBananaUpstreamHostProvider value={host}>
      <ModelSearchDialog isOpen onClose={() => undefined} onModelSelected={() => undefined} />
    </NodeBananaUpstreamHostProvider>);
    const search = screen.getByRole("textbox", { name: "Search models" });
    fireEvent.change(search, { target: { value: "kept search" } });
    const filter = screen.getByRole("combobox", { name: "Model capability" });
    filter.focus();
    fireEvent.change(filter, { target: { value: "audio" } });
    view.rerender(<NodeBananaUpstreamHostProvider value={host}>
      <ModelSearchDialog isOpen onClose={close} onModelSelected={() => undefined} />
    </NodeBananaUpstreamHostProvider>);
    expect(search).toHaveValue("kept search");
    expect(filter).toHaveValue("audio");
    expect(filter).toHaveFocus();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close models" }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("retries catalog failures through the host and ignores late errors after close", async () => {
    let rejectRefresh: ((error: Error) => void) | undefined;
    const refresh = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectRefresh = reject; }));
    const hosted = { hostedModels: [], onHostedModelSelected: vi.fn(), onRefresh: refresh };
    const view = render(<ModelSearchDialog isOpen onClose={vi.fn()} hosted={hosted} />);
    fireEvent.click(screen.getByTitle("Refresh models & schemas"));
    await act(async () => rejectRefresh?.(new Error("Catalog unavailable")));
    expect(screen.getByText("Catalog unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(refresh).toHaveBeenCalledTimes(2);
    view.rerender(<ModelSearchDialog isOpen={false} onClose={vi.fn()} hosted={hosted} />);
    await act(async () => rejectRefresh?.(new Error("Late failure")));
    view.rerender(<ModelSearchDialog isOpen onClose={vi.fn()} hosted={hosted} />);
    expect(screen.queryByText("Late failure")).not.toBeInTheDocument();
    expect(screen.getByTitle("Refresh models & schemas")).not.toBeDisabled();
  });

  it("pastes text at the viewport center and does not consume input/IME/modal events", async () => {
    const changed = renderRuntime(emptyGraph);
    const canvas = screen.getByRole("application");
    fireEvent.paste(canvas, { clipboardData: { files: [], getData: () => "hello" } });
    await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ nodes: [
      expect.objectContaining({ position: { x: -160, y: -110 }, data: expect.objectContaining({ config: { text: "hello" } }) }),
    ] }), "paste"));
    changed.mockClear();
    const input = document.createElement("textarea");
    canvas.append(input);
    fireEvent.paste(input, { clipboardData: { files: [], getData: () => "leave text alone" } });
    fireEvent.keyDown(canvas, { key: "P", shiftKey: true, isComposing: true });
    canvas.focus();
    fireEvent.keyDown(canvas, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close keyboard shortcuts" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: /^Close$/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(close).toHaveFocus();
    expect(screen.queryByText("Run workflow")).not.toBeInTheDocument();
    expect(screen.queryByText("Add LLM Text node")).not.toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: "P", shiftKey: true });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close keyboard shortcuts" }));
    expect(canvas).toHaveFocus();
    fireEvent.keyDown(canvas, { key: "P", shiftKey: true });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("uses system images before text and replaces only the selected image's content", async () => {
    const node = { id: "image", type: "canonicalNode", position: { x: 1, y: 2 }, data: {
      canonicalKind: "input.image", config: { assetId: "old", splitSource: { nodeId: "split", index: 0 }, presentation: { comment: "keep" } },
    } };
    const upload = vi.fn().mockResolvedValue({ assetId: "new", mediaType: "image" });
    const changed = renderRuntime({ nodes: [node], edges: [] }, vi.fn(), true, undefined, undefined, { onImportCanvasMedia: upload });
    const read = vi.fn().mockResolvedValue([
      { types: ["text/plain"], getType: vi.fn().mockResolvedValue(new Blob(["text"])) },
      { types: ["image/png"], getType: vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" })) },
    ]);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { read } });
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));
    fireEvent.keyDown(screen.getByRole("application"), { key: "v", ctrlKey: true });
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: "leesfield-pasted-image.png", type: "image/png" }), expect.any(AbortSignal));
    expect(changed.mock.calls[0][0].nodes).toEqual([{ ...node, data: { ...node.data,
      config: { assetId: "new", presentation: { comment: "keep" } },
    } }]);
  });

  it("consumes the internal clipboard once then reads the system clipboard, reporting denied permission", async () => {
    const read = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { read } });
    const error = vi.fn();
    const changed = renderRuntime({ nodes: [{ id: "a", type: "canonicalNode", position: { x: 0, y: 0 }, data: {} }], edges: [] }, vi.fn(), true,
      undefined, undefined, { onInputError: error });
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));
    const canvas = screen.getByRole("application");
    fireEvent.keyDown(canvas, { key: "c", ctrlKey: true });
    fireEvent.keyDown(canvas, { key: "v", ctrlKey: true });
    expect(read).not.toHaveBeenCalled();
    fireEvent.keyDown(canvas, { key: "v", ctrlKey: true });
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.objectContaining({ name: "NotAllowedError" })));
    expect(changed).toHaveBeenCalledOnce();
    expect(canvas).toHaveAttribute("aria-busy", "false");
  });

  it("batches durable drops with x+240 spacing and ignores duplicate in-flight delivery", async () => {
    let resolve!: (asset: { assetId: string; mediaType: "image" }) => void;
    const upload = vi.fn().mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValueOnce({ assetId: "asset-b", mediaType: "audio" });
    const changed = renderRuntime(emptyGraph, vi.fn(), true, undefined, undefined, { onImportCanvasMedia: upload });
    const canvas = screen.getByRole("application");
    const files = [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.wav", { type: "audio/wav" })];
    const dataTransfer = { files, getData: () => "" };
    const drop = () => {
      const event = new MouseEvent("drop", { bubbles: true, clientX: 100, clientY: 200 });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      fireEvent(canvas, event);
    };
    drop();
    drop();
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    await act(async () => resolve({ assetId: "asset-a", mediaType: "image" }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledTimes(2);
    expect(changed.mock.calls[0][0].nodes.map((node: { position: unknown }) => node.position)).toEqual([
      { x: 100, y: 200 }, { x: 340, y: 200 },
    ]);
  });

  it("aborts pending media on unmount and refuses read-only paste/drop", async () => {
    let resolve!: (asset: { assetId: string; mediaType: "image" }) => void;
    const upload = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const changed = renderRuntime(emptyGraph, vi.fn(), true, undefined, undefined, { onImportCanvasMedia: upload });
    const clipboardData = { files: [new File(["a"], "a.png", { type: "image/png" })], getData: () => "" };
    fireEvent.paste(screen.getByRole("application"), { clipboardData });
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    cleanup();
    expect(upload.mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolve({ assetId: "late", mediaType: "image" }));
    expect(changed).not.toHaveBeenCalled();
    upload.mockClear();
    const readOnlyChange = renderRuntime(emptyGraph, vi.fn(), false, undefined, undefined, { onImportCanvasMedia: upload });
    fireEvent.paste(screen.getByRole("application"), { clipboardData });
    fireEvent.drop(screen.getByRole("application"), { dataTransfer: { ...clipboardData, getData: () => "input.image" } });
    expect(upload).not.toHaveBeenCalled();
    expect(readOnlyChange).not.toHaveBeenCalled();
  });

  it("releases a hung native clipboard read on timeout and allows retry without stale unmount errors", async () => {
    vi.useFakeTimers();
    try {
      const readText = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce("retry");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
      const error = vi.fn();
      const changed = renderRuntime(emptyGraph, vi.fn(), true, undefined, undefined, { onInputError: error });
      const canvas = screen.getByRole("application");
      fireEvent.keyDown(canvas, { key: "v", ctrlKey: true });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "CANVAS_IMPORT_TIMEOUT" }));
      expect(canvas).toHaveAttribute("aria-busy", "false");
      await act(async () => { fireEvent.keyDown(canvas, { key: "v", ctrlKey: true }); });
      expect(changed).toHaveBeenCalledOnce();
      readText.mockImplementationOnce(() => new Promise(() => {}));
      fireEvent.keyDown(canvas, { key: "v", ctrlKey: true });
      cleanup();
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(error).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("keeps intervening graph edits and aborts a pending drop when permissions change", async () => {
    let resolve!: (asset: { assetId: string; mediaType: "image" }) => void;
    const upload = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const changed = vi.fn();
    const base = {
      nodeTypes: {}, paletteItems: [{ kind: "input.image", label: "Image", mediaType: "image" as const, category: "Input" as const }],
      labels, onGraphChange: changed, createId: () => "imported", onImportCanvasMedia: upload,
      onCreateNode: (_item: unknown, position: { x: number; y: number }) => ({
        node: { id: "imported", type: "canonicalNode", position, data: {} },
      }),
    };
    const view = render(<NodeBananaCanvasRuntime {...base} graph={emptyGraph} writable />);
    const clipboardData = { files: [new File(["a"], "a.png", { type: "image/png" })], getData: () => "" };
    fireEvent.paste(screen.getByRole("application"), { clipboardData });
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    const added = { id: "concurrent", type: "canonicalNode", position: { x: 90, y: 20 }, data: {} };
    const current = { nodes: [added], edges: [] };
    view.rerender(<NodeBananaCanvasRuntime {...base} graph={current} writable />);
    await act(async () => resolve({ assetId: "new", mediaType: "image" }));
    expect(changed.mock.calls[0][0].nodes[0]).toEqual(added);
    changed.mockClear(); upload.mockClear();
    fireEvent.paste(screen.getByRole("application"), { clipboardData });
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    view.rerender(<NodeBananaCanvasRuntime {...base} graph={current} writable={false} />);
    expect(upload.mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolve({ assetId: "must-not-insert", mediaType: "image" }));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("application")).toHaveAttribute("aria-busy", "false");
  });

  it("restores measured V/H/G layout order and excludes unapproved Shift node shortcuts", () => {
    const nodes = [{ id: "a", x: 50, y: 100 }, { id: "b", x: 20, y: 200 }, { id: "c", x: 90, y: 50 }]
      .map(({ id, x, y }) => ({ id, type: "canonicalNode", position: { x, y }, measured: { width: 100, height: 80 }, data: {} }));
    const changed = renderRuntime({ nodes, edges: [] });
    act(() => (flow.props?.onNodesChange as (changes: unknown[]) => void)(nodes.map((node) => ({ type: "select", id: node.id, selected: true }))));
    const canvas = screen.getByRole("application");
    const positions = () => Object.fromEntries(changed.mock.calls.at(-1)![0].nodes.map((node: { id: string; position: unknown }) => [node.id, node.position]));
    fireEvent.keyDown(canvas, { key: "v" });
    expect(positions()).toEqual({ c: { x: 20, y: 50 }, a: { x: 20, y: 150 }, b: { x: 20, y: 250 } });
    fireEvent.keyDown(canvas, { key: "h" });
    expect(positions()).toEqual({ b: { x: 20, y: 50 }, a: { x: 140, y: 50 }, c: { x: 260, y: 50 } });
    fireEvent.keyDown(canvas, { key: "g" });
    expect(positions()).toEqual({ c: { x: 20, y: 50 }, a: { x: 140, y: 50 }, b: { x: 20, y: 150 } });
    changed.mockClear();
    for (const key of ["R", "L", "C"]) fireEvent.keyDown(canvas, { key, shiftKey: true });
    fireEvent.keyDown(canvas, { key: "Enter", ctrlKey: true });
    expect(changed).not.toHaveBeenCalled();
  });

  it("stores selection and clipboard history outside the durable graph", async () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "select-first" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(screen.getByRole("application"), { key: "c", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("application"), { key: "v", ctrlKey: true });

    expect(onGraphChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: "node_1" }),
          expect.objectContaining({ id: "created_1", position: { x: 60, y: 70 } }),
        ],
      }),
      "paste",
    );
  });

  it("includes external Split snapshots in the same undo and redo history", () => {
    const current: NodeBananaRuntimeGraph = {
      nodes: [{ id: "cell", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }], edges: [],
    };
    const register = vi.fn();
    const changed = renderRuntime(current, vi.fn(), true, undefined, undefined, { onUndoRecorderChange: register });
    act(() => register.mock.calls.at(-1)?.[0](emptyGraph));
    fireEvent.keyDown(screen.getByRole("application"), { key: "z", ctrlKey: true });
    expect(changed).toHaveBeenLastCalledWith(emptyGraph, "undo");
    fireEvent.keyDown(screen.getByRole("application"), { key: "z", ctrlKey: true, shiftKey: true });
    expect(changed).toHaveBeenLastCalledWith(current, "redo");
  });

  it("remaps host clipboard metadata before assigning copied node IDs", () => {
    const node = { id: "split", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} };
    const remap = vi.fn((nodes) => nodes.map((entry: typeof node) => ({ ...entry, data: { remapped: true } })));
    const changed = renderRuntime({ nodes: [node], edges: [] }, vi.fn(), true, undefined, undefined, { remapPastedNodes: remap });
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));
    fireEvent.keyDown(screen.getByRole("application"), { key: "c", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("application"), { key: "v", ctrlKey: true });
    expect(remap).toHaveBeenCalledWith([expect.objectContaining({ id: "split" })], { split: "created_1" }, { x: 50, y: 50 }, {});
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: [node, expect.objectContaining({ id: "created_1", data: { remapped: true } })],
    }), "paste");
  });

  it("copies only selected group members with fresh frame identity and keeps originals unchanged", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: ["a", "b"].map((id, index) => ({ id, type: "canonicalNode", position: { x: index * 320, y: 10 }, data: {} })), edges: [],
      groups: [{ id: "frame", title: "Frame", color: "blue", locked: true,
        bounds: { x: -20, y: -10, width: 640, height: 320 }, memberNodeIds: ["a", "b"] }],
    };
    const before = structuredClone(graph);
    const changed = renderRuntime(graph);
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));
    fireEvent.keyDown(screen.getByRole("application"), { key: "c", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("application"), { key: "v", ctrlKey: true });
    const pasted = changed.mock.calls.at(-1)?.[0] as NodeBananaRuntimeGraph;
    expect(pasted.groups).toEqual([graph.groups![0], { ...graph.groups![0], id: "created_2",
      bounds: { x: 30, y: 40, width: 640, height: 320 }, memberNodeIds: ["created_1"] }]);
    expect(graph).toEqual(before);
    fireEvent.keyDown(screen.getByRole("application"), { key: "z", ctrlKey: true });
    expect(changed).toHaveBeenLastCalledWith(graph, "undo");
  });

  it("deleting a final member prunes only its newly emptied group and undo restores membership", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "a", type: "canonicalNode", position: { x: 0, y: 0 }, data: {} }], edges: [],
      groups: [
        { id: "frame", title: "Frame", color: "neutral", locked: false, bounds: { x: -20, y: -20, width: 340, height: 320 }, memberNodeIds: ["a"] },
        { id: "empty", title: "Empty", color: "blue", locked: true, bounds: { x: 900, y: 0, width: 100, height: 100 }, memberNodeIds: [] },
      ],
    };
    const changed = renderRuntime(graph);
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));
    fireEvent.keyDown(screen.getByRole("application"), { key: "Delete" });
    expect(changed).toHaveBeenLastCalledWith({ nodes: [], edges: [], groups: [graph.groups![1]] }, "delete");
    fireEvent.keyDown(screen.getByRole("application"), { key: "z", ctrlKey: true });
    expect(changed).toHaveBeenLastCalledWith(graph, "undo");
  });

  it("uses the dragged node center and first matching group even when that group is locked", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "a", type: "canonicalNode", position: { x: -500, y: 0 }, width: 100, height: 100, data: {} }], edges: [],
      groups: ["first", "second"].map((id) => ({ id, title: id, color: "neutral", locked: true,
        bounds: { x: 0, y: 0, width: 300, height: 300 }, memberNodeIds: [] })),
    };
    const changed = renderRuntime(graph);
    act(() => {
      (flow.props?.onNodeDragStart as () => void)();
      (flow.props?.onNodesChange as (changes: unknown[]) => void)([{ id: "a", type: "position", position: { x: 50, y: 50 }, dragging: true }]);
    });
    act(() => { (flow.props?.onNodeDragStop as (event: unknown, node: unknown) => void)({}, { ...graph.nodes[0], position: { x: 50, y: 50 } }); });
    const moved = changed.mock.calls.at(-1)?.[0] as NodeBananaRuntimeGraph;
    expect(moved.groups?.map((group) => group.memberNodeIds)).toEqual([["a"], []]);
    fireEvent.keyDown(screen.getByRole("application"), { key: "z", ctrlKey: true });
    expect(changed).toHaveBeenLastCalledWith(graph, "undo");
  });

  it("keeps marquee node and edge selection single-sourced and outside the durable graph", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} },
        { id: "node_2", type: "canonicalNode", position: { x: 300, y: 20 }, data: {} },
      ],
      edges: [{ id: "edge_1", source: "node_1", target: "node_2", data: {} }],
    };
    const onGraphChange = renderRuntime(graph);

    expect(flow.props?.onSelectionChange).toBeUndefined();

    act(() => {
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
        { id: "node_1", type: "select", selected: true },
      ]);
      (flow.props?.onEdgesChange as ((changes: unknown[]) => void) | undefined)?.([
        { id: "edge_1", type: "select", selected: true },
      ]);
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
        { id: "node_2", type: "select", selected: true },
      ]);
    });

    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({ id: "node_1", selected: true }),
      expect.objectContaining({ id: "node_2", selected: true }),
    ]);
    expect(flow.props?.edges).toEqual([
      expect.objectContaining({ id: "edge_1", selected: true }),
    ]);
    expect(screen.getByRole("toolbar", { name: "Selected nodes" })).toHaveTextContent(
      "2 selected",
    );
    expect(onGraphChange).not.toHaveBeenCalled();

    const settledRenders = flow.renders;
    act(() => {
      for (let index = 0; index < 64; index += 1) {
        (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
          { id: "node_1", type: "select", selected: true },
          { id: "node_2", type: "select", selected: true },
        ]);
        (flow.props?.onEdgesChange as ((changes: unknown[]) => void) | undefined)?.([
          { id: "edge_1", type: "select", selected: true },
        ]);
      }
    });

    expect(flow.renders).toBe(settledRenders);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("keeps measured node dimensions in ephemeral runtime state", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);

    fireEvent.click(screen.getByRole("button", { name: "measure-first" }));

    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({ id: "node_1", width: 240, height: 160 }),
    ]);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("preserves each node dimension when React Flow measures nodes separately", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} },
        { id: "node_2", type: "canonicalNode", position: { x: 300, y: 20 }, data: {} },
      ],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);

    fireEvent.click(screen.getByRole("button", { name: "measure-first" }));
    fireEvent.click(screen.getByRole("button", { name: "measure-second" }));

    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({
        id: "node_1",
        width: 240,
        height: 160,
        measured: { width: 240, height: 160 },
      }),
      expect.objectContaining({
        id: "node_2",
        width: 320,
        height: 180,
        measured: { width: 320, height: 180 },
      }),
    ]);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("buffers drag positions in runtime state and publishes once on drag stop", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);

    act(() => {
      (flow.props?.onNodeDragStart as (() => void) | undefined)?.();
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([
        {
          id: "node_1",
          type: "position",
          position: { x: 80, y: 90 },
          dragging: true,
        },
      ]);
    });

    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({ id: "node_1", position: { x: 80, y: 90 } }),
    ]);
    expect(onGraphChange).not.toHaveBeenCalled();

    act(() => {
      (flow.props?.onNodeDragStop as ((event: unknown, node: unknown) => void) | undefined)?.(
        {},
        { ...graph.nodes[0], position: { x: 80, y: 90 } },
      );
    });

    expect(onGraphChange).toHaveBeenCalledTimes(1);
    expect(onGraphChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: "node_1", position: { x: 80, y: 90 } })],
      }),
      "drag",
    );
  });

  it("does not write runtime state again for an identical controlled position update", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    renderRuntime(graph);
    const initialRenders = flow.renders;

    act(() => {
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
        id: "node_1",
        type: "position",
        position: { x: 10, y: 20 },
        dragging: false,
      }]);
    });
    expect(flow.renders).toBe(initialRenders);

    act(() => {
      (flow.props?.onNodeDragStart as (() => void) | undefined)?.();
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
        id: "node_1",
        type: "position",
        position: { x: 90, y: 100 },
        dragging: true,
      }]);
    });
    const movedRenders = flow.renders;
    expect(movedRenders).toBeGreaterThan(initialRenders);

    act(() => {
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
        id: "node_1",
        type: "position",
        position: { x: 90, y: 100 },
        dragging: true,
      }]);
    });
    expect(flow.renders).toBe(movedRenders);

    act(() => {
      (flow.props?.onNodeDragStop as ((event: unknown, node: unknown) => void) | undefined)?.(
        {},
        { ...graph.nodes[0], position: { x: 90, y: 100 } },
      );
    });
    const stoppedRenders = flow.renders;

    act(() => {
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
        id: "node_1",
        type: "position",
        position: { x: 10, y: 20 },
        dragging: false,
      }]);
    });
    expect(flow.renders).toBe(stoppedRenders);
  });

  it("ignores controlled position reconciliation outside an active drag gesture", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);
    const initialRenders = flow.renders;

    for (let index = 0; index < 64; index += 1) {
      act(() => {
        (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
          id: "node_1",
          type: "position",
          position: { x: 80 + index, y: 90 + index },
          dragging: false,
        }]);
      });
    }

    expect(flow.renders).toBe(initialRenders);
    expect(onGraphChange).not.toHaveBeenCalled();
    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({ id: "node_1", position: { x: 10, y: 20 } }),
    ]);
  });

  it("ignores React Flow controlled reconciliation even while a drag session is active", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);
    const initialRenders = flow.renders;

    act(() => {
      (flow.props?.onNodeDragStart as (() => void) | undefined)?.();
      for (let index = 0; index < 64; index += 1) {
        (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
          id: "node_1",
          type: "position",
          position: { x: 90 + index, y: 100 + index },
          dragging: false,
        }]);
      }
    });

    expect(flow.renders).toBe(initialRenders);
    expect(onGraphChange).not.toHaveBeenCalled();

    act(() => {
      (flow.props?.onNodeDragStop as ((event: unknown, node: unknown) => void) | undefined)?.(
        {},
        { ...graph.nodes[0], position: graph.nodes[0].position },
      );
    });
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("ignores controlled node replacement reconciliation", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);
    const initialRenders = flow.renders;

    act(() => {
      for (let index = 0; index < 64; index += 1) {
        (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
          id: "node_1",
          type: "replace",
          item: {
            ...graph.nodes[0],
            data: { reconciliation: index },
          },
        }]);
      }
    });

    expect(flow.renders).toBe(initialRenders);
    expect(onGraphChange).not.toHaveBeenCalled();
    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({ id: "node_1", data: {} }),
    ]);
  });

  it("publishes a meaningful controlled replacement position", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);

    act(() => {
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
        id: "node_1",
        type: "replace",
        item: {
          ...graph.nodes[0],
          position: { x: 80, y: 90 },
        },
      }]);
    });

    expect(onGraphChange).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: "node_1", position: { x: 80, y: 90 } })],
      }),
      "nodes",
    );
  });

  it("retains bounded upstream Settings geometry without persisting host data or selection", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, style: { width: 300, height: 300 }, data: { canonicalKind: "generate.video" } }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);
    const item = { ...graph.nodes[0], width: 300, height: 500, selected: true,
      data: { ...graph.nodes[0].data, _settingsPanelHeight: 200, unwanted: true } };
    act(() => {
      (flow.props?.onNodesChange as (changes: unknown[]) => void)([{ id: item.id, type: "replace", item }]);
    });
    const renders = flow.renders;
    act(() => {
      for (let index = 0; index < 64; index += 1) {
        (flow.props?.onNodesChange as (changes: unknown[]) => void)([{ id: item.id, type: "replace", item }]);
      }
    });
    expect(flow.renders).toBe(renders);
    expect(flow.props?.nodes).toEqual([expect.objectContaining({
      width: 300, height: 500, style: { width: 300, height: 500 }, selected: false,
      data: { canonicalKind: "generate.video", _settingsPanelHeight: 200 },
    })]);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("dismisses hosted menus on outside pointer, switches menus, and handles Escape", () => {
    renderRuntime({ nodes: [], edges: [] });
    const generate = screen.getByRole("button", { name: "Generate" });
    const allNodes = screen.getByRole("button", { name: "All nodes" });
    fireEvent.click(generate);
    expect(generate).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(allNodes);
    expect(generate).toHaveAttribute("aria-expanded", "false");
    expect(allNodes).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(allNodes).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(generate);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(generate).toHaveAttribute("aria-expanded", "false");
    expect(generate).toHaveFocus();
  });

  it("lets explicit NodeResizer dimensions supersede Settings geometry but not passive measurements", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 0, y: 0 }, data: {} }], edges: [],
    };
    const onGraphChange = renderRuntime(graph);
    act(() => (flow.props?.onNodesChange as (changes: unknown[]) => void)([{
      id: "node_1", type: "replace",
      item: { ...graph.nodes[0], width: 300, height: 500, data: { _settingsPanelHeight: 200 } },
    }]));
    act(() => (flow.props?.onNodesChange as (changes: unknown[]) => void)([{
      id: "node_1", type: "dimensions", dimensions: { width: 400, height: 600 }, setAttributes: true,
    }]));
    act(() => (flow.props?.onNodesChange as (changes: unknown[]) => void)([{
      id: "node_1", type: "dimensions", dimensions: { width: 301, height: 501 },
    }]));
    expect(flow.props?.nodes).toEqual([expect.objectContaining({
      width: 400, height: 600, style: { width: 400, height: 600 }, data: { _settingsPanelHeight: 200 },
    })]);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("does not synchronously clear and re-feed a stale drag buffer on the next drag start", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onGraphChange = renderRuntime(graph);

    act(() => {
      (flow.props?.onNodeDragStart as (() => void) | undefined)?.();
      (flow.props?.onNodesChange as ((changes: unknown[]) => void) | undefined)?.([{
        id: "node_1",
        type: "position",
        position: { x: 50, y: 60 },
        dragging: true,
      }]);
    });
    const bufferedRenders = flow.renders;

    act(() => {
      (flow.props?.onNodeDragStart as (() => void) | undefined)?.();
    });
    expect(flow.renders).toBe(bufferedRenders);
    expect(flow.props?.nodes).toEqual([
      expect.objectContaining({ position: { x: 50, y: 60 } }),
    ]);

    act(() => {
      (flow.props?.onNodeDragStop as ((event: unknown, node: unknown) => void) | undefined)?.(
        {},
        { ...graph.nodes[0], position: { x: 50, y: 60 } },
      );
    });
    expect(onGraphChange).toHaveBeenCalledOnce();
  });

  it("opens the upstream edge toolbar and publishes pause or delete actions", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} },
        { id: "node_2", type: "canonicalNode", position: { x: 300, y: 20 }, data: {} },
      ],
      edges: [{ id: "edge_1", source: "node_1", target: "node_2", data: {} }],
    };
    const onGraphChange = renderRuntime(graph);

    act(() => {
      (flow.props?.onEdgeClick as ((event: { clientX: number; clientY: number }, edge: NodeBananaRuntimeGraph["edges"][number]) => void) | undefined)?.(
        { clientX: 240, clientY: 180 },
        graph.edges[0],
      );
    });

    const toolbar = screen.getByRole("toolbar", { name: "Selected edge" });
    expect(toolbar).toHaveAttribute("data-node-banana-component", "EdgeToolbar");
    expect(toolbar).toHaveStyle({ left: "240px", top: "140px" });

    fireEvent.click(screen.getByRole("button", { name: "Add pause" }));
    expect(onGraphChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        edges: [expect.objectContaining({ id: "edge_1", data: { hasPause: true } })],
      }),
      "edges",
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete edge" }));
    expect(onGraphChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ edges: [] }),
      "delete",
    );
  });

  it("renders the upstream pause glyph on a paused edge path", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} },
        { id: "node_2", type: "canonicalNode", position: { x: 300, y: 20 }, data: {} },
      ],
      edges: [{ id: "edge_1", source: "node_1", target: "node_2", data: { hasPause: true } }],
    };
    renderRuntime(graph);

    expect(flow.props?.edges).toEqual([
      expect.objectContaining({
        id: "edge_1",
        type: "editable",
        data: expect.objectContaining({ hasPause: true, edgeStyle: "angular" }),
      }),
    ]);
    expect(flow.props?.defaultEdgeOptions).toEqual({ type: "editable" });

    const EditableEdge = (flow.props?.edgeTypes as Record<string, ComponentType<Record<string, unknown>>>).editable;
    render(
      <svg>
        <EditableEdge
          id="edge_1"
          source="node_1"
          target="node_2"
          sourceX={0}
          sourceY={50}
          targetX={200}
          targetY={50}
          sourcePosition="right"
          targetPosition="left"
          data={{ hasPause: true, edgeStyle: "angular" }}
        />
      </svg>,
    );
    expect(screen.getByRole("img", { name: "Paused edge" })).toHaveAttribute(
      "data-node-banana-component",
      "PauseIndicator",
    );
  });

  it("uses the upstream canvas navigation layout and exposes a minimap", () => {
    renderRuntime(emptyGraph);

    expect(screen.getByTestId("minimap")).toBeInTheDocument();
    expect(flow.props).toMatchObject({ nodesDraggable: true, panOnDrag: true });
    expect(screen.getByRole("toolbar", { name: "Node Banana Canvas" })).toHaveTextContent(
      "ImageVideoPromptGenerateOutputAll nodesAll modelsRun",
    );
    expect(screen.queryByText("＋")).not.toBeInTheDocument();
  });

  it("gives the visible Fit View control the same mobile safe-area options as the canvas", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} },
        { id: "node_2", type: "canonicalNode", position: { x: 300, y: 400 }, data: {} },
      ],
      edges: [],
    };
    renderRuntime(graph);

    expect(flow.props?.fitViewOptions).toEqual({
      minZoom: 0.1,
      maxZoom: 1,
      padding: { top: "24px", right: "24px", bottom: "144px", left: "24px" },
    });
    expect(flow.controlsProps?.fitViewOptions).toEqual(flow.props?.fitViewOptions);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("blocks durable edits in read-only mode", () => {
    const onGraphChange = renderRuntime(emptyGraph, vi.fn(), false);

    expect(screen.getByRole("status")).toHaveTextContent("Read-only");
    expect(screen.getByRole("button", { name: /All nodes/ })).toBeDisabled();
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("keeps the bottom Run action invalid when the selected node is not runnable", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    renderRuntime(graph, vi.fn(), true, () => false);
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("runs the selected node through the host callback when its header is portaled", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [{ id: "node_1", type: "canonicalNode", position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    };
    const onRunNode = vi.fn();
    flow.runDisabled = true;
    renderRuntime(graph, vi.fn(), true, () => true, onRunNode);
    fireEvent.click(screen.getByRole("button", { name: "select-first" }));

    expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRunNode).toHaveBeenCalledWith("node_1");
  });
});
