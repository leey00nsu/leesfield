import { describe, expect, it } from "vitest";

import {
  adaptNodeBananaHostGraph,
  canonicalPortForUpstreamHandle,
  nodeBananaLegacyTypeByCanonicalKind,
  upstreamHandlesForCanonicalKind,
  type NodeBananaAssetResolver,
  type NodeBananaHostGraphInput,
} from "./node-banana-host-adapter";
import { canonicalNodeKinds, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";

const position = { x: 0, y: 0 };

function canonicalNode(
  id: string,
  kind: CanonicalNodeKind,
  config: Record<string, unknown> = {},
  selectedOutputAssetId: string | null = null,
) {
  return {
    id,
    kind,
    position,
    configVersion: 1,
    config,
    selectedOutputAssetId,
  };
}

function graph(
  nodes: ReturnType<typeof canonicalNode>[],
  edges: Array<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    sortOrder?: number;
    hasPause?: boolean;
  }> = [],
): NodeBananaHostGraphInput {
  return {
    schemaVersion: 3, groups: [],
    minimumWriterVersion: 3,
    id: "adapter-test",
    version: 1,
    title: "Adapter test",
    nodes,
    edges: edges.map((edge) => ({ ...edge, sortOrder: edge.sortOrder ?? 0 })),
  } as NodeBananaHostGraphInput;
}

const resolver: NodeBananaAssetResolver = (assetId, context) => {
  const type = assetId.startsWith("audio") ? "audio" : assetId.startsWith("video") ? "video" : "image";
  return {
    id: assetId,
    url: `https://cdn.test/${assetId}`,
    type,
    mimeType: `${type}/${type === "image" ? "png" : type === "audio" ? "wav" : "mp4"}`,
    width: type === "image" ? 640 : null,
    height: type === "image" ? 480 : null,
    durationMs: type === "image" ? null : 12_500,
    filename: `${assetId}.${type === "image" ? "png" : type === "audio" ? "wav" : "mp4"}`,
    metadata: { role: context.role },
  };
};

