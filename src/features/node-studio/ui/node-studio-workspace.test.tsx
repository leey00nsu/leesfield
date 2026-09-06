import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationGraphSnapshotDto } from "@/features/node-studio/model/graph-types";
import { renderWithIntl } from "@/test-utils/intl";

import { NodeStudioWorkspace } from "./node-studio-workspace";

const mocks = vi.hoisted(() => ({
  useAutosave: vi.fn(),
  update: vi.fn(),
  retry: vi.fn(),
  saveNow: vi.fn(),
  nodeStudio: vi.fn(),
  usePreferences: vi.fn(),
  saveDefaults: vi.fn(),
  saveSettings: vi.fn(),
  upload: vi.fn(),
}));

const outputMocks = vi.hoisted(() => ({
  listExecutions: vi.fn(),
  listAssets: vi.fn(),
  startExecution: vi.fn(),
  runImage: vi.fn(),
  cancelExecution: vi.fn(),
}));

vi.mock("../lib/browser-image-operation-runner", () => ({
  runBrowserImageOperation: outputMocks.runImage,
  runPreparedAnnotationOperation: vi.fn(),
}));

const mediaApiMocks = vi.hoisted(() => ({
  getMediaAsset: vi.fn(),
}));

vi.mock("../hook/use-graph-autosave", () => ({
  useGraphAutosave: mocks.useAutosave,
}));

vi.mock("../hook/use-space-preferences", async (importOriginal) => ({
  ...await importOriginal<typeof import("../hook/use-space-preferences")>(),
  useSpacePreferencesSession: mocks.usePreferences,
}));

const loadedPreferences = {
  data: { schemaVersion: 1 as const, revision: 1, recentModelKeys: [], defaults: {} },
  error: null, saving: false, trackModel: vi.fn(), saveDefaults: mocks.saveDefaults, saveSettings: mocks.saveSettings,
  retry: vi.fn(), inlineParametersEnabled: false, setInlineParametersEnabled: vi.fn(),
};

vi.mock("@/shared/lib/hooks/use-runtime-model-catalog", () => ({
  useRuntimeModelCatalog: () => ({
    imageModels: [],
    audioModels: [],
    videoModels: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../api/node-execution-api", () => ({
  listNodeExecutions: outputMocks.listExecutions,
  startNodeExecution: outputMocks.startExecution,
  cancelNodeExecution: outputMocks.cancelExecution,
}));

vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  getMediaAsset: mediaApiMocks.getMediaAsset,
}));

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  mediaAssetKeys: { all: ["media-assets"] },
  useMediaAssetList: outputMocks.listAssets,
  useUploadMediaAsset: () => ({ mutateAsync: mocks.upload, isPending: false }),
}));

vi.mock("./node-studio", () => ({
  NodeStudio: (props: unknown) => {
    mocks.nodeStudio(props);
    return <div>canvas</div>;
  },
}));

