import { act, useEffect, type ComponentType } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NodeBananaCanvasProps } from "@node-banana-runtime/runtime-entry";
import { canonicalNodeKinds } from "@/shared/generation-graph/node-registry";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { createIntlWrapper } from "@/test-utils/intl";

const runtime = vi.hoisted(() => ({
  props: null as NodeBananaCanvasProps | null,
  echoControlledGraph: false,
  renders: 0,
}));

type MockUpstreamNodeProps = {
  id: string;
  data: { config?: Record<string, unknown>; nextModelKey?: string };
  host?: { removeEdge?: (edgeId: string) => void };
  onUpdateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
};

vi.mock("@node-banana-runtime/runtime-entry", async (importOriginal) => ({
  ...await importOriginal<typeof import("@node-banana-runtime/runtime-entry")>(),
  NodeBananaCanvasErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  NodeBananaCanvasRuntime: (props: NodeBananaCanvasProps) => {
    runtime.props = props;
    runtime.renders += 1;
    const { graph, onGraphChange } = props;
    useEffect(() => {
      if (runtime.echoControlledGraph) onGraphChange(graph, "nodes");
    }, [graph, onGraphChange]);
    return <div data-testid="node-banana-canvas" />;
  },
  NodeBananaUpstreamNode: ({ id, data, host, onUpdateNodeData }: MockUpstreamNodeProps) => (
    <>
      <button
        type="button"
        data-testid={`mock-upstream-${id}`}
        onClick={() => onUpdateNodeData(id, {
          config: { ...data.config, modelKey: data.nextModelKey ?? "image/t2i" },
        })}
      >
        Update upstream node
      </button>
      <button
        type="button"
        data-testid={`mock-disconnect-${id}`}
        onClick={() => host?.removeEdge?.("edge-to-remove")}
      >
        Disconnect upstream edge
      </button>
    </>
  ),
  NodeBananaUpstreamHeader: () => null,
}));

import { NodeBananaStudio } from "./node-banana-studio";
import { SpacePreferencesContext } from "../hook/use-space-preferences";
import { downloadImageZip } from "../lib/image-zip-download";

vi.mock("../lib/image-zip-download", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/image-zip-download")>(),
  downloadImageZip: vi.fn().mockResolvedValue(undefined),
}));

const graph: GenerationGraphSnapshotDto = {
  id: "graph_1",
  title: "Workflow",
  version: 1,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
  nodes: [
    {
      id: "node_1",
      kind: "input.image",
      position: { x: 10, y: 20 },
      configVersion: 1,
      config: { assetId: null },
      selectedOutputAssetId: null,
    },
  ],
  edges: [],
  writable: true,
  readOnlyReason: null,
};

const catalog = {
  imageModels: [],
  videoModels: [],
  audioModels: [],
  isLoading: false,
  error: null,
  retry: vi.fn(),
  backgroundRemovalAvailable: false,
};

const runnableGraph: GenerationGraphSnapshotDto = {
  ...graph,
  nodes: [
    { ...graph.nodes[0], id: "source", config: { assetId: "asset-1" } },
    { ...graph.nodes[0], kind: "edit.image.resize", config: { parameters: {
      mode: "maxEdge", width: 1024, height: 1024, maxEdge: 2048,
      scalePct: 100, fit: "contain", padColor: "#00000000", format: "keep", quality: 0.92,
    } } },
  ],
  edges: [{ id: "image-edge", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "node_1", targetPortId: "image", sortOrder: 0 }],
};

