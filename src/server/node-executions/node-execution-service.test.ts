import { createNodeExecutionService } from "./node-execution-service";
import {
  NodeExecutionInputError,
  NodeExecutionStorageUnavailableError,
  NodeExecutionVersionConflictError,
} from "./node-execution-errors";
import type { NodeExecutionRepository, StoredNodeExecutionEdge } from "./node-execution-repository";

const generationConfig = {
  prompt: "stored prompt",
  modelKey: "model-a",
  parameters: {
    width: 1024,
    height: 768,
    imageCount: 1,
    steps: 8,
  },
};

function storedNode(kind = "generate.image") {
  return {
    id: "node-1",
    kind,
    configVersion: 1,
    config: generationConfig,
    graph: { version: 4, schemaVersion: 2 },
    incomingEdges: [],
  };
}

function setup() {
  const repository = {
    getOwnedNode: vi.fn().mockResolvedValue(storedNode()),
    getAssets: vi.fn().mockResolvedValue([]),
    listExecutions: vi.fn().mockResolvedValue([]),
    findExecution: vi.fn(),
    cancelExecution: vi.fn(),
  } as unknown as NodeExecutionRepository;
  const validateImage = vi.fn().mockImplementation(async (payload) => ({ success: true, data: payload }));
  const validateVideo = vi.fn().mockImplementation(async (payload) => ({ success: true, data: payload }));
  const validateAudio = vi.fn().mockImplementation(async (payload) => ({ success: true, data: payload }));
  const submitImage = vi.fn().mockResolvedValue({ record: { id: "image-request", status: "pending", progress: 0 } });
  const submitVideo = vi.fn().mockResolvedValue({ record: { id: "video-request", status: "pending", progress: 0 } });
  const submitAudio = vi.fn().mockResolvedValue({ record: { id: "audio-request", status: "pending", progress: 0 } });
  const resolveAsset = vi.fn();
  const assertStorage = vi.fn();
  const createOperation = vi.fn().mockResolvedValue({
    id: "operation-1",
    graphId: "graph-1",
    graphNodeId: "node-1",
    type: "edit.image.resize",
    configVersion: 1,
    parameters: {},
    status: "pending",
    progress: 0,
    expectedOutputCount: 1,
    errorCode: null,
    outputAssetIds: [],
    inputs: [],
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    completedAt: null,
  });
  const listNodeOperations = vi.fn().mockResolvedValue([]);
  const getOperation = vi.fn();
  const updateOperation = vi.fn();
  const cancelOperation = vi.fn();
  const hasBackgroundRemovalProcessor = vi.fn().mockResolvedValue(true);
  const startOperationWorker = vi.fn();
  const service = createNodeExecutionService({
    repository,
    validateImage: validateImage as never,
    validateVideo: validateVideo as never,
    validateAudio: validateAudio as never,
    submitImage,
    submitVideo,
    submitAudio,
    resolveAsset: resolveAsset as never,
    assertStorage,
    createOperation,
    listNodeOperations,
    getOperation,
    updateOperation,
    cancelOperation,
    hasBackgroundRemovalProcessor,
    startOperationWorker,
  });
  return {
    repository,
    validateImage,
    validateVideo,
    validateAudio,
    submitImage,
    submitVideo,
    submitAudio,
    resolveAsset,
    assertStorage,
    createOperation,
    listNodeOperations,
    getOperation,
    updateOperation,
    cancelOperation,
    hasBackgroundRemovalProcessor,
    startOperationWorker,
    service,
  };
}

