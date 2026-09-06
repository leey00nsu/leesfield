import { describe, expect, it } from "vitest";

import type { GenerationGraphSnapshotDto } from "../../model/graph-types";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import {
  canonicalDocumentToV3Draft,
  connectCreatedRuntimeNode,
  createCanonicalRuntimeNode,
  filterPaletteForConnection,
  graphSnapshotToCanonicalDocument,
  isRuntimeConnectionValid,
  nodeBananaRuntimeAdapter,
  reconcileRuntimeEdgesForModelChange,
  runtimeGraphToCanonicalDocument,
} from "./node-banana-runtime-adapter";

const graph: GenerationGraphSnapshotDto = {
  id: "graph_1",
  title: "Media graph",
  version: 3,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  writable: true,
  readOnlyReason: null,
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
  nodes: [
    {
      id: "source",
      kind: "generate.image",
      position: { x: 0, y: 0 },
      configVersion: 1,
      config: { prompt: "source", modelKey: "image/model", parameters: {} },
      selectedOutputAssetId: "asset_1",
    },
    {
      id: "target",
      kind: "generate.image",
      position: { x: 300, y: 0 },
      configVersion: 1,
      config: { prompt: "target", modelKey: "image/model", parameters: {} },
      selectedOutputAssetId: null,
    },
  ],
  edges: [
    {
      id: "edge_1",
      sourceNodeId: "source",
      sourcePortId: "image",
      targetNodeId: "target",
      targetPortId: "references",
      sortOrder: 0,
    },
  ],
};