describe("NodeBananaStudio host adapter", () => {
  it("awaits hosted catalog refresh and forwards refresh failures", async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<NodeBananaStudio graph={graph} onDraftChange={vi.fn()}
      prepareImageNodeExecution={vi.fn()} catalog={{ ...catalog, refresh }}
      writable readOnlyReason={null} />, { wrapper: createIntlWrapper() });
    let settled = false;
    const pending = runtime.props!.host!.refreshHostedModels!().then(() => { settled = true; });
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finish();
    await pending;
    expect(settled).toBe(true);
    const error = new Error("Catalog unavailable");
    refresh.mockRejectedValueOnce(error);
    await expect(runtime.props!.host!.refreshHostedModels!()).rejects.toBe(error);
  });
  it("applies owner defaults only to new nodes and rejects stale defaults after a catalog change", () => {
    const model = modelWithImageDefaults();
    const onDraftChange = vi.fn(), trackModel = vi.fn();
    const preferences = { data: { schemaVersion: 1 as const, revision: 2, recentModelKeys: [model.key], defaults: { image: { modelKey: model.key, parameters: { steps: 8 } } } },
      error: null, saving: false, trackModel, saveDefaults: vi.fn(), saveSettings: vi.fn(), retry: vi.fn(), inlineParametersEnabled: false, setInlineParametersEnabled: vi.fn() };
    const makeView = (active = true) => <SpacePreferencesContext.Provider value={preferences}>
      <NodeBananaStudio graph={graph} onDraftChange={onDraftChange} prepareImageNodeExecution={vi.fn()}
        catalog={{ ...catalog, imageModels: [{ ...model, isActive: active }] }} writable readOnlyReason={null} />
    </SpacePreferencesContext.Provider>;
    const view = render(makeView(), { wrapper: createIntlWrapper() });
    expect(onDraftChange).not.toHaveBeenCalled();
    const created = runtime.props!.onCreateNode({ kind: "generate.image", label: "Generate Image" }, { x: 0, y: 0 }, null);
    expect(created.node.data.config).toMatchObject({ modelKey: model.key, parameters: { steps: 8 } });
    expect(trackModel).toHaveBeenCalledWith(model.key);
    expect(runtime.props!.graph.nodes[0].data.config).toEqual({ assetId: null });
    const candidate = { kind: "generate.image", label: "Generate Image" };
    const pending = { nodeId: "node_1", handleId: "image", handleType: "source" as const };
    expect(runtime.props!.filterPaletteItems!([candidate], pending)).toEqual([]);
    expect(() => runtime.props!.onCreateNode(candidate, { x: 0, y: 0 }, pending)).toThrow("CONNECTION_NOT_AVAILABLE");
    view.rerender(makeView(false));
    const stale = runtime.props!.onCreateNode({ kind: "generate.image", label: "Generate Image" }, { x: 0, y: 0 }, null);
    expect(stale.node.data.config).toMatchObject({ modelKey: null });
    expect(runtime.props!.filterPaletteItems!([candidate], pending)).toEqual([candidate]);
  });
  it("creates groups from measured bounds with upstream padding/color and ungroup retains frames", () => {
    const onDraftChange = vi.fn();
    const grouped = { ...graph, groups: [{ id: "old", title: "Old", color: "neutral" as const, locked: false,
      bounds: { x: 0, y: 0, width: 100, height: 100 }, memberNodeIds: ["node_1"] }] };
    render(<NodeBananaStudio graph={grouped} onDraftChange={onDraftChange}
      prepareImageNodeExecution={vi.fn().mockResolvedValue(1)} catalog={catalog}
      writable readOnlyReason={null} />, { wrapper: createIntlWrapper() });
    const source = runtime.props!.graph.nodes[0];
    act(() => runtime.props?.onCreateGroup?.(["node_1", "absent"], [{ ...source, measured: { width: 550, height: 420 } }]));
    const draft = onDraftChange.mock.calls.at(-1)?.[0];
    expect(draft.groups).toEqual([
      { ...grouped.groups[0], memberNodeIds: [] },
      expect.objectContaining({ title: "Group 2", color: "blue", locked: false, memberNodeIds: ["node_1"],
        bounds: { x: source.position.x - 20, y: source.position.y - 20, width: 590, height: 460 } }),
    ]);
    act(() => runtime.props?.onUngroup?.(["node_1"]));
    expect(onDraftChange.mock.calls.at(-1)?.[0].groups.map((group: { memberNodeIds: string[] }) => group.memberNodeIds)).toEqual([[], []]);
  });
  it("routes selected image ZIP errors to the host and releases the busy state", async () => {
    const error = new Error("Image download failed (403).");
    vi.mocked(downloadImageZip).mockRejectedValueOnce(error);
    const onHostError = vi.fn();
    render(<NodeBananaStudio graph={graph} onDraftChange={vi.fn()}
      prepareImageNodeExecution={vi.fn().mockResolvedValue(1)} catalog={catalog}
      writable readOnlyReason={null} onHostError={onHostError} />, { wrapper: createIntlWrapper() });
    await act(async () => { await runtime.props?.onDownloadSelectedImages?.(["node_1"]); });
    expect(onHostError).toHaveBeenCalledWith(error);
    expect(runtime.props?.downloadingImages).toBe(false);
  });

  it("cancels ZIP on Space change and ignores duplicate download clicks", async () => {
    let finish: (() => void) | undefined;
    vi.mocked(downloadImageZip).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const props = { graph, onDraftChange: vi.fn(), prepareImageNodeExecution: vi.fn().mockResolvedValue(1),
      catalog, writable: true, readOnlyReason: null, onHostError: vi.fn() };
    const view = render(<NodeBananaStudio {...props} />, { wrapper: createIntlWrapper() });
    let download: void | Promise<void> | undefined;
    act(() => { download = runtime.props?.onDownloadSelectedImages?.(["node_1"]); });
    await act(async () => { await runtime.props?.onDownloadSelectedImages?.(["node_1"]); });
    expect(downloadImageZip).toHaveBeenCalledOnce();
    const signal = vi.mocked(downloadImageZip).mock.calls[0][1];
    expect(runtime.props?.downloadingImages).toBe(true);
    view.rerender(<NodeBananaStudio {...props} graph={{ ...graph, id: "different_space" }} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { finish?.(); await download; });
    expect(runtime.props?.downloadingImages).toBe(false);
    expect(props.onHostError).not.toHaveBeenCalled();
  });

  it("keeps nodes in locked Split groups editable, matching upstream lock semantics", () => {
    const lockedGraph = {
      ...graph,
      groups: [{ id: "group_1", title: "Cell", color: "neutral" as const, locked: true,
        bounds: { x: 0, y: 0, width: 400, height: 400 }, memberNodeIds: ["node_1"] }],
      nodes: [...graph.nodes, {
        id: "split", kind: "edit.image.splitGrid", position: { x: 0, y: 0 },
        configVersion: 1, selectedOutputAssetId: null,
        config: { parameters: { rows: 1, cols: 1 }, materialization: {
          rows: 1, cols: 1, cells: [{ baseNodeId: "node_1", nodeIds: ["node_1"], groupId: "group_1" }],
        } },
      }],
    };
    render(<NodeBananaStudio graph={lockedGraph} onDraftChange={vi.fn()}
      prepareImageNodeExecution={vi.fn().mockResolvedValue(1)} catalog={catalog}
      writable readOnlyReason={null} />, { wrapper: createIntlWrapper() });
    expect(runtime.props?.graph.nodes.find((node) => node.id === "node_1")?.draggable).toBe(true);
  });

  beforeEach(() => {
    runtime.props = null;
    runtime.echoControlledGraph = false;
    runtime.renders = 0;
    vi.clearAllMocks();
  });

  it("converges when the controlled canvas echoes an unchanged graph", () => {
    runtime.echoControlledGraph = true;
    const onDraftChange = vi.fn();

    render(
      <NodeBananaStudio
        graph={graph}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    expect(onDraftChange).not.toHaveBeenCalled();
    expect(runtime.renders).toBe(1);
  });

  it("treats canonical config objects with different key insertion order as the same draft", () => {
    const onDraftChange = vi.fn();
    render(
      <NodeBananaStudio
        graph={{
          ...graph,
          nodes: [{
            ...graph.nodes[0],
            kind: "generate.image",
            config: {
              prompt: "",
              modelKey: "image/test",
              parameters: {
                width: 1024,
                height: 1024,
                inputSchema: [{ name: "prompt", type: "text", required: true }],
              },
            },
          }],
        }}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const canvas = runtime.props as NodeBananaCanvasProps;
    const current = canvas.graph.nodes[0];
    const config = current.data.config as Record<string, unknown>;
    const parameters = config.parameters as Record<string, unknown>;
    act(() => canvas.onGraphChange({
      ...canvas.graph,
      nodes: [{
        ...current,
        data: {
          ...current.data,
          config: {
            modelKey: config.modelKey,
            parameters: {
              inputSchema: parameters.inputSchema,
              height: parameters.height,
              width: parameters.width,
            },
            prompt: config.prompt,
          },
        },
      }],
    }, "nodes"));

    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("publishes every approved canonical node in Node Banana section order", () => {
    render(
      <NodeBananaStudio
        graph={graph}
        onDraftChange={vi.fn()}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={{ ...catalog, backgroundRemovalAvailable: true }}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const items = (runtime.props as NodeBananaCanvasProps).paletteItems;
    expect(items.map((item) => item.kind)).toEqual(canonicalNodeKinds);
    expect(new Set(items.map((item) => item.category))).toEqual(
      new Set(["Input", "Text", "Generate", "Process", "Output"]),
    );
    expect(items.find((item) => item.kind === "input.prompt")).toMatchObject({ label: "Prompt", category: "Text" });
    expect(items.find((item) => item.kind === "generate.image")).toMatchObject({ label: "Generate Image" });
    expect(items.find((item) => item.kind === "edit.image.annotation")).toMatchObject({ label: "Annotate" });
    expect(items.find((item) => item.kind === "output.single")).toMatchObject({ label: "Output" });
    expect(items.every((item) => item.description === undefined)).toBe(true);
  });

  it("ignores repeated canonical no-op updates and keeps runtime callbacks stable", () => {
    const firstDraftChange = vi.fn();
    const secondDraftChange = vi.fn();
    const view = render(
      <NodeBananaStudio
        graph={graph}
        onDraftChange={firstDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const initialProps = runtime.props as NodeBananaCanvasProps;
    const initialCallbacks = {
      onGraphChange: initialProps.onGraphChange,
      onCreateNode: initialProps.onCreateNode,
      createId: initialProps.createId,
      isValidConnection: initialProps.isValidConnection,
      filterPaletteItems: initialProps.filterPaletteItems,
    };

    act(() => initialProps.onGraphChange(initialProps.graph, "nodes"));
    expect(firstDraftChange).not.toHaveBeenCalled();

    const movedGraph = {
      ...initialProps.graph,
      nodes: initialProps.graph.nodes.map((node) => ({
        ...node,
        position: { x: node.position.x + 40, y: node.position.y },
      })),
    };
    act(() => initialProps.onGraphChange(movedGraph, "drag"));
    expect(firstDraftChange).toHaveBeenCalledOnce();
    expect(firstDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ position: { x: 50, y: 20 } })],
      }),
    );

    const updatedProps = runtime.props as NodeBananaCanvasProps;
    act(() => updatedProps.onGraphChange(movedGraph, "drag"));
    expect(firstDraftChange).toHaveBeenCalledOnce();

    view.rerender(
      <NodeBananaStudio
        graph={{ ...graph }}
        onDraftChange={secondDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={{ ...catalog }}
        writable
        readOnlyReason={null}
      />,
    );

    const rerenderedProps = runtime.props as NodeBananaCanvasProps;
    expect(rerenderedProps.onGraphChange).toBe(initialCallbacks.onGraphChange);
    expect(rerenderedProps.onCreateNode).toBe(initialCallbacks.onCreateNode);
    expect(rerenderedProps.createId).toBe(initialCallbacks.createId);
    expect(rerenderedProps.isValidConnection).toBe(initialCallbacks.isValidConnection);
    expect(rerenderedProps.filterPaletteItems).toBe(initialCallbacks.filterPaletteItems);

    act(() => rerenderedProps.onGraphChange({ ...movedGraph, nodes: movedGraph.nodes.map((node) => ({
      ...node,
      position: { x: 90, y: 20 },
    })) }, "drag"));
    expect(secondDraftChange).toHaveBeenCalledOnce();
  });

  it("converges across repeated drag publishes and saved query snapshots", () => {
    const onDraftChange = vi.fn();
    const prepareExecution = vi.fn().mockResolvedValue(1);
    const view = render(
      <NodeBananaStudio
        graph={graph}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={prepareExecution}
        catalog={catalog}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    let savedGraph = graph;
    for (let index = 0; index < 48; index += 1) {
      const controlled = (runtime.props as NodeBananaCanvasProps).graph;
      const moved = {
        ...controlled,
        nodes: controlled.nodes.map((node) => ({
          ...node,
          position: { x: 30 + index * 7, y: 40 + index * 5 },
        })),
      };

      act(() => {
        (runtime.props as NodeBananaCanvasProps).onGraphChange(moved, "drag");
      });
      expect(onDraftChange).toHaveBeenCalledTimes(index + 1);

      const draft = onDraftChange.mock.lastCall?.[0];
      savedGraph = {
        ...savedGraph,
        title: draft.title,
        version: savedGraph.version + 1,
        nodes: draft.nodes,
        edges: draft.edges,
      };
      view.rerender(
        <NodeBananaStudio
          graph={savedGraph}
          onDraftChange={onDraftChange}
          prepareImageNodeExecution={prepareExecution}
          catalog={catalog}
          writable
          readOnlyReason={null}
        />,
      );

      act(() => {
        const latest = runtime.props as NodeBananaCanvasProps;
        latest.onGraphChange(latest.graph, "nodes");
      });
      expect(onDraftChange).toHaveBeenCalledTimes(index + 1);
    }

    expect((runtime.props as NodeBananaCanvasProps).graph.nodes[0]?.position).toEqual({
      x: 30 + 47 * 7,
      y: 40 + 47 * 5,
    });
    expect(runtime.renders).toBeLessThan(150);
  });

  it("blocks duplicate Run calls while the first hosted execution is active", async () => {
    let release: (() => void) | undefined;
    const onRegenerateNode = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    render(
      <NodeBananaStudio
        graph={runnableGraph}
        onDraftChange={vi.fn()}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable
        readOnlyReason={null}
        onRegenerateNode={onRegenerateNode}
      />,
      { wrapper: createIntlWrapper() },
    );

    const run = (runtime.props as NodeBananaCanvasProps).onRunNode;
    expect(runtime.props!.isNodeRunnable!("node_1")).toBe(true);
    let first: ReturnType<NonNullable<typeof run>>;
    let duplicate: ReturnType<NonNullable<typeof run>>;
    act(() => {
      first = run!("node_1");
      duplicate = run!("node_1");
    });
    expect((runtime.props as NodeBananaCanvasProps).isNodeRunnable?.("node_1")).toBe(false);
    expect(onRegenerateNode).toHaveBeenCalledOnce();
    await expect(duplicate!).resolves.toBeUndefined();
    await act(async () => {
      release?.();
      await first;
    });
    expect(runtime.props!.isNodeRunnable!("node_1")).toBe(true);
  });

  it.each(["pending", "processing", "uploading"])("disables toolbar Run for a %s execution and restores it after completion", (executionStatus) => {
    const props = {
      graph: runnableGraph,
      onDraftChange: vi.fn(), prepareImageNodeExecution: vi.fn(), catalog,
      writable: true, readOnlyReason: null, onRegenerateNode: vi.fn(),
      resolveUpstreamNodeData: () => ({ executionStatus }),
    };
    const { rerender } = render(<NodeBananaStudio {...props} />, { wrapper: createIntlWrapper() });
    expect(runtime.props!.isNodeRunnable!("node_1")).toBe(false);
    rerender(<NodeBananaStudio {...props} resolveUpstreamNodeData={() => ({ executionStatus: "completed" })} />);
    expect(runtime.props!.isNodeRunnable!("node_1")).toBe(true);
  });

  it("blocks every hosted Run entry point when the workflow is read-only", async () => {
    const onRegenerateNode = vi.fn();
    render(
      <NodeBananaStudio
        graph={{
          ...graph,
          writable: false,
          readOnlyReason: "UNSUPPORTED_GRAPH",
          nodes: [{
            ...graph.nodes[0],
            kind: "edit.image.resize",
            config: { parameters: {} },
          }],
        }}
        onDraftChange={vi.fn()}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable={false}
        readOnlyReason="UNSUPPORTED_GRAPH"
        onRegenerateNode={onRegenerateNode}
      />,
      { wrapper: createIntlWrapper() },
    );

    await expect((runtime.props as NodeBananaCanvasProps).onRunNode?.("node_1")).resolves.toBeUndefined();
    expect(onRegenerateNode).not.toHaveBeenCalled();
    expect((runtime.props as NodeBananaCanvasProps).isNodeRunnable?.("node_1")).toBe(false);
  });

  it("drops hosted node data mutations at the canonical boundary when read-only", () => {
    const onDraftChange = vi.fn();
    render(
      <NodeBananaStudio
        graph={{ ...graph, writable: false, readOnlyReason: "UNSUPPORTED_GRAPH" }}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable={false}
        readOnlyReason="UNSUPPORTED_GRAPH"
      />,
      { wrapper: createIntlWrapper() },
    );

    const canvasProps = runtime.props as NodeBananaCanvasProps;
    const RuntimeNode = canvasProps.nodeTypes.canonicalNode as ComponentType<NodeProps>;
    const node = canvasProps.graph.nodes[0];
    render(<RuntimeNode {...({ id: node.id, data: node.data } as unknown as NodeProps)} />, {
      wrapper: createIntlWrapper(),
    });
    fireEvent.click(screen.getByTestId("mock-upstream-node_1"));
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("publishes upstream Disconnect through the canonical edge projection", () => {
    const onDraftChange = vi.fn();
    const graphWithEdge: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [
        graph.nodes[0],
        {
          ...graph.nodes[0],
          id: "operation",
          kind: "edit.image.gif",
          position: { x: 300, y: 20 },
          config: { parameters: {} },
        },
      ],
      edges: [{
        id: "edge-to-remove",
        sourceNodeId: "node_1",
        sourcePortId: "image",
        targetNodeId: "operation",
        targetPortId: "frames",
        sortOrder: 0,
      }],
    };
    render(
      <NodeBananaStudio
        graph={graphWithEdge}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={catalog}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const canvasProps = runtime.props as NodeBananaCanvasProps;
    const RuntimeNode = canvasProps.nodeTypes.canonicalNode as ComponentType<NodeProps>;
    const operation = canvasProps.graph.nodes.find((node) => node.id === "operation");
    render(<RuntimeNode {...({ id: "operation", data: operation?.data } as unknown as NodeProps)} />, {
      wrapper: createIntlWrapper(),
    });
    fireEvent.click(screen.getByTestId("mock-disconnect-operation"));

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ edges: [] }));
  });

  it("reconciles incompatible media edges when an actual upstream model control updates config", () => {
    const onDraftChange = vi.fn();
    const model = (key: string, maxInputImages: number, parameters: Record<string, unknown> = {}) => ({
      type: "image" as const,
      key,
      label: key,
      vendor: "test",
      provider: "test",
      parameters,
      meta: { max_input_images: maxInputImages },
      isActive: true,
      isDefault: false,
    });
    const modelGraph: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [
        { ...graph.nodes[0], id: "source", config: { assetId: null } },
        {
          ...graph.nodes[0],
          id: "target",
          kind: "generate.image",
          position: { x: 300, y: 20 },
          config: { prompt: "test", modelKey: "image/i2i", parameters: {} },
        },
      ],
      edges: [{
        id: "reference-edge",
        sourceNodeId: "source",
        sourcePortId: "image",
        targetNodeId: "target",
        targetPortId: "references",
        sortOrder: 0,
      }],
    };
    render(
      <NodeBananaStudio
        graph={modelGraph}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={{ ...catalog, imageModels: [model("image/i2i", 1), model("image/t2i", 0)] }}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const canvasProps = runtime.props as NodeBananaCanvasProps;
    const RuntimeNode = canvasProps.nodeTypes.generationNode as ComponentType<NodeProps>;
    const target = canvasProps.graph.nodes.find((node) => node.id === "target");
    render(<RuntimeNode {...({ id: "target", data: target?.data } as unknown as NodeProps)} />, {
      wrapper: createIntlWrapper(),
    });
    fireEvent.click(screen.getByTestId("mock-upstream-target"));

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      edges: [],
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "target",
          config: expect.objectContaining({ modelKey: "image/t2i" }),
        }),
      ]),
    }));
  });

  it("materializes canonical image defaults when the hosted upstream model changes", () => {
    const onDraftChange = vi.fn();
    const selectedModel = modelWithImageDefaults();
    const modelGraph: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [{
        ...graph.nodes[0],
        id: "generation",
        kind: "generate.image",
        config: { prompt: "quiet lake", modelKey: null, parameters: {} },
      }],
    };

    render(
      <NodeBananaStudio
        graph={modelGraph}
        onDraftChange={onDraftChange}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={{ ...catalog, imageModels: [selectedModel] }}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const canvasProps = runtime.props as NodeBananaCanvasProps;
    const RuntimeNode = canvasProps.nodeTypes.generationNode as ComponentType<NodeProps>;
    const target = canvasProps.graph.nodes.find((node) => node.id === "generation");
    render(<RuntimeNode {...({ id: "generation", data: { ...target?.data, nextModelKey: selectedModel.key } } as unknown as NodeProps)} />, {
      wrapper: createIntlWrapper(),
    });
    fireEvent.click(screen.getByTestId("mock-upstream-generation"));

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "generation",
          config: expect.objectContaining({
            modelKey: selectedModel.key,
            parameters: expect.objectContaining({
              width: 1024,
              height: 1024,
              imageCount: 1,
              steps: 10,
              seed: "42",
            }),
          }),
        }),
      ]),
    }));
  });

  it("materializes canonical image defaults when All models creates a preselected node", () => {
    const selectedModel = modelWithImageDefaults();
    render(
      <NodeBananaStudio
        graph={graph}
        onDraftChange={vi.fn()}
        prepareImageNodeExecution={vi.fn().mockResolvedValue(1)}
        catalog={{ ...catalog, imageModels: [selectedModel] }}
        writable
        readOnlyReason={null}
      />,
      { wrapper: createIntlWrapper() },
    );

    const canvasProps = runtime.props as NodeBananaCanvasProps;
    const modelItem = canvasProps.modelItems?.find((item) => item.key === selectedModel.key);
    expect(modelItem).toBeTruthy();
    const created = canvasProps.onCreateNode(
      {
        kind: "generate.image",
        label: selectedModel.label,
        category: "Generate",
        mediaType: "image",
        initialModelKey: modelItem?.key,
      },
      { x: 100, y: 120 },
      null,
    );

    expect(created.node.data.config).toMatchObject({
      modelKey: selectedModel.key,
      parameters: {
        width: 1024,
        height: 1024,
        imageCount: 1,
        steps: 10,
        seed: "42",
      },
    });
  });
});

function modelWithImageDefaults() {
  return {
    type: "image" as const,
    key: "mrfakename-z-image-turbo-v2",
    label: "Gradio",
    vendor: "HUGGINGFACE",
    provider: "hf_space",
    parameters: {
      width: { ui: "input", min: 256, max: 2048, step: 1, default: 1024 },
      height: { ui: "input", min: 256, max: 2048, step: 1, default: 1024 },
      steps: { ui: "range", min: 1, max: 50, step: 1, default: 10 },
      seed: { ui: "input", default: 42 },
      imageCount: { ui: "hidden", min: 1, max: 1, step: 1, default: 1 },
    },
    meta: { max_input_images: 0 },
    isActive: true,
    isDefault: false,
  };
}