describe("Node Banana v1.9 host adapter", () => {
  it.each(canonicalNodeKinds)("projects %s to its audited upstream legacy node type and handles", (kind) => {
    const result = adaptNodeBananaHostGraph(graph([canonicalNode("node", kind)]), resolver);
    const node = result.nodes[0];

    expect(node.type).toBe(nodeBananaLegacyTypeByCanonicalKind[kind]);
    expect(node.data.canonicalKind).toBe(kind);
    expect(node.data.configVersion).toBe(1);
    expect(node.data.upstreamHandles).toEqual(upstreamHandlesForCanonicalKind(kind));
    expect((node.data.upstreamHandles as unknown[]).length).toBeGreaterThan(0);
    expect(result.getConnectedInputs("node")).toMatchObject({
      images: [],
      videos: [],
      audio: [],
      audios: [],
      text: null,
    });
  });

  it("maps input asset IDs to upstream content URLs and keeps resolver metadata", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("image", "input.image", { assetId: "image-1" }),
      canonicalNode("audio", "input.audio", { assetId: "audio-1" }),
      canonicalNode("video", "input.video", { assetId: "video-1" }),
      canonicalNode("prompt", "input.prompt", { text: "a red fox" }),
    ]), resolver);

    expect(result.nodes[0].data).toMatchObject({
      image: "https://cdn.test/image-1",
      imageRef: "image-1",
      filename: "image-1.png",
      dimensions: { width: 640, height: 480 },
    });
    expect(result.nodes[1].data).toMatchObject({
      audioFile: "https://cdn.test/audio-1",
      audioFileRef: "audio-1",
      duration: 12.5,
      format: "audio/wav",
    });
    expect(result.nodes[2].data).toMatchObject({
      video: "https://cdn.test/video-1",
      videoRef: "video-1",
      duration: 12.5,
      dimensions: null,
      format: "video/mp4",
    });
    expect(result.nodes[3].data).toMatchObject({ prompt: "a red fox" });
  });

  it("maps generation model, parameters, run status, and selected output", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode(
        "generation",
        "generate.image",
        {
          prompt: "portrait",
          modelKey: "nano-banana-pro",
          parameters: { aspectRatio: "16:9", resolution: "2K", seed: 7 },
        },
        "image-output",
      ),
    ]), {
      resolveAsset: resolver,
    });
    const data = result.nodes[0].data;

    expect(data.type).toBeUndefined();
    expect(data.prompt).toBe("portrait");
    expect(data.inputPrompt).toBe("portrait");
    expect(data.model).toBe("nano-banana-pro");
    expect(data.modelKey).toBe("nano-banana-pro");
    expect(data.selectedModel).toMatchObject({
      modelId: "nano-banana-pro",
      provider: "gemini",
    });
    expect(data.parameters).toEqual({ aspectRatio: "16:9", resolution: "2K", seed: 7 });
    expect(data.outputImage).toBe("https://cdn.test/image-output");
    expect(data.outputAssetId).toBe("image-output");
    expect(data.status).toBe("idle");
    expect(data.runReady).toBe(true);

    const processing = adaptNodeBananaHostGraph({
      ...graph([canonicalNode("generation", "generate.image", {
        prompt: "portrait",
        modelKey: "nano-banana-pro",
        parameters: {},
      })]),
      nodes: [{
        ...canonicalNode("generation", "generate.image", {
          prompt: "portrait",
          modelKey: "nano-banana-pro",
          parameters: {},
        }),
        // Runtime-only execution fields are accepted when the graph is passed
        // through a structural runtime boundary in the host.
      }],
    } as NodeBananaHostGraphInput, resolver);
    expect(processing.nodes[0].data.status).toBe("idle");
  });

  it("accepts a model catalog/provider resolver and exposes the upstream SelectedModel shape", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("generation", "generate.video", {
        prompt: "camera move",
        modelKey: "provider/video-model",
        parameters: { duration: 5 },
      }),
    ]), {
      resolveModel: (modelKey, context) => {
        expect(context).toEqual({ nodeId: "generation", kind: "generate.video" });
        return {
          id: modelKey,
          provider: "replicate",
          name: "Video Model",
          capabilities: ["text-to-video", "image-to-video"],
          pricing: { type: "per-run", amount: 0.25 },
        };
      },
    });

    expect(result.nodes[0].data).toMatchObject({
      model: "provider/video-model",
      modelKey: "provider/video-model",
      modelCatalogEntry: {
        provider: "replicate",
        name: "Video Model",
      },
      selectedModel: {
        provider: "replicate",
        modelId: "provider/video-model",
        displayName: "Video Model",
        capabilities: ["text-to-video", "image-to-video"],
        pricing: { type: "per-run", amount: 0.25 },
      },
    });
  });

  it("adapts dynamic GIF/stitch ports from canonical order and preserves pause metadata", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("i0", "input.image", { assetId: "image-0" }),
      canonicalNode("i1", "input.image", { assetId: "image-1" }),
      canonicalNode("gif", "edit.image.gif", {
        parameters: { fps: 12, loopCount: 2, colorCount: 64, dither: true, targetMaxBytes: 5000 },
      }),
      canonicalNode("v0", "input.video", { assetId: "video-0" }),
      canonicalNode("v1", "input.video", { assetId: "video-1" }),
      canonicalNode("a0", "input.audio", { assetId: "audio-0" }),
      canonicalNode("stitch", "edit.video.stitch", {
        parameters: { repeat: 3, stripAudio: true },
      }),
    ], [
      { id: "gif-1", sourceNodeId: "i1", sourcePortId: "image", targetNodeId: "gif", targetPortId: "frames", sortOrder: 1 },
      { id: "gif-0", sourceNodeId: "i0", sourcePortId: "image", targetNodeId: "gif", targetPortId: "frames", sortOrder: 0, hasPause: true },
      { id: "stitch-1", sourceNodeId: "v1", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 1 },
      { id: "stitch-0", sourceNodeId: "v0", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 0 },
      { id: "soundtrack", sourceNodeId: "a0", sourcePortId: "audio", targetNodeId: "stitch", targetPortId: "soundtrack" },
    ]), resolver);

    expect(result.edges.find((edge) => edge.id === "gif-0")).toMatchObject({
      sourceHandle: "image",
      targetHandle: "image-0",
      data: { targetPortId: "frames", sortOrder: 0, hasPause: true },
    });
    expect(result.edges.find((edge) => edge.id === "gif-1")?.targetHandle).toBe("image-1");
    expect(result.edges.find((edge) => edge.id === "stitch-0")?.targetHandle).toBe("video-0");
    expect(result.edges.find((edge) => edge.id === "stitch-1")?.targetHandle).toBe("video-1");

    const gif = result.nodes.find((node) => node.id === "gif")!;
    const stitch = result.nodes.find((node) => node.id === "stitch")!;
    expect(gif.data).toMatchObject({
      fps: 12,
      loopCount: 2,
      colorCount: 64,
      dither: true,
      targetMaxBytes: 5000,
      clipOrder: ["gif-0", "gif-1"],
      frames: ["https://cdn.test/image-0", "https://cdn.test/image-1"],
    });
    expect(stitch.data).toMatchObject({
      loopCount: 3,
      stripAudio: true,
      clipOrder: ["stitch-0", "stitch-1"],
      clipUrls: ["https://cdn.test/video-0", "https://cdn.test/video-1"],
      soundtrack: "https://cdn.test/audio-0",
    });
  });

  it("returns upstream-shaped connected inputs with typed values and schema dynamic names", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("image", "input.image", { assetId: "image-1" }),
      canonicalNode("prompt", "input.prompt", { text: "sunset" }),
      canonicalNode("generation", "generate.image", {
        prompt: "fallback",
        modelKey: "model-x",
        parameters: {},
      }),
    ], [
      { id: "image-edge", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "generation", targetPortId: "references", sortOrder: 0 },
      { id: "prompt-edge", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "generation", targetPortId: "prompt" },
    ]), resolver);

    expect(result.getConnectedInputs("generation")).toEqual({
      images: ["https://cdn.test/image-1"],
      videos: [],
      audio: [],
      audios: [],
      model3d: null,
      text: "sunset",
      textItems: [],
      dynamicInputs: {},
      easeCurve: null,
    });
  });

  it.each(["input.image", "edit.image.splitGrid"] as const)("preserves reference semantics from %s", (sourceKind) => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("source-image", sourceKind, { assetId: "image-upstream" }, "image-upstream"),
      canonicalNode("pass-image", "input.image", { assetId: "image-local" }),
      canonicalNode("source-prompt", "input.prompt", { text: "upstream prompt" }),
      canonicalNode("pass-prompt", "input.prompt", { text: "local prompt" }),
      canonicalNode("generation", "generate.image", {
        prompt: "fallback",
        modelKey: "model-x",
        parameters: {},
      }),
    ], [
      { id: "pass-image-edge", sourceNodeId: "source-image", sourcePortId: sourceKind === "input.image" ? "image" : "images", targetNodeId: "pass-image", targetPortId: "reference" },
      { id: "generation-image-edge", sourceNodeId: "pass-image", sourcePortId: "image", targetNodeId: "generation", targetPortId: "primary" },
      { id: "pass-prompt-edge", sourceNodeId: "source-prompt", sourcePortId: "text", targetNodeId: "pass-prompt", targetPortId: "text" },
      { id: "generation-prompt-edge", sourceNodeId: "pass-prompt", sourcePortId: "text", targetNodeId: "generation", targetPortId: "prompt" },
    ]), resolver);

    expect(result.getConnectedInputs("generation")).toMatchObject({
      images: [sourceKind === "input.image" ? "https://cdn.test/image-upstream" : "https://cdn.test/image-local"],
      text: "upstream prompt",
    });
    expect(result.getConnectedInputs("pass-image").images).toEqual(sourceKind === "input.image" ? ["https://cdn.test/image-upstream"] : []);
  });

  it.each([false, true])("keeps empty connected inputs authoritative until disconnect (paused: %s)", (hasPause) => {
    const nodes = [
      canonicalNode("empty", "input.image"),
      canonicalNode("local", "input.image", { assetId: "image-local" }),
      canonicalNode("empty-text", "input.prompt", { text: "" }),
      canonicalNode("local-text", "input.prompt", { text: "local prompt" }),
      canonicalNode("consumer", "generate.image"),
    ];
    const consumerEdges = [
      { id: "image-out", sourceNodeId: "local", sourcePortId: "image", targetNodeId: "consumer", targetPortId: "primary" },
      { id: "text-out", sourceNodeId: "local-text", sourcePortId: "text", targetNodeId: "consumer", targetPortId: "prompt" },
    ];
    const connected = adaptNodeBananaHostGraph(graph(nodes, [
      ...consumerEdges,
      { id: "image-in", sourceNodeId: "empty", sourcePortId: "image", targetNodeId: "local", targetPortId: "reference", hasPause },
      { id: "text-in", sourceNodeId: "empty-text", sourcePortId: "text", targetNodeId: "local-text", targetPortId: "text", hasPause },
    ]), resolver);
    expect(connected.getConnectedInputs("consumer")).toMatchObject({ images: [], text: null });
    const disconnected = adaptNodeBananaHostGraph(graph(nodes, consumerEdges), resolver);
    expect(disconnected.getConnectedInputs("consumer")).toMatchObject({ images: ["https://cdn.test/image-local"], text: "local prompt" });
  });

  it("populates operation/editor controls and converts canonical milliseconds to upstream seconds", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("trim", "edit.video.trim", {
        parameters: { startMs: 1250, endMs: 5750, stripAudio: true },
      }),
      canonicalNode("frame", "edit.video.frameGrab", { parameters: { position: "last" } }),
      canonicalNode("ease", "edit.video.easeCurve", {
        parameters: {
          outputDurationMs: 2750,
          easingPreset: "easeInOutCubic",
          bezier: [0.1, 0.2, 0.8, 0.9],
        },
      }),
      canonicalNode("resize", "edit.image.resize", {
        parameters: {
          mode: "exact", width: 800, height: 600, maxEdge: 2048, scalePct: 100,
          fit: "contain", padColor: "#123456", format: "png", quality: 0.88,
        },
      }),
      canonicalNode("split", "edit.image.splitGrid", {
        parameters: { rows: 2, cols: 3, rowOffsets: [0.4], colOffsets: [0.2, 0.8] },
      }),
      canonicalNode("annotation", "edit.image.annotation", { parameters: { shapes: [{ id: "rect", type: "rectangle", x: 1, y: 2, width: 3, height: 4, stroke: "#f00", strokeWidth: 2, opacity: 0.8, fill: null }] } }),
    ]), resolver);

    expect(result.nodes.find((node) => node.id === "trim")?.data).toMatchObject({
      startMs: 1250,
      endMs: 5750,
      startTime: 1.25,
      endTime: 5.75,
      stripAudio: true,
    });
    expect(result.nodes.find((node) => node.id === "frame")?.data.framePosition).toBe("last");
    expect(result.nodes.find((node) => node.id === "ease")?.data).toMatchObject({
      outputDurationMs: 2750,
      outputDuration: 2.75,
      easingPreset: "easeInOutCubic",
      bezierHandles: [0.1, 0.2, 0.8, 0.9],
    });
    expect(result.nodes.find((node) => node.id === "resize")?.data).toMatchObject({
      mode: "exact",
      width: 800,
      height: 600,
      fit: "contain",
      padColor: "#123456",
      format: "png",
      quality: 0.88,
    });
    expect(result.nodes.find((node) => node.id === "split")?.data).toMatchObject({
      gridRows: 2,
      gridCols: 3,
      rowOffsets: [0.4],
      colOffsets: [0.2, 0.8],
      disableSplitGridTemplateEditor: false,
    });
    expect(result.nodes.find((node) => node.id === "annotation")?.data.annotations).toHaveLength(1);
  });

  it("bridges output, gallery, and compare assets while exposing the actual gallery audio limitation", () => {
    const result = adaptNodeBananaHostGraph(graph([
      canonicalNode("image", "input.image", { assetId: "image-1" }),
      canonicalNode("video", "input.video", { assetId: "video-1" }),
      canonicalNode("audio", "input.audio", { assetId: "audio-1" }),
      canonicalNode("single", "output.single", { mediaType: null }),
      canonicalNode("gallery", "output.gallery", { mediaType: null }),
      canonicalNode("compare", "inspect.imageCompare"),
    ], [
      { id: "single-image", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "single", targetPortId: "image" },
      { id: "gallery-image", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: 0 },
      { id: "gallery-video", sourceNodeId: "video", sourcePortId: "video", targetNodeId: "gallery", targetPortId: "video", sortOrder: 1 },
      { id: "gallery-audio", sourceNodeId: "audio", sourcePortId: "audio", targetNodeId: "gallery", targetPortId: "audio", sortOrder: 2 },
      { id: "compare-a", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "compare", targetPortId: "before", sortOrder: 0 },
      { id: "compare-b", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "compare", targetPortId: "after", sortOrder: 1 },
    ]), resolver);

    expect(result.nodes.find((node) => node.id === "single")?.data).toMatchObject({
      image: "https://cdn.test/image-1",
      imageRef: "image-1",
      contentType: "image",
    });
    expect(result.nodes.find((node) => node.id === "gallery")?.data).toMatchObject({
      images: ["https://cdn.test/image-1"],
      imageRefs: ["image-1"],
      videos: ["https://cdn.test/video-1"],
      videoRefs: ["video-1"],
      audios: ["https://cdn.test/audio-1"],
      audioRefs: ["audio-1"],
    });
    expect((result.nodes.find((node) => node.id === "gallery")?.data.upstreamHandles as Array<{ id: string; upstreamAvailable: boolean }>).find((handle) => handle.id === "audio")).toMatchObject({
      upstreamAvailable: true,
    });
    expect(result.nodes.find((node) => node.id === "compare")?.data).toMatchObject({
      imageA: "https://cdn.test/image-1",
      imageB: "https://cdn.test/image-1",
      imageARef: "image-1",
      imageBRef: "image-1",
    });
    expect(result.edges.find((edge) => edge.id === "compare-b")).toMatchObject({ targetHandle: "image-1" });
  });

  it("accepts a legacy runtime graph, keeps runtime fields, and normalizes its edges", () => {
    const runtime = {
      nodes: [
        { id: "image", type: "imageInput", position, data: { canonicalKind: "input.image", configVersion: 1, config: { assetId: "image-1" }, selectedOutputAssetId: null } },
        { id: "prompt", type: "prompt", position, data: { canonicalKind: "input.prompt", configVersion: 1, config: { text: "runtime prompt" }, selectedOutputAssetId: null, customRuntimeFlag: true } },
        { id: "gen", type: "nanoBanana", position, data: { canonicalKind: "generate.image", configVersion: 1, config: { prompt: "runtime", modelKey: "nano-banana", parameters: {} }, selectedOutputAssetId: "output-1", executionStatus: "processing", executionProgress: 44 } },
      ],
      edges: [
        { id: "runtime-image", source: "image", target: "gen", sourceHandle: "image", targetHandle: "image", data: { sourcePortId: "image", targetPortId: "references", sortOrder: 0 } },
        { id: "runtime-prompt", source: "prompt", target: "gen", sourceHandle: "text", targetHandle: "text", data: { sourcePortId: "text", targetPortId: "prompt", sortOrder: 0 } },
      ],
    };
    const result = adaptNodeBananaHostGraph(runtime, resolver);

    expect(result.nodes.find((node) => node.id === "prompt")?.data.customRuntimeFlag).toBe(true);
    expect(result.nodes.find((node) => node.id === "gen")?.data).toMatchObject({
      status: "loading",
      progress: 44,
      outputImage: "https://cdn.test/output-1",
    });
    expect(result.edges).toMatchObject([
      { id: "runtime-image", sourceHandle: "image", targetHandle: "image" },
      { id: "runtime-prompt", sourceHandle: "text", targetHandle: "text" },
    ]);
    expect(result.getConnectedInputs("gen")).toMatchObject({
      images: ["https://cdn.test/image-1"],
      text: "runtime prompt",
    });
  });

  it("keeps handle reverse mapping explicit for the audited shared and dynamic upstream IDs", () => {
    expect(upstreamHandlesForCanonicalKind("generate.audio").find((handle) => handle.canonicalPortId === "prompt")).toMatchObject({ id: "text" });
    expect(upstreamHandlesForCanonicalKind("generate.video").find((handle) => handle.canonicalPortId === "prompt")).toMatchObject({ id: "text" });
    expect(canonicalPortForUpstreamHandle("generate.image", "input", "text")).toBe("prompt");
    expect(canonicalPortForUpstreamHandle("generate.image", "input", "image")).toBe("primary");
    expect(canonicalPortForUpstreamHandle("edit.image.gif", "input", "image-3")).toBe("frames");
    expect(canonicalPortForUpstreamHandle("edit.video.stitch", "input", "video-2")).toBe("clips");
    expect(canonicalPortForUpstreamHandle("edit.video.easeCurve", "input", "easeCurve")).toBe("settings");
    expect(canonicalPortForUpstreamHandle("inspect.imageCompare", "input", "image-1")).toBe("after");
  });

  it("assigns metadata-free Generate Image handles to primary then ordered references", () => {
    const runtime = {
      nodes: [
        { id: "image-a", type: "imageInput", position, data: { canonicalKind: "input.image", config: { assetId: "image-1" } } },
        { id: "image-b", type: "imageInput", position, data: { canonicalKind: "input.image", config: { assetId: "image-2" } } },
        { id: "gen", type: "nanoBanana", position, data: { canonicalKind: "generate.image", config: { prompt: "test", modelKey: "model", parameters: {} } } },
      ],
      edges: [
        { id: "primary", source: "image-a", target: "gen", sourceHandle: "image", targetHandle: "image" },
        { id: "reference", source: "image-b", target: "gen", sourceHandle: "image", targetHandle: "image" },
      ],
    };

    const result = adaptNodeBananaHostGraph(runtime, resolver);
    expect(result.edges.map((edge) => edge.data)).toMatchObject([
      { sourcePortId: "image", targetPortId: "primary", sortOrder: 0 },
      { sourcePortId: "image", targetPortId: "references", sortOrder: 0 },
    ]);
  });

  it("clears stale runtime media after canonical assets, outputs, or incoming edges are removed", () => {
    const runtime = {
      nodes: [
        {
          id: "input",
          type: "imageInput",
          position,
          data: {
            canonicalKind: "input.image",
            config: { assetId: null },
            image: "blob:stale-input",
            imageRef: "stale-input",
          },
        },
        {
          id: "generation",
          type: "nanoBanana",
          position,
          data: {
            canonicalKind: "generate.image",
            config: { prompt: "", modelKey: null, parameters: {} },
            selectedOutputAssetId: null,
            outputImage: "blob:stale-output",
            outputAssetId: "stale-output",
          },
        },
        {
          id: "annotation",
          type: "annotation",
          position,
          data: {
            canonicalKind: "edit.image.annotation",
            config: { parameters: { shapes: [] } },
            sourceImage: "blob:stale-connected-source",
            sourceImageRef: "stale-connected-source",
          },
        },
      ],
      edges: [],
    };

    const result = adaptNodeBananaHostGraph(runtime, resolver);
    expect(result.nodes.find((node) => node.id === "input")?.data).toMatchObject({
      image: null,
      imageRef: null,
    });
    expect(result.nodes.find((node) => node.id === "generation")?.data).toMatchObject({
      outputImage: null,
      outputAssetId: null,
      outputAsset: null,
    });
    expect(result.nodes.find((node) => node.id === "annotation")?.data).toMatchObject({
      sourceImage: null,
      sourceImageRef: null,
    });
  });
});