describe("nodeBananaRuntimeAdapter", () => {
  it("projects canonical Graph data without leaking runtime types into the v2 draft", () => {
    const canonical = graphSnapshotToCanonicalDocument(graph);
    const projection = nodeBananaRuntimeAdapter.project(canonical);

    expect(projection).toMatchObject({ writable: true, readOnlyReason: null });
    expect(projection.state.nodes[0]).toMatchObject({
      type: "generationNode",
      data: { canonicalKind: "generate.image" },
    });
    expect(projection.state.edges[0]).toMatchObject({
      sourceHandle: "image",
      targetHandle: "image",
    });

    const roundTrip = runtimeGraphToCanonicalDocument(canonical, projection.state);
    expect(roundTrip).toEqual(canonical);
    const draft = canonicalDocumentToV3Draft(roundTrip);
    expect(draft).toMatchObject({ schemaVersion: 3, groups: [] });
    expect(draft.nodes.every((node) => !("type" in node))).toBe(true);
  });

  it.each(["future.image.magic", "edit.audio.basic"])("preserves %s as a read-only placeholder", (kind) => {
    const canonical = graphSnapshotToCanonicalDocument({
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          id: "unknown_node",
          kind,
          config: { raw: "preserve-me" },
        },
      ],
      edges: [],
    });
    const projection = nodeBananaRuntimeAdapter.project(canonical);

    expect(runtimeGraphToCanonicalDocument(canonical, projection.state)).toEqual(canonical);
    expect(projection.writable).toBe(false);
    expect(projection.readOnlyReason).toBe("UNKNOWN_NODE_KIND");
    expect(projection.state.nodes[0]).toMatchObject({
      type: "unsupportedNode",
      data: { config: { raw: "preserve-me" }, supported: false },
    });
  });

  it("round-trips a Node Banana edge pause without changing connectivity", () => {
    const canonical = graphSnapshotToCanonicalDocument({
      ...graph,
      edges: [{ ...graph.edges[0], hasPause: true }],
    });
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;

    expect(runtime.edges[0]).toMatchObject({
      data: { hasPause: true },
      style: { stroke: "#ea580c" },
    });
    expect(runtimeGraphToCanonicalDocument(canonical, runtime).edges[0]).toMatchObject({
      hasPause: true,
      sourceNodeId: "source",
      targetNodeId: "target",
    });
  });

  it("filters connection-drop suggestions and creates a typed edge", () => {
    const canonical = graphSnapshotToCanonicalDocument(graph);
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const pending = { nodeId: "source", handleId: "image", handleType: "source" as const };
    const items = [
      { kind: "edit.image.resize", label: "Resize" },
      { kind: "edit.audio.basic", label: "Audio Edit" },
    ];

    expect(filterPaletteForConnection(runtime, items, pending)).toEqual([items[0]]);

    const resize = createCanonicalRuntimeNode("edit.image.resize", "resize_1", { x: 100, y: 120 });
    const edge = connectCreatedRuntimeNode(runtime, resize, pending, "edge_resize");
    expect(edge).toMatchObject({
      source: "source",
      sourceHandle: "image",
      target: "resize_1",
      targetHandle: "image",
    });
  });

  it("creates an Image Input from the Generate Image image target handle", () => {
    const canonical = graphSnapshotToCanonicalDocument(graph);
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const pending = { nodeId: "target", handleId: "image", handleType: "target" as const };
    const items = [
      { kind: "input.image", label: "Image Input" },
      { kind: "input.audio", label: "Audio Input" },
    ];

    expect(filterPaletteForConnection(runtime, items, pending)).toEqual([items[0]]);

    const imageInput = createCanonicalRuntimeNode("input.image", "image-input-1", { x: 100, y: 120 });
    const edge = connectCreatedRuntimeNode(runtime, imageInput, pending, "edge-image-input");
    expect(edge).toMatchObject({
      source: "image-input-1",
      sourceHandle: "image",
      target: "target",
      targetHandle: "image",
    });

    const roundTrip = runtimeGraphToCanonicalDocument(canonical, {
      ...runtime,
      nodes: [...runtime.nodes, imageInput],
      edges: [...runtime.edges, edge!],
    });
    expect(roundTrip.edges.find((candidate) => candidate.id === "edge-image-input")).toMatchObject({
      sourcePortId: "image",
      targetPortId: "primary",
    });
  });



  it("projects the actual Node Banana default footprint before React Flow measures each node", () => {
    const gif = createCanonicalRuntimeNode("edit.image.gif", "gif-default", { x: 0, y: 0 });
    const resize = createCanonicalRuntimeNode("edit.image.resize", "resize-default", { x: 0, y: 0 });
    const stitch = createCanonicalRuntimeNode("edit.video.stitch", "stitch-default", { x: 0, y: 0 });

    expect(gif).toMatchObject({
      width: 480,
      height: 380,
      style: { width: 480, height: 380 },
      data: { config: { parameters: { fps: 8, targetMaxBytes: 128 * 1024 } } },
    });
    expect(resize).toMatchObject({
      width: 320,
      height: 360,
      data: { config: { parameters: { mode: "exact", width: 128, height: 128, format: "png", quality: 0.9 } } },
    });
    expect(stitch).toMatchObject({ width: 400, height: 280, style: { width: 400, height: 280 } });
  });

  it("validates typed connections against the canonical registry", () => {
    const canonical = graphSnapshotToCanonicalDocument({ ...graph, edges: [] });
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const audio = createCanonicalRuntimeNode("input.audio", "audio_1", { x: 0, y: 300 });
    const resize = createCanonicalRuntimeNode("edit.image.resize", "resize_1", { x: 300, y: 300 });
    const extended = { ...runtime, nodes: [...runtime.nodes, audio, resize] };

    expect(
      isRuntimeConnectionValid(canonical, extended, {
        source: "source",
        sourceHandle: "image",
        target: "resize_1",
        targetHandle: "image",
      }),
    ).toBe(true);
    expect(
      isRuntimeConnectionValid(canonical, extended, {
        source: "audio_1",
        sourceHandle: "audio",
        target: "resize_1",
        targetHandle: "image",
      }),
    ).toBe(false);
  });

  it("maps the single Node Banana image handle to canonical primary/references and enforces model capability", () => {
    const canonical = graphSnapshotToCanonicalDocument({ ...graph, edges: [] });
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const first = {
      id: "first",
      source: "source",
      sourceHandle: "image",
      target: "target",
      targetHandle: "image",
    };
    const withFirst = { ...runtime, edges: [first] };
    const second = { ...first, id: "second" };

    expect(runtimeGraphToCanonicalDocument(canonical, { ...runtime, edges: [first, second] }).edges).toMatchObject([
      { targetPortId: "primary", sortOrder: 0 },
      { targetPortId: "references", sortOrder: 0 },
    ]);
    expect(isRuntimeConnectionValid(canonical, runtime, first, {
      imageInputLimit: () => 1,
      videoSupportsInitImage: () => false,
    })).toBe(true);
    expect(isRuntimeConnectionValid(canonical, withFirst, second, {
      imageInputLimit: () => 1,
      videoSupportsInitImage: () => false,
    })).toBe(false);
  });

  it("round-trips GIF and Video Stitch ordered inputs through upstream dynamic handles", () => {
    const canonical = graphSnapshotToCanonicalDocument({
      ...graph,
      nodes: [
        graph.nodes[0],
        {
          id: "gif",
          kind: "edit.image.gif",
          position: { x: 300, y: 200 },
          configVersion: 1,
          config: { parameters: { fps: 8, loopCount: 0, colorCount: 128, dither: false, targetMaxBytes: null } },
          selectedOutputAssetId: null,
        },
      ],
      edges: [
        { id: "frame-0", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "gif", targetPortId: "frames", sortOrder: 0 },
        { id: "frame-3", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "gif", targetPortId: "frames", sortOrder: 3 },
      ],
    });
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;

    expect(runtime.edges.map((edge) => edge.targetHandle)).toEqual(["image-0", "image-3"]);
    expect(runtimeGraphToCanonicalDocument(canonical, runtime).edges).toEqual(canonical.edges);

    const connected = runtimeGraphToCanonicalDocument(canonical, {
      ...runtime,
      edges: [
        ...runtime.edges,
        { id: "frame-2", source: "source", sourceHandle: "image", target: "gif", targetHandle: "image-2" },
      ],
    });
    expect(connected.edges.at(-1)).toMatchObject({ targetPortId: "frames", sortOrder: 2 });
  });

  type HandleMappingCase = {
    name: string;
    source: { id: string; kind: string; port: string; config: CanonicalJsonValue };
    target: { id: string; kind: string; port: string; config: CanonicalJsonValue };
    sourceHandle: string;
    targetHandle: string;
  };
  const handleMappingCases: HandleMappingCase[] = [
    {
      name: "Generate Audio prompt",
      source: { id: "prompt", kind: "input.prompt", port: "text", config: { text: "hello" } },
      target: { id: "audio", kind: "generate.audio", port: "prompt", config: { prompt: "", modelKey: null, parameters: {} } },
      sourceHandle: "text",
      targetHandle: "text",
    },
    {
      name: "Generate Video prompt",
      source: { id: "prompt", kind: "input.prompt", port: "text", config: { text: "hello" } },
      target: { id: "video", kind: "generate.video", port: "prompt", config: { prompt: "", modelKey: null, parameters: {} } },
      sourceHandle: "text",
      targetHandle: "text",
    },
    {
      name: "Generate Video initialization image",
      source: { id: "image", kind: "input.image", port: "image", config: { assetId: "asset_1" } },
      target: { id: "video", kind: "generate.video", port: "initImage", config: { prompt: "", modelKey: "wan2-2-hf", parameters: {} } },
      sourceHandle: "image",
      targetHandle: "image",
    },
    {
      name: "Split Grid image list",
      source: {
        id: "split",
        kind: "edit.image.splitGrid",
        port: "images",
        config: { parameters: { rows: 1, cols: 2, colOffsets: [], rowOffsets: [] } },
      },
      target: { id: "gallery", kind: "output.gallery", port: "image", config: { mediaType: "image" } },
      sourceHandle: "reference",
      targetHandle: "image",
    },
    {
      name: "Ease Curve settings",
      source: {
        id: "ease-source",
        kind: "edit.video.easeCurve",
        port: "settings",
        config: { parameters: { outputDurationMs: 1_500, easingPreset: "linear", bezier: [0.42, 0, 0.58, 1] } },
      },
      target: {
        id: "ease-target",
        kind: "edit.video.easeCurve",
        port: "settings",
        config: { parameters: { outputDurationMs: 1_500, easingPreset: "linear", bezier: [0.42, 0, 0.58, 1] } },
      },
      sourceHandle: "easeCurve",
      targetHandle: "easeCurve",
    },
    {
      name: "Image Compare before",
      source: { id: "before", kind: "input.image", port: "image", config: { assetId: null } },
      target: { id: "compare", kind: "inspect.imageCompare", port: "before", config: {} },
      sourceHandle: "image",
      targetHandle: "image",
    },
    {
      name: "Image Compare after",
      source: { id: "after", kind: "input.image", port: "image", config: { assetId: null } },
      target: { id: "compare", kind: "inspect.imageCompare", port: "after", config: {} },
      sourceHandle: "image",
      targetHandle: "image-1",
    },
  ];

  it.each(handleMappingCases)("round-trips and live-validates $name canonical/runtime handles", ({ source, target, sourceHandle, targetHandle }) => {
    const canonical = graphSnapshotToCanonicalDocument({
      ...graph,
      nodes: [
        {
          id: source.id,
          kind: source.kind,
          position: { x: 0, y: 0 },
          configVersion: 1,
          config: source.config,
          selectedOutputAssetId: null,
        },
        {
          id: target.id,
          kind: target.kind,
          position: { x: 300, y: 0 },
          configVersion: 1,
          config: target.config,
          selectedOutputAssetId: null,
        },
      ],
      edges: [{
        id: "mapped-edge",
        sourceNodeId: source.id,
        sourcePortId: source.port,
        targetNodeId: target.id,
        targetPortId: target.port,
        sortOrder: 0,
      }],
    });
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const runtimeEdge = runtime.edges[0];

    expect(runtimeEdge).toMatchObject({ sourceHandle, targetHandle });
    expect(runtimeGraphToCanonicalDocument(canonical, runtime)).toEqual(canonical);

    // A newly created React Flow edge has no canonical metadata yet. This
    // exercises the reverse mapping used by connection validation and drops.
    const runtimeWithoutMetadata = {
      ...runtime,
      edges: runtime.edges.map((edge) => {
        const withoutMetadata = { ...edge };
        delete withoutMetadata.data;
        return withoutMetadata;
      }),
    };
    expect(runtimeGraphToCanonicalDocument(canonical, runtimeWithoutMetadata)).toEqual(canonical);
    expect(isRuntimeConnectionValid(canonical, { ...runtimeWithoutMetadata, edges: [] }, {
      source: source.id,
      sourceHandle,
      target: target.id,
      targetHandle,
    })).toBe(true);
  });

  it("maps the upstream Split Grid reference handle to the canonical ordered images port", () => {
    const canonical = graphSnapshotToCanonicalDocument({
      ...graph,
      nodes: [
        {
          id: "split",
          kind: "edit.image.splitGrid",
          position: { x: 0, y: 0 },
          configVersion: 1,
          config: { parameters: { rows: 1, cols: 2, colOffsets: [], rowOffsets: [] } },
          selectedOutputAssetId: null,
        },
        {
          id: "gallery",
          kind: "output.gallery",
          position: { x: 300, y: 0 },
          configVersion: 1,
          config: { mediaType: "image" },
          selectedOutputAssetId: null,
        },
      ],
      edges: [{
        id: "split-gallery",
        sourceNodeId: "split",
        sourcePortId: "images",
        targetNodeId: "gallery",
        targetPortId: "image",
        sortOrder: 0,
      }],
    });
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;

    expect(runtime.edges[0]).toMatchObject({ sourceHandle: "reference", targetHandle: "image" });
    expect(runtimeGraphToCanonicalDocument(canonical, runtime).edges).toEqual(canonical.edges);
    expect(isRuntimeConnectionValid(canonical, { ...runtime, edges: [] }, {
      source: "split",
      sourceHandle: "reference",
      target: "gallery",
      targetHandle: "image",
    })).toBe(true);
  });

  it("removes model inputs that become invalid when a generation model changes", () => {
    const canonical = graphSnapshotToCanonicalDocument(graph);
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const capabilities = {
      imageInputLimit: (modelKey: string | null) => modelKey === "image/i2i" ? 1 : 0,
      videoSupportsInitImage: () => false,
    };

    expect(reconcileRuntimeEdgesForModelChange(
      runtime,
      "target",
      { prompt: "target", modelKey: "image/t2i", parameters: {} },
      capabilities,
    )).toEqual([]);

    const withTwoInputs = {
      ...runtime,
      edges: [
        runtime.edges[0],
        { ...runtime.edges[0], id: "edge_2", data: { targetPortId: "references", sortOrder: 1 } },
      ],
    };
    expect(reconcileRuntimeEdgesForModelChange(
      withTwoInputs,
      "target",
      { prompt: "target", modelKey: "image/i2i", parameters: {} },
      capabilities,
    )).toHaveLength(1);
  });

  it("keeps execution projection ephemeral", () => {
    const canonical = graphSnapshotToCanonicalDocument(graph);
    const runtime = nodeBananaRuntimeAdapter.project(canonical).state;
    const next = nodeBananaRuntimeAdapter.projectExecutionEvent(runtime, {
      graphId: graph.id,
      nodeId: "source",
      executionId: "generation_1",
      status: "uploading",
      progress: 87,
    });

    expect(next.nodes[0].data).toMatchObject({
      executionStatus: "uploading",
      executionProgress: 87,
    });
    expect(runtime.nodes[0].data).not.toHaveProperty("executionStatus");
  });
});