const graph: GenerationGraphSnapshotDto = {
  id: "graph-a",
  title: "Graph A",
  version: 3,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  nodes: [],
  edges: [],
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("NodeStudioWorkspace", () => {
  it.each(["newer upload", "history", "unmount"])("does not replace an input after %s supersedes an upload", async (scenario) => {
    const inputGraph: GenerationGraphSnapshotDto = { ...graph, nodes: [{ id: "input", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: null }, selectedOutputAssetId: null }] };
    const pending: Array<(value: unknown) => void> = [];
    mocks.upload.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const view = renderWithIntl(<NodeStudioWorkspace graph={inputGraph} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    const studio = () => mocks.nodeStudio.mock.lastCall?.[0] as {
      onInputMediaUpload: (input: { nodeId: string; mediaType: string; dataUrl: string; filename: string; mimeType: string }) => Promise<unknown>;
      onDraftChange: (draft: unknown) => void;
    };
    const input = { nodeId: "input", mediaType: "image", dataUrl: "data:image/png;base64,YQ==", filename: "first.png", mimeType: "image/png" };
    const first = studio().onInputMediaUpload(input).catch((error: Error) => error);
    await waitFor(() => expect(pending).toHaveLength(1));
    if (scenario === "newer upload") {
      const second = studio().onInputMediaUpload({ ...input, filename: "second.png" });
      await waitFor(() => expect(pending).toHaveLength(2));
      await act(async () => { pending[1]({ id: "second", type: "image", url: "https://cdn.test/second.png" }); expect(await second).toEqual({ assetId: "second" }); });
      // The Canvas owns publishing the returned asset into its current draft.
      act(() => studio().onDraftChange({ ...inputGraph, nodes: inputGraph.nodes.map((node) => ({ ...node, config: { assetId: "second" } })) }));
    } else if (scenario === "history") {
      act(() => studio().onDraftChange({ ...inputGraph, nodes: inputGraph.nodes.map((node) => ({ ...node, config: { assetId: "history" } })) }));
    } else view.unmount();
    const count = mocks.update.mock.calls.length;
    await act(async () => { pending[0]({ id: "first", type: "image", url: "https://cdn.test/first.png" }); expect(await first).toMatchObject({ name: "AbortError" }); });
    expect(mocks.update).toHaveBeenCalledTimes(count);
    if (scenario !== "unmount") expect(mocks.update.mock.lastCall?.[0].nodes[0].config.assetId).toBe(scenario === "history" ? "history" : "second");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.usePreferences.mockReturnValue(loadedPreferences);
    mocks.saveDefaults.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.useAutosave.mockReturnValue({
      status: "saved",
      version: 3,
      update: mocks.update,
      retry: mocks.retry,
      saveNow: mocks.saveNow,
    });
    mocks.saveNow.mockResolvedValue({ status: "saved", version: 3 });
    outputMocks.listExecutions.mockResolvedValue([]);
    outputMocks.startExecution.mockReset();
    outputMocks.runImage.mockReset();
    mediaApiMocks.getMediaAsset.mockReset();
    outputMocks.listAssets.mockImplementation((assetIds: readonly string[]) =>
      assetIds.map((id) => ({
        data: { id, type: "video", url: `https://cdn.test/${id}.mp4`, durationMs: 2_000 },
        isLoading: false,
        isError: false,
      })),
    );
  });

  it("waits for saving before the brand back button leaves", async () => {
    const user = userEvent.setup(); const onBack = vi.fn();
    let finish!: () => void;
    mocks.saveNow.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { container } = renderWithIntl(<NodeStudioWorkspace graph={graph} onSaved={vi.fn()} onDelete={vi.fn()}
      onReloadLatest={vi.fn()} onStatusChange={vi.fn()} onBack={onBack} />);
    const back = screen.getByRole("button", { name: "스페이스 목록으로" });
    expect(back.nextElementSibling).toBe(container.querySelector('[data-app-brand-logo]'));
    await user.click(back); expect(onBack).not.toHaveBeenCalled(); expect(back).toBeDisabled();
    await act(async () => { finish(); }); expect(onBack).toHaveBeenCalledOnce();
  });
  it.each(["dirty", "saving"])("saves before selecting another Space while %s", async (status) => {
    const user = userEvent.setup(); const select = vi.fn();
    let finish!: () => void;
    mocks.useAutosave.mockReturnValue({ status, update: mocks.update, retry: mocks.retry, saveNow: mocks.saveNow });
    mocks.saveNow.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderWithIntl(<NodeStudioWorkspace graph={graph} graphs={[graph, { ...graph, id: "graph-b", title: "Graph B" }]}
      onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onSelectGraph={select} />);
    await user.click(screen.getByRole("button", { name: "Open space" }));
    await user.click(screen.getByRole("button", { name: "Graph B" }));
    expect(select).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(select).toHaveBeenCalledExactlyOnceWith("graph-b");
  });
  it("retains the selected Space after failed save until explicit discard", async () => {
    const user = userEvent.setup(); const select = vi.fn();
    mocks.saveNow.mockRejectedValue(new Error("conflict"));
    renderWithIntl(<NodeStudioWorkspace graph={graph} graphs={[graph, { ...graph, id: "graph-b", title: "Graph B" }]}
      onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onSelectGraph={select} />);
    await user.click(screen.getByRole("button", { name: "Open space" }));
    await user.click(screen.getByRole("button", { name: "Graph B" }));
    expect(select).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" })).getByRole("button", { name: "변경 사항을 버리고 나가기" }));
    expect(select).toHaveBeenCalledExactlyOnceWith("graph-b");
  });
  it("does not discard failed saves without explicit confirmation", async () => {
    const user = userEvent.setup(); const onBack = vi.fn(); mocks.saveNow.mockRejectedValue(new Error("conflict"));
    renderWithIntl(<NodeStudioWorkspace graph={graph} onSaved={vi.fn()} onDelete={vi.fn()}
      onReloadLatest={vi.fn()} onStatusChange={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: "스페이스 목록으로" }));
    expect(onBack).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" });
    await user.click(within(dialog).getByRole("button", { name: "변경 사항을 버리고 나가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
  it("requires explicit discard before creating another space after a save conflict", async () => {
    const user = userEvent.setup(); const create = vi.fn();
    mocks.saveNow.mockRejectedValue(new Error("conflict"));
    renderWithIntl(<NodeStudioWorkspace graph={graph} onSaved={vi.fn()} onDelete={vi.fn()}
      onReloadLatest={vi.fn()} onStatusChange={vi.fn()} onCreateGraph={create} />);
    await user.click(screen.getByRole("button", { name: "Open space" }));
    await user.click(screen.getByRole("button", { name: "New space" }));
    await user.click(within(screen.getByRole("dialog", { name: "New space" })).getByRole("button", { name: "Create" }));
    expect(create).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" })).getByRole("button", { name: "변경 사항을 버리고 나가기" }));
    expect(create).toHaveBeenCalledWith("Untitled Space");
  });
  it.each(["unmount", "pagehide"])("aborts only this workspace's browser operation on %s", async (event) => {
    const snapshot: GenerationGraphSnapshotDto = { ...graph, nodes: [{
      id: "resize", kind: "edit.image.resize", position: { x: 0, y: 0 }, configVersion: 1,
      config: {}, selectedOutputAssetId: null,
    }] };
    outputMocks.startExecution.mockResolvedValue({ executionId: "owned-operation", plan: { kind: "edit.image.resize" } });
    let operationSignal: AbortSignal | undefined;
    outputMocks.runImage.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      operationSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true }));
    });
    const rendered = renderWithIntl(<NodeStudioWorkspace graph={snapshot} onSaved={vi.fn()} onDelete={vi.fn()}
      onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    const studio = mocks.nodeStudio.mock.lastCall?.[0] as { onRegenerateNode: (nodeId: string) => Promise<unknown> };
    const running = studio.onRegenerateNode("resize");
    const rejected = expect(running).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => expect(operationSignal).toBeDefined());
    await act(async () => {
      if (event === "unmount") rendered.unmount();
      else window.dispatchEvent(new Event("pagehide"));
      await rejected;
    });
    expect(operationSignal?.aborted).toBe(true);
  });

  it("does not restart or cancel a restored active browser operation on mount", async () => {
    outputMocks.listExecutions.mockResolvedValue([{ executionId: "other-tab-operation", status: "processing",
      progress: 1, outputAssetIds: [] }]);
    renderWithIntl(<NodeStudioWorkspace graph={{ ...graph, nodes: [{
      id: "resize", kind: "edit.image.resize", position: { x: 0, y: 0 }, configVersion: 1,
      config: {}, selectedOutputAssetId: null,
    }] }} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    await waitFor(() => expect(outputMocks.listExecutions).toHaveBeenCalled());
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
    expect(outputMocks.runImage).not.toHaveBeenCalled();
    expect(outputMocks.cancelExecution).not.toHaveBeenCalled();
  });

  it("Graph 이름 변경을 autosave draft에 반영한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Space settings" }));
    const title = screen.getByRole("textbox", { name: "Space name" });
    await user.clear(title);
    await user.type(title, "Renamed");
    await user.keyboard("{Enter}");

    expect(mocks.update).toHaveBeenLastCalledWith({
      schemaVersion: 3, groups: [],
      title: "Renamed",
      nodes: [],
      edges: [],
    });
  });

  it("v2 Graph를 Node Banana runtime과 writer v2 autosave에 연결한다", () => {
    const { container } = renderWithIntl(
      <NodeStudioWorkspace
        graph={{ ...graph, schemaVersion: 3, groups: [], minimumWriterVersion: 3 }}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(mocks.useAutosave).toHaveBeenCalledWith(
      expect.objectContaining({
        initialDraft: expect.objectContaining({ schemaVersion: 3, groups: [] }),
      }),
    );
    expect(mocks.nodeStudio).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({ schemaVersion: 3, groups: [], minimumWriterVersion: 3 }),
    }));
    expect(container.querySelector('[data-app-brand-logo]')).toHaveTextContent("leesfield");
    expect(screen.queryByRole("heading", { name: "Node Banana" })).not.toBeInTheDocument();
    expect(container.querySelector('[data-node-banana-component="Home"]')).toBeInTheDocument();
    expect(container.querySelector('[data-node-banana-component="Header"]')).toBeInTheDocument();
  });

  it("동일한 드래그 draft가 반복 유입되어도 workspace와 autosave가 한 번만 갱신된다", () => {
    const graphWithNode: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [{
        id: "node-1",
        kind: "input.image",
        position: { x: 10, y: 20 },
        configVersion: 1,
        config: { assetId: null },
        selectedOutputAssetId: null,
      }],
    };
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graphWithNode}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    const studio = mocks.nodeStudio.mock.lastCall?.[0] as {
      onDraftChange: (draft: {
        schemaVersion: 3; groups: GenerationGraphSnapshotDto["groups"];
        title: string;
        nodes: GenerationGraphSnapshotDto["nodes"];
        edges: GenerationGraphSnapshotDto["edges"];
      }) => void;
    };
    const movedDraft = {
      schemaVersion: 3 as const, groups: [],
      title: graph.title,
      nodes: graphWithNode.nodes.map((node) => ({
        ...node,
        position: { x: 180, y: 240 },
      })),
      edges: graphWithNode.edges,
    };

    act(() => {
      for (let index = 0; index < 64; index += 1) studio.onDraftChange(movedDraft);
    });

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(movedDraft);
  });

  it("clearing a selected operation output removes the current projection even when history remains", async () => {
    const operationId = "trim-output";
    outputMocks.listExecutions.mockResolvedValue([{
      executionId: "execution-1",
      graphId: graph.id,
      nodeId: operationId,
      executionKind: "media_operation",
      status: "completed",
      progress: 100,
      outputAssetIds: ["latest-output"],
    }]);
    const graphWithOutput: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [{
        id: operationId,
        kind: "edit.video.trim",
        position: { x: 0, y: 0 },
        configVersion: 1,
        config: { parameters: { startMs: 0, endMs: 2_000 } },
        selectedOutputAssetId: "selected-output",
      }],
    };
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graphWithOutput}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.nodeStudio).toHaveBeenCalled());
    const initialProps = mocks.nodeStudio.mock.lastCall?.[0] as {
      resolveUpstreamNodeData: (nodeId: string, data: Record<string, unknown>) => Record<string, unknown> | null;
      onDraftChange: (draft: unknown) => void;
    };
    await waitFor(() => expect(initialProps.resolveUpstreamNodeData(operationId, {})).toMatchObject({
      outputVideo: "/api/media-assets/selected-output/content",
    }));

    act(() => {
      initialProps.onDraftChange({
        schemaVersion: 3, groups: [],
        title: graphWithOutput.title,
        nodes: graphWithOutput.nodes.map((node) => ({ ...node, selectedOutputAssetId: null })),
        edges: [],
      });
    });

    await waitFor(() => {
      const clearedProps = mocks.nodeStudio.mock.lastCall?.[0] as typeof initialProps;
      expect(clearedProps.resolveUpstreamNodeData(operationId, {})).toMatchObject({ outputVideo: null });
    });
  });

  it("waits for a server operation and projects its durable output before returning", async () => {
    const serverAsset = {
      id: "server-output",
      version: 1,
      type: "image",
      status: "completed",
      origin: "media_operation",
      mimeType: "image/png",
      bytes: "4",
      width: 1,
      height: 1,
      durationMs: null,
      sourceOperationId: "server-operation",
      url: "/api/media-assets/server-output/content",
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    } as const;
    let operationStarted = false;
    let operationPolls = 0;
    const pending = {
      executionId: "server-operation",
      executionKind: "media_operation" as const,
      mediaType: "image" as const,
      graphNodeId: "remove-server",
      status: "pending" as const,
      progress: 0,
      errorCode: null,
      modelKey: null,
      outputAssetIds: [],
      createdAt: "2026-09-05T00:00:00.000Z",
    };
    const completed = {
      ...pending,
      status: "completed" as const,
      progress: 100,
      outputAssetIds: [serverAsset.id],
    };
    outputMocks.startExecution.mockImplementation(async () => {
      operationStarted = true;
      return pending;
    });
    outputMocks.listExecutions.mockImplementation(async (_graphId: string, nodeId: string) => {
      if (nodeId !== "remove-server" || !operationStarted) return [];
      operationPolls += 1;
      return [operationPolls === 1 ? pending : completed];
    });
    mediaApiMocks.getMediaAsset.mockResolvedValue(serverAsset);

    const graphWithServerOperation: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [
        {
          id: "source-server",
          kind: "input.image",
          position: { x: 0, y: 0 },
          configVersion: 1,
          config: { assetId: "source-asset" },
          selectedOutputAssetId: null,
        },
        {
          id: "remove-server",
          kind: "edit.image.removeBackground",
          position: { x: 300, y: 0 },
          configVersion: 1,
          config: { parameters: { model: "isnet_fp16" } },
          selectedOutputAssetId: null,
        },
      ],
      edges: [{
        id: "server-edge",
        sourceNodeId: "source-server",
        sourcePortId: "image",
        targetNodeId: "remove-server",
        targetPortId: "image",
        sortOrder: 0,
      }],
    };
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graphWithServerOperation}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const studio = mocks.nodeStudio.mock.lastCall?.[0] as {
      onRegenerateNode: (nodeId: string) => Promise<{ selectedOutputAssetId?: string | null } | undefined>;
    };
    let result: { selectedOutputAssetId?: string | null } | undefined;
    await act(async () => {
      result = await studio.onRegenerateNode("remove-server");
    });
    expect(result).toEqual({ selectedOutputAssetId: "server-output" });
    expect(operationPolls).toBeGreaterThanOrEqual(2);
    expect(mediaApiMocks.getMediaAsset).toHaveBeenCalledWith("server-output", expect.any(AbortSignal));
  });

  it.each([
    ["edit.image.resize", "image", "image"],
    ["edit.video.trim", "video", "video"],
    ["generate.audio", "audio", "audio"],
    ["edit.image.splitGrid", "images", "image"],
  ])("clearing %s empties downstream values and asset references", async (kind, outputPort, mediaType) => {
    outputMocks.listExecutions.mockImplementation(async (_graphId: string, nodeId: string) => nodeId === "operation"
      ? [{ executionId: "past-execution", graphId: graph.id, nodeId, executionKind: "media_operation",
          status: "completed", progress: 100, outputAssetIds: ["result", "other-result"] }]
      : []);
    const snapshot: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [
        { id: "input", kind: `input.${mediaType}`, position: { x: 0, y: 0 }, configVersion: 1,
          config: { assetId: "original" }, selectedOutputAssetId: null },
        { id: "operation", kind, position: { x: 200, y: 0 }, configVersion: 1,
          config: {}, selectedOutputAssetId: "result" },
        { id: "single", kind: "output.single", position: { x: 400, y: 0 }, configVersion: 1,
          config: {}, selectedOutputAssetId: null },
        { id: "gallery", kind: "output.gallery", position: { x: 400, y: 200 }, configVersion: 1,
          config: {}, selectedOutputAssetId: null },
      ],
      edges: [
        { id: "original-input", sourceNodeId: "input", sourcePortId: mediaType, targetNodeId: "operation", targetPortId: mediaType, sortOrder: 0 },
        { id: "single-input", sourceNodeId: "operation", sourcePortId: outputPort, targetNodeId: "single", targetPortId: mediaType, sortOrder: 0 },
        { id: "gallery-input", sourceNodeId: "operation", sourcePortId: outputPort, targetNodeId: "gallery", targetPortId: mediaType, sortOrder: 0 },
      ],
    };
    renderWithIntl(<NodeStudioWorkspace graph={snapshot} onSaved={vi.fn()} onDelete={vi.fn()}
      onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    type StudioProps = {
      resolveUpstreamNodeData: (nodeId: string, data: Record<string, unknown>) => Record<string, unknown> | null;
      onDraftChange: (draft: unknown) => void;
    };
    await waitFor(() => {
      const props = mocks.nodeStudio.mock.lastCall?.[0] as StudioProps;
      expect(props.resolveUpstreamNodeData("single", {})).toMatchObject({
        [mediaType]: "/api/media-assets/result/content",
      });
    });
    act(() => (mocks.nodeStudio.mock.lastCall?.[0] as StudioProps).onDraftChange({
      title: snapshot.title, schemaVersion: 3, groups: [], edges: snapshot.edges,
      nodes: snapshot.nodes.map((node) => ({ ...node, selectedOutputAssetId: null })),
    }));
    await waitFor(() => {
      const props = mocks.nodeStudio.mock.lastCall?.[0] as StudioProps;
      expect(props.resolveUpstreamNodeData("single", {})).toMatchObject({ [mediaType]: null });
      expect(props.resolveUpstreamNodeData("gallery", {})).toMatchObject({
        [`${mediaType}s`]: [], [`${mediaType}Refs`]: [],
      });
    });
  });

  it("projects every selected ordered-list output into a downstream GIF node", async () => {
    outputMocks.listExecutions.mockImplementation(async (_graphId: string, nodeId: string) => nodeId === "split"
      ? [{
          executionId: "split-execution",
          graphId: graph.id,
          nodeId: "split",
          executionKind: "media_operation",
          status: "completed",
          progress: 100,
          outputAssetIds: ["cell-0", "cell-1"],
        }, {
          executionId: "older-split-execution",
          graphId: graph.id,
          nodeId: "split",
          executionKind: "media_operation",
          status: "completed",
          progress: 100,
          outputAssetIds: ["older-cell-0", "older-cell-1"],
        }]
      : []);
    const graphWithCollection: GenerationGraphSnapshotDto = {
      ...graph,
      nodes: [
        {
          id: "split",
          kind: "edit.image.splitGrid",
          position: { x: 0, y: 0 },
          configVersion: 1,
          config: { parameters: { rows: 1, cols: 2, rowOffsets: [], colOffsets: [] } },
          selectedOutputAssetId: "cell-0",
        },
        {
          id: "gif",
          kind: "edit.image.gif",
          position: { x: 400, y: 0 },
          configVersion: 1,
          config: { parameters: { fps: 8, loopCount: 0, colorCount: 128, dither: false, targetMaxBytes: 131_072, clipOrder: [] } },
          selectedOutputAssetId: null,
        },
      ],
      edges: [{
        id: "split-to-gif",
        sourceNodeId: "split",
        sourcePortId: "images",
        targetNodeId: "gif",
        targetPortId: "frames",
        sortOrder: 0,
      }],
    };
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graphWithCollection}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const studio = mocks.nodeStudio.mock.lastCall?.[0] as {
        resolveUpstreamNodeData: (nodeId: string, data: Record<string, unknown>) => Record<string, unknown> | null;
      };
      expect(studio.resolveUpstreamNodeData("gif", {})).toMatchObject({
        frames: [
          "/api/media-assets/cell-0/content",
          "/api/media-assets/cell-1/content",
        ],
      });
      expect(studio.resolveUpstreamNodeData("split", {})).toMatchObject({
        outputImages: ["/api/media-assets/cell-0/content", "/api/media-assets/cell-1/content"],
      });
    });
    const studio = () => mocks.nodeStudio.mock.lastCall?.[0] as {
      resolveUpstreamNodeData: (nodeId: string, data: Record<string, unknown>) => Record<string, unknown>;
      onDraftChange: (draft: unknown) => void;
    };
    await act(async () => studio().onDraftChange({
      ...graphWithCollection,
      nodes: graphWithCollection.nodes.map((node) => node.id === "split" ? { ...node, selectedOutputAssetId: "older-cell-1" } : node),
    }));
    const olderUrls = ["/api/media-assets/older-cell-0/content", "/api/media-assets/older-cell-1/content"];
    expect(studio().resolveUpstreamNodeData("split", {})).toMatchObject({ outputImages: olderUrls });
    expect(studio().resolveUpstreamNodeData("gif", {})).toMatchObject({ frames: olderUrls });
    const singleNode = {
      id: "single", kind: "input.image", position: { x: 0, y: 200 }, configVersion: 1,
      config: { assetId: "single-image" }, selectedOutputAssetId: null,
    };
    const singleEdge = {
      id: "single-to-gif", sourceNodeId: "single", sourcePortId: "image",
      targetNodeId: "gif", targetPortId: "frames", sortOrder: 1,
    };
    const mixed = { ...graphWithCollection, nodes: [...graphWithCollection.nodes, singleNode], edges: [...graphWithCollection.edges, singleEdge] };
    await act(async () => studio().onDraftChange(mixed));
    const cellUrls = ["/api/media-assets/cell-0/content", "/api/media-assets/cell-1/content"];
    expect(studio().resolveUpstreamNodeData("gif", {})).toMatchObject({
      frames: [...cellUrls, "/api/media-assets/single-image/content"],
      frameGroups: [
        { sourceEdgeId: "split-to-gif", frames: cellUrls },
        { sourceEdgeId: "single-to-gif", frames: ["/api/media-assets/single-image/content"] },
      ],
    });
    await act(async () => studio().onDraftChange({
      ...mixed,
      nodes: mixed.nodes.map((node) => node.id === "gif" ? {
        ...node, config: { parameters: { clipOrder: ["missing-edge", "single-to-gif", "single-to-gif", "split-to-gif"] } },
      } : node),
    }));
    expect(studio().resolveUpstreamNodeData("gif", {})).toMatchObject({
      frames: ["/api/media-assets/single-image/content", ...cellUrls],
      frameGroups: [
        { sourceEdgeId: "single-to-gif", frames: ["/api/media-assets/single-image/content"] },
        { sourceEdgeId: "split-to-gif", frames: cellUrls },
      ],
    });
    await act(async () => studio().onDraftChange({ ...mixed, edges: graphWithCollection.edges }));
    expect(studio().resolveUpstreamNodeData("gif", {})).toMatchObject({
      frames: cellUrls, frameGroups: [{ sourceEdgeId: "split-to-gif", frames: cellUrls }],
    });
    await act(async () => studio().onDraftChange({
      ...graphWithCollection,
      nodes: graphWithCollection.nodes.map((node) => ({ ...node, selectedOutputAssetId: null })),
    }));
    expect(studio().resolveUpstreamNodeData("split", {})).toMatchObject({ outputImages: [] });
    expect(studio().resolveUpstreamNodeData("gif", {})).toMatchObject({ frames: [] });
  });

  it.each(["image", "audio", "video"] as const)("keeps an empty connected %s input empty for values and assets until disconnect", async (type) => {
    const passPort = type === "image" ? "reference" : type;
    const valuePort = type === "image" ? "primary" : type === "audio" ? "soundtrack" : "clips";
    const nodes: GenerationGraphSnapshotDto["nodes"] = [
      { id: "empty", kind: `input.${type}`, position: { x: 0, y: 0 }, configVersion: 1, config: {}, selectedOutputAssetId: null },
      { id: "local", kind: `input.${type}`, position: { x: 200, y: 0 }, configVersion: 1, config: { assetId: "local-asset" }, selectedOutputAssetId: null },
      { id: "single", kind: "output.single", position: { x: 400, y: 0 }, configVersion: 1, config: {}, selectedOutputAssetId: null },
      { id: "gallery", kind: "output.gallery", position: { x: 400, y: 200 }, configVersion: 1, config: {}, selectedOutputAssetId: null },
      { id: "values", kind: type === "image" ? "generate.image" : "edit.video.stitch", position: { x: 400, y: 400 }, configVersion: 1, config: {}, selectedOutputAssetId: null },
    ];
    const consumerEdges: GenerationGraphSnapshotDto["edges"] = ["single", "gallery"].map((targetNodeId) => ({
      id: targetNodeId, sourceNodeId: "local", sourcePortId: type, targetNodeId, targetPortId: type, sortOrder: 0,
    }));
    consumerEdges.push({ id: "values", sourceNodeId: "local", sourcePortId: type, targetNodeId: "values", targetPortId: valuePort, sortOrder: 0 });
    const connectedGraph = { ...graph, nodes, edges: [
      ...consumerEdges,
      { id: "upstream", sourceNodeId: "empty", sourcePortId: type, targetNodeId: "local", targetPortId: passPort, sortOrder: 0 },
    ] };
    renderWithIntl(<NodeStudioWorkspace graph={connectedGraph} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    const studio = () => mocks.nodeStudio.mock.lastCall?.[0] as {
      resolveUpstreamNodeData: (nodeId: string, data: Record<string, unknown>) => Record<string, unknown>;
      onDraftChange: (draft: unknown) => void;
    };
    await waitFor(() => expect(studio().resolveUpstreamNodeData("local", {})[type === "audio" ? "audioFile" : type]).toBe("/api/media-assets/local-asset/content"));
    expect(studio().resolveUpstreamNodeData("single", {})[type]).toBeNull();
    expect(studio().resolveUpstreamNodeData("gallery", {})[`${type}s`]).toEqual([]);
    expect(studio().resolveUpstreamNodeData("values", {})[valuePort]).toEqual(type === "video" ? [] : null);
    await act(async () => studio().onDraftChange({ ...connectedGraph, edges: consumerEdges }));
    expect(studio().resolveUpstreamNodeData("single", {})[type]).toBe("/api/media-assets/local-asset/content");
    expect(studio().resolveUpstreamNodeData("gallery", {})[`${type}s`]).toEqual(["/api/media-assets/local-asset/content"]);
    expect(studio().resolveUpstreamNodeData("values", {})[valuePort]).toEqual(type === "video" ? ["/api/media-assets/local-asset/content"] : "/api/media-assets/local-asset/content");
  });

  it.each(["image", "audio", "video"] as const)("keeps an empty connected %s prompt authoritative until disconnect", async (type) => {
    const nodes: GenerationGraphSnapshotDto["nodes"] = [
      { id: "empty", kind: "input.prompt", position: { x: 0, y: 0 }, configVersion: 1, config: { text: "" }, selectedOutputAssetId: null },
      { id: "local", kind: "input.prompt", position: { x: 200, y: 0 }, configVersion: 1, config: { text: "local text" }, selectedOutputAssetId: null },
      { id: "consumer", kind: `generate.${type}`, position: { x: 400, y: 0 }, configVersion: 1, config: { prompt: "saved generator prompt" }, selectedOutputAssetId: null },
    ];
    const consumerEdges = [{ id: "consumer", sourceNodeId: "local", sourcePortId: "text", targetNodeId: "consumer", targetPortId: "prompt", sortOrder: 0 }];
    const connectedGraph = { ...graph, nodes, edges: [
      ...consumerEdges,
      { id: "upstream", sourceNodeId: "empty", sourcePortId: "text", targetNodeId: "local", targetPortId: "text", sortOrder: 0 },
    ] };
    renderWithIntl(<NodeStudioWorkspace graph={connectedGraph} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    const studio = () => mocks.nodeStudio.mock.lastCall?.[0] as {
      resolveUpstreamNodeData: (nodeId: string, data: Record<string, unknown>) => Record<string, unknown>;
      onDraftChange: (draft: unknown) => void;
    };
    expect(studio().resolveUpstreamNodeData("consumer", {})).toMatchObject({ prompt: "", inputPrompt: "", internalPrompt: "saved generator prompt", promptConnected: true });
    expect(studio().resolveUpstreamNodeData("local", {})).toMatchObject({ prompt: "local text" });
    await act(async () => studio().onDraftChange({ ...connectedGraph, edges: consumerEdges }));
    expect(studio().resolveUpstreamNodeData("consumer", {})).toMatchObject({ prompt: "local text", inputPrompt: "local text", internalPrompt: "saved generator prompt", promptConnected: true });
    await act(async () => studio().onDraftChange({ ...connectedGraph, edges: [] }));
    expect(studio().resolveUpstreamNodeData("consumer", {})).toMatchObject({ prompt: "saved generator prompt", inputPrompt: "saved generator prompt", internalPrompt: "saved generator prompt", promptConnected: false });
  });

  it("브라우저 prompt 대신 Node Banana 새 workflow dialog를 사용한다", async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
        onCreateGraph={create}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open space" }));
    await user.click(screen.getByRole("button", { name: "New space" }));
    const dialog = screen.getByRole("dialog", { name: "New space" });
    const name = within(dialog).getByRole("textbox", { name: "Space name" });
    await user.clear(name);
    await user.type(name, "Storyboard");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(create).toHaveBeenCalledWith("Storyboard");
  });

  it("Space Settings에서 바꾼 Canvas 동작을 runtime과 localStorage에 반영한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Space settings" }));
    await user.click(screen.getByRole("tab", { name: "Canvas" }));
    await user.click(screen.getByRole("button", { name: "Space + Drag" }));
    await user.click(screen.getByRole("button", { name: "Alt + Scroll" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.nodeStudio).toHaveBeenLastCalledWith(expect.objectContaining({
      canvasSettings: expect.objectContaining({ panMode: "space", zoomMode: "altScroll" }),
    }));
    expect(window.localStorage.getItem("node-studio.canvas-settings")).toBe(
      JSON.stringify({ panMode: "space", zoomMode: "altScroll", selectionMode: "click" }),
    );
  });

  it("Header Settings의 default reset을 owner preference 저장으로 연결한다", async () => {
    const user = userEvent.setup();
    mocks.usePreferences.mockReturnValue({ ...loadedPreferences, data: {
      ...loadedPreferences.data, defaults: { image: { modelKey: "previous-image", parameters: { steps: 8 } } },
    } });
    renderWithIntl(<NodeStudioWorkspace graph={graph} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Space settings" }));
    await user.click(screen.getByRole("tab", { name: "Node Defaults" }));
    expect(screen.getByText("previous-image")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset defaults" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveSettings).toHaveBeenCalledWith({ defaults: {} }));
    expect(screen.queryByRole("dialog", { name: "Space Settings" })).not.toBeInTheDocument();
  });

  it("canonical comment를 Header badge에 표시하고 읽음 상태를 graph write 없이 갱신한다", async () => {
    const user = userEvent.setup();
    const commented: GenerationGraphSnapshotDto = { ...graph, nodes: [{
      id: "commented", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 },
      config: { assetId: null, presentation: { comment: "Review this image" } }, selectedOutputAssetId: null,
    }] };
    renderWithIntl(<NodeStudioWorkspace graph={commented} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} onStatusChange={vi.fn()} />);
    const navigation = screen.getByRole("button", { name: "Navigate comments" });
    expect(navigation).toHaveAttribute("title", "1 unviewed comment (1 total)");
    await user.click(navigation);
    expect(navigation).toHaveAttribute("title", "0 unviewed comments (1 total)");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("Node 실행 전에 autosave 완료 version을 제공한다", async () => {
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const props = mocks.nodeStudio.mock.lastCall?.[0] as {
      prepareImageNodeExecution: () => Promise<number>;
    };
    await expect(props.prepareImageNodeExecution()).resolves.toBe(3);
    expect(mocks.saveNow).toHaveBeenCalledOnce();
  });

  it("충돌 안내를 유지하고 확인 후 최신 snapshot을 다시 불러온다", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    mocks.useAutosave.mockReturnValue({
      status: "conflict",
      version: 3,
      update: mocks.update,
      retry: mocks.retry,
      saveNow: mocks.saveNow,
    });
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={reload}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("새 버전이 있습니다");
    await user.click(screen.getByRole("button", { name: "Save space" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "다시 불러오기" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("삭제 확인 전에는 Graph를 삭제하지 않는다", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={remove}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open space" }));
    await user.click(screen.getByRole("button", { name: "Delete space" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }),
    );
    expect(remove).toHaveBeenCalledOnce();
  });
});