describe("nodeExecutionService", () => {
  it("uses the same single-pass Constructor output and ignores paused variable edges", async () => {
    const state = setup();
    const source = (id: string, kind: string, config: Record<string, unknown>) => ({ id, kind, config, configVersion: 1, selectedOutputAssetId: null });
    const edge = (node: ReturnType<typeof source>, targetPortId = "text", hasPause = false): StoredNodeExecutionEdge => ({
      id: `edge-${node.id}`, sourceNodeId: node.id, sourceNode: node, sourcePortId: "text", targetPortId, hasPause, sortOrder: 0, createdAt: new Date(),
    });
    const constructor = source("constructor", "process.promptConstructor", { template: "@cat / @cat_long / @missing" });
    const named = source("named", "input.prompt", { variableName: "cat", text: "@cat_long" });
    const inline = source("inline", "input.prompt", { text: '<var="cat_long">fox</var>' });
    const paused = source("paused", "input.prompt", { variableName: "cat_long", text: "wrong" });
    const target = { ...storedNode(), incomingEdges: [edge(constructor, "prompt")] };
    vi.mocked(state.repository.getOwnedNode).mockImplementation(async (_owner, _graph, id) => {
      if (id === constructor.id) return { ...constructor, graph: target.graph, incomingEdges: [edge(named), edge(inline), edge(paused, "text", true)] };
      if (id === named.id || id === inline.id) return { ...(id === named.id ? named : inline), graph: target.graph, incomingEdges: [] };
      return target;
    });
    await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });
    expect(state.validateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: "@cat_long / fox / @missing" }));
    expect(state.repository.getOwnedNode).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "paused");
  });
  it("rejects client-supplied prompt, model, parameters and source URLs", async () => {
    const { repository, service } = setup();
    await expect(service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
      prompt: "attacker prompt",
      initImage: "https://attacker.example/image.png",
    })).rejects.toBeInstanceOf(NodeExecutionInputError);
    expect(repository.getOwnedNode).not.toHaveBeenCalled();
  });

  it("resolves a typed image asset transiently and persists only its stable ID snapshot", async () => {
    const { repository, resolveAsset, validateImage, submitImage, service } = setup();
    vi.mocked(repository.getOwnedNode).mockResolvedValue({
      ...storedNode(),
      incomingEdges: [{
        id: "edge-1",
        sourcePortId: "image",
        targetPortId: "primary",
        sortOrder: 0,
        createdAt: new Date(),
        sourceNodeId: "input-1",
        sourceNode: {
          id: "input-1",
          kind: "input.image",
          configVersion: 1,
          config: { assetId: "asset-1" },
          selectedOutputAssetId: null,
        },
      }],
    });
    vi.mocked(repository.getAssets).mockResolvedValue([{
      id: "asset-1",
      ownerEmail: "owner@example.com",
      type: "image",
      status: "completed",
      mimeType: "image/png",
    }]);
    resolveAsset.mockResolvedValue({ url: "https://signed.example/input.png" });

    await service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });

    expect(validateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "stored prompt",
      initImages: ["https://signed.example/input.png"],
    }));
    expect(submitImage).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "node-1",
      requestSnapshot: expect.objectContaining({
        initImages: [],
        inputAssets: [{ assetId: "asset-1", portId: "primary", sortOrder: 0 }],
      }),
    }));
    expect(JSON.stringify(submitImage.mock.calls[0]?.[0].requestSnapshot)).not.toContain("signed.example");
  });

  it.each([
    ["generate.video", "video", "submitVideo"],
    ["generate.audio", "audio", "submitAudio"],
  ] as const)("dispatches %s through the matching application service", async (kind, mediaType, submitKey) => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode(kind),
      config: {
        prompt: "media prompt",
        modelKey: "model-a",
        parameters: kind === "generate.video"
          ? { aspectRatio: "16:9", resolution: 720, durationSec: 3, fps: 16, steps: 6, guidanceScale: 1 }
          : { voice: "default", speed: 1 },
      },
    });

    const result = await state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });

    expect(state.assertStorage).toHaveBeenCalledWith(mediaType);
    expect(state[submitKey]).toHaveBeenCalledWith(expect.objectContaining({ graphNodeId: "node-1" }));
    expect(result.record.id).toContain(mediaType);
  });

  it("uses the connected prompt Node instead of client or stale generation config", async () => {
    const { repository, validateAudio, service } = setup();
    vi.mocked(repository.getOwnedNode).mockResolvedValue({
      ...storedNode("generate.audio"),
      incomingEdges: [{
        id: "edge-prompt",
        sourcePortId: "text",
        targetPortId: "prompt",
        sortOrder: 0,
        createdAt: new Date(),
        sourceNodeId: "prompt-1",
        sourceNode: {
          id: "prompt-1",
          kind: "input.prompt",
          configVersion: 1,
          config: { text: "connected prompt" },
          selectedOutputAssetId: null,
        },
      }],
    });

    await service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });
    expect(validateAudio).toHaveBeenCalledWith(expect.objectContaining({ prompt: "connected prompt" }));
  });

  it.each(["input.image", "edit.image.splitGrid"])("resolves media references from %s and chained prompts", async (sourceKind) => {
    const state = setup();
    const target = {
      ...storedNode(),
      incomingEdges: [
        {
          id: "edge-image-use", sourcePortId: "image", targetPortId: "primary", sortOrder: 0, createdAt: new Date(), sourceNodeId: "relay-image",
          sourceNode: { id: "relay-image", kind: "input.image", configVersion: 1, config: { assetId: "local-image" }, selectedOutputAssetId: null },
        },
        {
          id: "edge-prompt-use", sourcePortId: "text", targetPortId: "prompt", sortOrder: 0, createdAt: new Date(), sourceNodeId: "relay-prompt",
          sourceNode: { id: "relay-prompt", kind: "input.prompt", configVersion: 1, config: { text: "local prompt" }, selectedOutputAssetId: null },
        },
      ],
    };
    const relayImage = {
      id: "relay-image", kind: "input.image", configVersion: 1, config: { assetId: "local-image" }, graph: target.graph,
      incomingEdges: [{
        id: "edge-image-pass", sourcePortId: sourceKind === "input.image" ? "image" : "images", targetPortId: "reference", sortOrder: 0, createdAt: new Date(), sourceNodeId: "root-image",
        sourceNode: { id: "root-image", kind: sourceKind, configVersion: 1, config: { assetId: "root-image-asset" }, selectedOutputAssetId: "root-image-asset" },
      }],
    };
    const relayPrompt = {
      id: "relay-prompt", kind: "input.prompt", configVersion: 1, config: { text: "local prompt" }, graph: target.graph,
      incomingEdges: [{
        id: "edge-prompt-pass", sourcePortId: "text", targetPortId: "text", sortOrder: 0, createdAt: new Date(), sourceNodeId: "root-prompt",
        sourceNode: { id: "root-prompt", kind: "input.prompt", configVersion: 1, config: { text: "root prompt" }, selectedOutputAssetId: null },
      }],
    };
    vi.mocked(state.repository.getOwnedNode).mockImplementation(async (_owner, _graph, nodeId) => {
      if (nodeId === "relay-image") return relayImage;
      if (nodeId === "relay-prompt") return relayPrompt;
      return target;
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([{
      id: sourceKind === "input.image" ? "root-image-asset" : "local-image", ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png",
    }]);
    state.resolveAsset.mockResolvedValue({ url: "https://signed.example/root.png" });

    await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });

    expect(state.validateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "root prompt",
      initImages: ["https://signed.example/root.png"],
    }));
    expect(state.resolveAsset).toHaveBeenCalledWith("owner@example.com", sourceKind === "input.image" ? "root-image-asset" : "local-image");
  });

  it("snapshots the cell slice for media operations despite its visual Split reference", async () => {
    const state = setup();
    const cell = {
      id: "cell", kind: "input.image", configVersion: 1, config: { assetId: "slice-2" }, selectedOutputAssetId: null,
    };
    const target = {
      ...storedNode("edit.image.resize"),
      config: { parameters: { mode: "scale", width: 512, height: 512, maxEdge: 8192, scalePct: 100, fit: "contain", padColor: "#00000000", format: "png", quality: 0.92 } },
      incomingEdges: [{
        id: "cell-use", sourceNodeId: "cell", sourceNode: cell, sourcePortId: "image", targetPortId: "image", sortOrder: 0, createdAt: new Date(),
      }],
    };
    vi.mocked(state.repository.getOwnedNode).mockImplementation(async (_owner, _graph, nodeId) => nodeId === "cell" ? {
      ...cell, graph: target.graph, incomingEdges: [{
        id: "split-reference", sourceNodeId: "split", sourcePortId: "images", targetPortId: "reference", sortOrder: 0, createdAt: new Date(),
        sourceNode: { id: "split", kind: "edit.image.splitGrid", configVersion: 1, config: {}, selectedOutputAssetId: "slice-1" },
      }],
    } : target);
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "slice-2", ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png" },
    ]);
    state.resolveAsset.mockResolvedValue({ url: "https://signed.example/slice-2.png", bytes: "1024", width: 512, height: 512 });

    const result = await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });

    expect(result.plan?.inputs).toEqual([expect.objectContaining({ assetId: "slice-2" })]);
    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      inputs: [expect.objectContaining({ assetId: "slice-2" })],
    }));
  });

  it("rejects a cyclic Input chain instead of falling back to a local asset", async () => {
    const state = setup();
    const target = {
      ...storedNode(),
      incomingEdges: [{
        id: "edge-image-use", sourcePortId: "image", targetPortId: "primary", sortOrder: 0, createdAt: new Date(), sourceNodeId: "relay-image",
        sourceNode: { id: "relay-image", kind: "input.image", configVersion: 1, config: { assetId: "local-image" }, selectedOutputAssetId: null },
      }],
    };
    const relay = {
      id: "relay-image", kind: "input.image", configVersion: 1, config: { assetId: "local-image" }, graph: target.graph,
      incomingEdges: [{
        id: "edge-image-cycle", sourcePortId: "image", targetPortId: "reference", sortOrder: 0, createdAt: new Date(), sourceNodeId: "relay-image",
        sourceNode: { id: "relay-image", kind: "input.image", configVersion: 1, config: { assetId: "local-image" }, selectedOutputAssetId: null },
      }],
    };
    vi.mocked(state.repository.getOwnedNode).mockImplementation(async (_owner, _graph, nodeId) =>
      nodeId === "relay-image" ? relay : target,
    );

    await expect(state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    })).rejects.toMatchObject({
      code: "NODE_INPUT_INVALID",
      details: expect.objectContaining({ reason: "INPUT_PASS_THROUGH_CYCLE" }),
    });
    expect(state.resolveAsset).not.toHaveBeenCalled();
  });

  it("checks Graph version and durable storage before submission", async () => {
    const { repository, assertStorage, submitImage, service } = setup();
    await expect(service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 3,
    })).rejects.toBeInstanceOf(NodeExecutionVersionConflictError);
    expect(assertStorage).not.toHaveBeenCalled();

    vi.mocked(repository.getOwnedNode).mockResolvedValue(storedNode());
    assertStorage.mockImplementation(() => { throw new NodeExecutionStorageUnavailableError(); });
    await expect(service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    })).rejects.toBeInstanceOf(NodeExecutionStorageUnavailableError);
    expect(submitImage).not.toHaveBeenCalled();
  });

  it.each([null, "older-selected"])("does not use the latest ordered collection when selection is %s", async (selectedOutputAssetId) => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.image.gif"),
      config: { parameters: { fps: 12, loopCount: 0, colorCount: 64, dither: false, targetMaxBytes: null } },
      incomingEdges: [{
        id: "edge-frames", sourcePortId: "images", targetPortId: "frames", sortOrder: 0,
        createdAt: new Date(), sourceNodeId: "split-1",
        sourceNode: {
          id: "split-1", kind: "edit.image.splitGrid", configVersion: 1, config: {},
          selectedOutputAssetId,
          outputs: [{ portId: "images", sortOrder: 0, assetId: "latest-output" }],
        },
      }],
    });
    if (selectedOutputAssetId) {
      vi.mocked(state.repository.getAssets).mockResolvedValue([
        { id: selectedOutputAssetId, ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png" },
      ]);
      state.resolveAsset.mockResolvedValue({ url: "https://signed.example/older.png", bytes: "256", width: 16, height: 16 });
      await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });
      expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
        inputs: [{ assetId: selectedOutputAssetId, portId: "frames", sortOrder: 0 }],
      }));
    } else {
      await expect(state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 }))
        .rejects.toMatchObject({ code: "NODE_INPUT_SELECTION_REQUIRED" });
      expect(state.createOperation).not.toHaveBeenCalled();
    }
    expect(state.resolveAsset).not.toHaveBeenCalledWith("owner@example.com", "latest-output");
  });

  it("creates a browser image operation from stable ordered inputs and returns a transient plan", async () => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.image.gif"),
      config: { parameters: { fps: 12, loopCount: 0, colorCount: 64, dither: false, targetMaxBytes: null } },
      incomingEdges: [{
        id: "edge-frames",
        sourcePortId: "images",
        targetPortId: "frames",
        sortOrder: 0,
        createdAt: new Date(),
        sourceNodeId: "split-1",
        sourceNode: {
          id: "split-1",
          kind: "edit.image.splitGrid",
          configVersion: 1,
          config: { parameters: { rows: 1, cols: 2, colOffsets: [], rowOffsets: [] } },
          selectedOutputAssetId: "asset-1",
          outputs: [
            { portId: "images", sortOrder: 0, assetId: "asset-1" },
            { portId: "images", sortOrder: 1, assetId: "asset-2" },
          ],
        },
      }],
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "asset-1", ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png" },
      { id: "asset-2", ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png" },
    ]);
    state.resolveAsset
      .mockResolvedValueOnce({ url: "https://signed.example/1.png", bytes: "256", width: 16, height: 16 })
      .mockResolvedValueOnce({ url: "https://signed.example/2.png", bytes: "256", width: 16, height: 16 });

    const result = await state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });

    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      type: "edit.image.gif",
      inputs: [
        { assetId: "asset-1", portId: "frames", sortOrder: 0 },
        { assetId: "asset-2", portId: "frames", sortOrder: 1 },
      ],
    }));
    expect(result).toMatchObject({
      operation: { id: "operation-1" },
      plan: {
        kind: "edit.image.gif",
        outputPortId: "image",
        expectedOutputCount: 1,
        inputs: [
          { assetId: "asset-1", sortOrder: 0, url: "https://signed.example/1.png" },
          { assetId: "asset-2", sortOrder: 1, url: "https://signed.example/2.png" },
        ],
      },
    });
  });

  it("rejects browser image operations whose verified input exceeds canvas limits", async () => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.image.resize"),
      config: { parameters: { mode: "scale", width: 1024, height: 1024, maxEdge: 8192, scalePct: 800, fit: "contain", padColor: "#00000000", format: "png", quality: 0.92 } },
      incomingEdges: [{
        id: "edge-image", sourcePortId: "image", targetPortId: "image", sortOrder: 0,
        createdAt: new Date(), sourceNodeId: "input-1",
        sourceNode: {
          id: "input-1", kind: "input.image", configVersion: 1,
          config: { assetId: "asset-1" }, selectedOutputAssetId: null,
        },
      }],
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "asset-1", ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png" },
    ]);
    state.resolveAsset.mockResolvedValue({
      url: "https://signed.example/input.png", bytes: "1048576", width: 4096, height: 4096,
    });

    await expect(state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    })).rejects.toMatchObject({
      code: "NODE_INPUT_UNSUPPORTED",
      details: { reason: "IMAGE_OPERATION_OUTPUT_LIMIT_EXCEEDED" },
    });
    expect(state.createOperation).not.toHaveBeenCalled();
  });

  it("creates a browser video Stitch plan from typed clip order and optional soundtrack", async () => {
    const state = setup();
    const sourceNode = (id: string, kind: "input.video" | "input.audio", assetId: string) => ({
      id,
      kind,
      configVersion: 1,
      config: { assetId },
      selectedOutputAssetId: null,
    });
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.video.stitch"),
      config: { parameters: { repeat: 2, stripAudio: false } },
      incomingEdges: [
        {
          id: "edge-clip-b", sourcePortId: "video", targetPortId: "clips", sortOrder: 1,
          createdAt: new Date(), sourceNodeId: "input-b", sourceNode: sourceNode("input-b", "input.video", "video-b"),
        },
        {
          id: "edge-soundtrack", sourcePortId: "audio", targetPortId: "soundtrack", sortOrder: 0,
          createdAt: new Date(), sourceNodeId: "input-audio", sourceNode: sourceNode("input-audio", "input.audio", "audio-1"),
        },
        {
          id: "edge-clip-a", sourcePortId: "video", targetPortId: "clips", sortOrder: 0,
          createdAt: new Date(), sourceNodeId: "input-a", sourceNode: sourceNode("input-a", "input.video", "video-a"),
        },
      ],
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "video-a", ownerEmail: "owner@example.com", type: "video", status: "completed", mimeType: "video/mp4" },
      { id: "video-b", ownerEmail: "owner@example.com", type: "video", status: "completed", mimeType: "video/mp4" },
      { id: "audio-1", ownerEmail: "owner@example.com", type: "audio", status: "completed", mimeType: "audio/mpeg" },
    ]);
    state.resolveAsset.mockImplementation(async (_owner: string, assetId: string) => ({
      id: assetId,
      type: assetId.startsWith("video") ? "video" : "audio",
      mimeType: assetId.startsWith("video") ? "video/mp4" : "audio/mpeg",
      bytes: "1048576",
      width: assetId.startsWith("video") ? 1280 : null,
      height: assetId.startsWith("video") ? 720 : null,
      durationMs: assetId === "video-a" ? 2_000 : assetId === "video-b" ? 3_000 : 10_000,
      url: `https://signed.example/${assetId}`,
    }));

    const result = await state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });

    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      type: "edit.video.stitch",
      parameters: { repeat: 2, stripAudio: false, clipOrder: [] },
      inputs: [
        { assetId: "video-a", portId: "clips", sortOrder: 0 },
        { assetId: "video-b", portId: "clips", sortOrder: 1 },
        { assetId: "audio-1", portId: "soundtrack", sortOrder: 0 },
      ],
    }));
    expect(result).toMatchObject({
      mediaType: "video",
      plan: {
        kind: "edit.video.stitch",
        outputPortId: "video",
        outputMediaType: "video",
        inputs: [
          { assetId: "video-a", portId: "clips", sortOrder: 0, durationMs: 2_000 },
          { assetId: "video-b", portId: "clips", sortOrder: 1, durationMs: 3_000 },
          { assetId: "audio-1", portId: "soundtrack", sortOrder: 0, durationMs: 10_000 },
        ],
      },
    });
  });

  it.each([
    ["edit.image.gif", ["edge-b", "edge-a"]],
    ["edit.image.gif", ["stale-edge", "asset-a", "input-a", "edge-b", "edge-b"]],
    ["edit.video.stitch", ["edge-b", "edge-a"]],
    ["edit.video.stitch", ["edge-soundtrack", "stale-edge", "asset-a", "input-a", "edge-b", "edge-b"]],
  ] as const)("uses persisted filmstrip edge order for %s in snapshots and execution plans (%j)", async (kind, clipOrder) => {
    const state = setup();
    const isGif = kind === "edit.image.gif";
    const type = isGif ? "image" : "video";
    const portId = isGif ? "frames" : "clips";
    const mimeType = isGif ? "image/png" : "video/mp4";
    const edges: StoredNodeExecutionEdge[] = ["a", "b", "c"].map((suffix, sortOrder) => ({
      id: `edge-${suffix}`, sourcePortId: type, targetPortId: portId, sortOrder,
      createdAt: new Date(), sourceNodeId: `input-${suffix}`,
      sourceNode: {
        id: `input-${suffix}`, kind: `input.${type}`, configVersion: 1,
        config: { assetId: `asset-${suffix}` }, selectedOutputAssetId: null,
      },
    }));
    if (!isGif) edges.push({
      id: "edge-soundtrack", sourcePortId: "audio", targetPortId: "soundtrack", sortOrder: 0,
      createdAt: new Date(), sourceNodeId: "input-audio",
      sourceNode: { id: "input-audio", kind: "input.audio", configVersion: 1, config: { assetId: "audio-1" }, selectedOutputAssetId: null },
    });
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode(kind),
      config: { parameters: { clipOrder: [...clipOrder] } },
      incomingEdges: edges,
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      ...["a", "b", "c"].map((suffix) => ({
        id: `asset-${suffix}`, ownerEmail: "owner@example.com", type: type as "image" | "video",
        status: "completed" as const, mimeType,
      })),
      ...(!isGif ? [{ id: "audio-1", ownerEmail: "owner@example.com", type: "audio" as const, status: "completed" as const, mimeType: "audio/mpeg" }] : []),
    ]);
    state.resolveAsset.mockImplementation(async (_owner: string, assetId: string) => ({
      url: `https://signed.example/${assetId}`, mimeType: assetId === "audio-1" ? "audio/mpeg" : mimeType,
      bytes: "256", width: 16, height: 16, durationMs: 1_000,
    }));
    const result = await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });
    const inputs: Array<{ assetId: string; portId: string; sortOrder: number }> = ["b", "a", "c"].map((suffix, sortOrder) => ({ assetId: `asset-${suffix}`, portId, sortOrder }));
    if (!isGif) inputs.push({ assetId: "audio-1", portId: "soundtrack", sortOrder: 0 });
    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ inputs }));
    expect(result).toMatchObject({ plan: { inputs: inputs.map((input) => ({ ...input, url: `https://signed.example/${input.assetId}` })) } });
  });

  it("keeps each ordered-list edge's assets together when reordering GIF frames", async () => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.image.gif"),
      config: { parameters: { clipOrder: ["edge-b", "edge-a"] } },
      incomingEdges: ["a", "b"].map((suffix, sortOrder) => ({
        id: `edge-${suffix}`, sourcePortId: "images", targetPortId: "frames", sortOrder,
        createdAt: new Date(), sourceNodeId: `split-${suffix}`,
        sourceNode: {
          id: `split-${suffix}`, kind: "edit.image.splitGrid", configVersion: 1, config: {},
          selectedOutputAssetId: `${suffix}-1`,
          outputs: [1, 2].map((number) => ({ portId: "images", sortOrder: number - 1, assetId: `${suffix}-${number}` })),
        },
      })),
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue(["a-1", "a-2", "b-1", "b-2"].map((id) => ({
      id, ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png",
    })));
    state.resolveAsset.mockImplementation(async (_owner: string, id: string) => ({
      url: `https://signed.example/${id}`, mimeType: "image/png", bytes: "256", width: 16, height: 16,
    }));
    const result = await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });
    const inputs = ["b-1", "b-2", "a-1", "a-2"].map((assetId, sortOrder) => ({ assetId, portId: "frames", sortOrder }));
    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ inputs }));
    expect(result).toMatchObject({ plan: { inputs } });
  });

  it("rejects a video Trim interval beyond the verified source duration", async () => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.video.trim"),
      config: { parameters: { startMs: 1_000, endMs: 5_000, stripAudio: false } },
      incomingEdges: [{
        id: "edge-video", sourcePortId: "video", targetPortId: "video", sortOrder: 0,
        createdAt: new Date(), sourceNodeId: "input-video",
        sourceNode: {
          id: "input-video", kind: "input.video", configVersion: 1,
          config: { assetId: "video-a" }, selectedOutputAssetId: null,
        },
      }],
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "video-a", ownerEmail: "owner@example.com", type: "video", status: "completed", mimeType: "video/mp4" },
    ]);
    state.resolveAsset.mockResolvedValue({
      id: "video-a", type: "video", mimeType: "video/mp4", bytes: "1024",
      width: 640, height: 360, durationMs: 4_000, url: "https://signed.example/video-a",
    });

    await expect(state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    })).rejects.toMatchObject({
      code: "NODE_INPUT_UNSUPPORTED",
      details: { reason: "VIDEO_OPERATION_INTERVAL_INVALID" },
    });
    expect(state.createOperation).not.toHaveBeenCalled();
  });

  it("rejects execution of a saved Audio Edit node without creating an operation", async () => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue(storedNode("edit.audio.basic"));
    await expect(state.service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    })).rejects.toMatchObject({ code: "NODE_CONFIG_INVALID" });
    expect(state.createOperation).not.toHaveBeenCalled();
    expect(state.repository.getAssets).not.toHaveBeenCalled();
  });

  it("inherits upstream Ease Curve settings through the Settings handle", async () => {
    const state = setup();
    const inherited = {
      outputDurationMs: 2_000,
      easingPreset: "linear",
      bezier: [0, 0, 1, 1],
    };
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.video.easeCurve"),
      config: { parameters: { outputDurationMs: 1_500, easingPreset: "easeInOutSine", bezier: [0.42, 0, 0.58, 1] } },
      incomingEdges: [
        {
          id: "edge-video", sourcePortId: "video", targetPortId: "video", sortOrder: 0,
          createdAt: new Date(), sourceNodeId: "input-video",
          sourceNode: { id: "input-video", kind: "input.video", configVersion: 1, config: { assetId: "video-a" }, selectedOutputAssetId: null },
        },
        {
          id: "edge-settings", sourcePortId: "settings", targetPortId: "settings", sortOrder: 0,
          createdAt: new Date(), sourceNodeId: "ease-parent",
          sourceNode: { id: "ease-parent", kind: "edit.video.easeCurve", configVersion: 1, config: { parameters: inherited }, selectedOutputAssetId: null },
        },
      ],
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "video-a", ownerEmail: "owner@example.com", type: "video", status: "completed", mimeType: "video/mp4" },
    ]);
    state.resolveAsset.mockResolvedValue({
      id: "video-a", type: "video", mimeType: "video/mp4", bytes: "2048",
      width: 640, height: 360, durationMs: 3_000, url: "https://signed.example/video-a",
    });

    await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });

    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      type: "edit.video.easeCurve",
      parameters: inherited,
      inputs: [{ assetId: "video-a", portId: "video", sortOrder: 0 }],
    }));
  });

  it("starts server background removal only when a catalog capability exists", async () => {
    const state = setup();
    vi.mocked(state.repository.getOwnedNode).mockResolvedValue({
      ...storedNode("edit.image.removeBackground"),
      config: { parameters: {} },
      incomingEdges: [{
        id: "edge-image",
        sourcePortId: "image",
        targetPortId: "image",
        sortOrder: 0,
        createdAt: new Date(),
        sourceNodeId: "input-1",
        sourceNode: {
          id: "input-1", kind: "input.image", configVersion: 1,
          config: { assetId: "asset-1" }, selectedOutputAssetId: null,
        },
      }],
    });
    vi.mocked(state.repository.getAssets).mockResolvedValue([
      { id: "asset-1", ownerEmail: "owner@example.com", type: "image", status: "completed", mimeType: "image/png" },
    ]);
    state.resolveAsset.mockResolvedValue({
      url: "https://signed.example/input.png", bytes: "1024", width: 32, height: 32,
    });

    await state.service.execute("owner@example.com", "graph-1", "node-1", { expectedGraphVersion: 4 });
    expect(state.startOperationWorker).toHaveBeenCalledOnce();
    expect(state.createOperation).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      type: "edit.image.removeBackground",
    }));
  });

  it("returns provider-neutral execution DTOs and delegates cancellation", async () => {
    const { repository, service } = setup();
    const record = {
      executionId: "request-1",
      mediaType: "image" as const,
      graphNodeId: "node-1",
      status: "failed" as const,
      progress: 0,
      errorMessage: "raw provider response",
      modelKey: "model-a",
      createdAt: new Date("2026-09-03T10:00:00.000Z"),
      outputs: [],
    };
    vi.mocked(repository.listExecutions).mockResolvedValue([record]);
    vi.mocked(repository.cancelExecution).mockResolvedValue({ ...record, status: "cancelled" });

    await expect(service.list("owner@example.com", "graph-1", "node-1")).resolves.toEqual([
      expect.objectContaining({
        executionId: "request-1",
        errorCode: "GENERATION_FAILED",
      }),
    ]);
    expect(JSON.stringify(await service.list("owner@example.com", "graph-1", "node-1"))).not.toContain("raw provider");
    vi.mocked(repository.listExecutions).mockResolvedValue([{...record,errorMessage:"Modal 생성 실패: MODAL_OUTPUT_MEDIA"}]);
    expect(await service.list("owner@example.com", "graph-1", "node-1")).toEqual([expect.objectContaining({errorCode:"MODAL_OUTPUT_MEDIA"})]);
    vi.mocked(repository.listExecutions).mockResolvedValue([{...record,errorMessage:"Modal 생성 실패: MODAL_TIMEOUT"}]);
    await expect(service.list("owner@example.com", "graph-1", "node-1")).resolves.toEqual([
      expect.objectContaining({errorCode:"MODAL_TIMEOUT"}),
    ]);
    await expect(service.cancel("owner@example.com", "graph-1", "node-1", "request-1")).resolves.toEqual(
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});
