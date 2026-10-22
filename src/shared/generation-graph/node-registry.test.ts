import { describe, expect, it } from "vitest";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";

import {
  canonicalNodeKinds,
  canonicalNodeRegistry,
  findPortDefinition,
  generatedResultGalleryItemSchema,
  resultSourceSchema,
  validateNodeConfig,
  type GeneratedResultGalleryItem,
  type ResultSourceSnapshot,
} from "./node-registry";

describe("canonical node registry", () => {
  it("accepts an optional bounded integer frame timestamp without upgrading old configs", () => {
    const legacy = { parameters: {} };
    expect(validateNodeConfig("edit.video.extractFrames", 1, legacy)).toEqual({ supported: true, config: legacy });
    for (const timestampMs of [0, 1, 1250, 600_000]) {
      const config = { parameters: { timestampMs } };
      expect(validateNodeConfig("edit.video.extractFrames", 1, config)).toEqual({ supported: true, config });
    }
    for (const timestampMs of [-1, 600_001, 0.5, NaN, Infinity, -Infinity, null, "1000", false]) {
      expect(validateNodeConfig("edit.video.extractFrames", 1, { parameters: { timestampMs } }))
        .toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
    }
    expect(validateNodeConfig("edit.video.extractFrames", 1, { parameters: { at: 1 } }).supported).toBe(false);
    expect(findPortDefinition("edit.video.extractFrames", "frame", "output"))
      .toMatchObject({ valueType: "image", valueShape: "single", acceptedMimeTypes: ["image/png"] });
    for (const port of ["startFrame", "endFrame"]) expect(findPortDefinition("edit.video.extractFrames", port, "output"))
      .toMatchObject({ valueType: "image", valueShape: "single", acceptedMimeTypes: ["image/png", "image/webp"] });
  });

  it("preserves legacy Memo configs and accepts only an optional six-digit hex background color", () => {
    const legacy = { text: "Saved note", size: { width: 510, height: 350 }, presentation: { customTitle: "My notes" } };
    expect(validateNodeConfig("note.memo", 1, legacy)).toEqual({ supported: true, config: legacy });
    for (const backgroundColor of ["#000000", "#ffffff", "#A1b2C3"]) {
      expect(validateNodeConfig("note.memo", 1, { ...legacy, backgroundColor }))
        .toEqual({ supported: true, config: { ...legacy, backgroundColor } });
    }
    for (const backgroundColor of [null, 123, "", "red", "#abc", "#12345678", "#gg1234", "#123456\n", "#123456; color: red", "url(https://example.test/image)", "#" + "f".repeat(20_000)]) {
      expect(validateNodeConfig("note.memo", 1, { ...legacy, backgroundColor })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
    }
    expect(validateNodeConfig("input.prompt", 1, { text: "Prompt", backgroundColor: "#123456" }).supported).toBe(false);
    expect(validateNodeConfig("note.memo", 1, { ...legacy, color: "#123456" }).supported).toBe(false);
  });

  it("accepts additive Cinema for image/video while preserving legacy and rejecting unknown/media-specific values", () => {
    const config = { prompt: "source", modelKey: "model", parameters: {} };
    const cinema = { ...defaultCinemaSettings(), lighting: "window" };
    for (const kind of ["generate.image", "generate.video"]) {
      expect(validateNodeConfig(kind, 1, config)).toMatchObject({ supported: true, config });
      expect(validateNodeConfig(kind, 1, { ...config, cinema })).toMatchObject({ supported: true, config: { cinema } });
      expect(validateNodeConfig(kind, 1, { ...config, cinema: { ...cinema, schemaVersion: 99 } }).supported).toBe(false);
      expect(validateNodeConfig(kind, 1, { ...config, cinema: { ...cinema, lens: "deleted" } }).supported).toBe(false);
    }
    expect(validateNodeConfig("generate.image", 1, { ...config, cinema: { ...cinema, movement: "orbit" } }).supported).toBe(false);
    expect(validateNodeConfig("generate.image", 1, { ...config, cinema: { ...cinema, shootingEnabled: false, movement: "orbit" } }).supported).toBe(false);
    expect(validateNodeConfig("generate.image", 1, { ...config, cinema: { ...cinema, shootingEnabled: false, camera: "16mm-film" } }))
      .toMatchObject({ supported: true, config: { cinema: { ...cinema, camera: "auto" } } });
    expect(validateNodeConfig("generate.video", 1, { ...config, cinema: { ...cinema, movement: "orbit" } }).supported).toBe(true);
    expect(validateNodeConfig("generate.audio", 1, { ...config, cinema }).supported).toBe(false);
  });
  it("validates stored cell templates and rejects multiplication beyond the Space limit", () => {
    const template = { baseNodeId: "base", nodes: [
      { id: "base", kind: "input.image", configVersion: 1, config: { assetId: null }, position: { x: 0, y: 0 } },
      { id: "text", kind: "input.prompt", configVersion: 1, config: { text: "hello" }, position: { x: 300, y: 0 } },
    ], edges: [] };
    expect(validateNodeConfig("edit.image.splitGrid", 1, { parameters: { rows: 2, cols: 2 }, template }).supported).toBe(true);
    expect(validateNodeConfig("edit.image.splitGrid", 1, { parameters: { rows: 20, cols: 20 }, template }).supported).toBe(false);
    expect(validateNodeConfig("edit.image.splitGrid", 1, { parameters: {}, template: { ...template, router: [] } }).supported).toBe(false);
    expect(validateNodeConfig("edit.image.splitGrid", 1, { parameters: {}, template: { ...template, nodes: [{ ...template.nodes[0], config: { assetId: "sample-media" } }] } }).supported).toBe(false);
  });
  it("defines every approved F059 Node kind without deferred subsystems", () => {
    expect(Object.keys(canonicalNodeRegistry)).toEqual(canonicalNodeKinds);
    expect(Object.keys(canonicalNodeRegistry)).not.toEqual(
      expect.arrayContaining(["generate.3d", "author.ai", "comfy.workflow"]),
    );
  });

  it("captures ordered cardinality and media capability constraints", () => {
    expect(findPortDefinition("edit.video.stitch", "clips", "input")).toMatchObject({
      valueType: "video",
      edgeCardinality: "many",
      valueShape: "ordered-list",
      ordered: true,
      minConnections: 2,
      maxConnections: null,
      requiredCapabilities: ["video_encode", "video_mux"],
    });
    for (const portId of ["image", "video", "audio"]) {
      expect(findPortDefinition("output.gallery", portId, "input")).toMatchObject({
        valueType: portId,
        homogeneous: true,
        ordered: true,
      });
    }
  });

  it("distinguishes unknown kinds, config versions and invalid configs", () => {
    expect(validateNodeConfig("future.node", 1, {})).toMatchObject({
      supported: false,
      reason: "UNKNOWN_NODE_KIND",
    });
    expect(validateNodeConfig("input.prompt", 2, { text: "x" })).toMatchObject({
      supported: false,
      reason: "UNKNOWN_CONFIG_VERSION",
    });
    expect(validateNodeConfig("input.prompt", 1, { text: "x", provider: "leak" })).toMatchObject({
      supported: false,
      reason: "INVALID_NODE_CONFIG",
    });
    expect(validateNodeConfig("input.prompt", 1, { text: "x" })).toMatchObject({
      supported: true,
    });
  });

  it("normalizes image-operation defaults and rejects unsafe bounds", () => {
    expect(validateNodeConfig("edit.image.resize", 1, { parameters: {} })).toMatchObject({
      supported: true,
      config: { parameters: { mode: "exact", width: 128, height: 128, maxEdge: 128, format: "png", quality: 0.9 } },
    });
    expect(validateNodeConfig("edit.image.splitGrid", 1, { parameters: { rows: 21 } })).toMatchObject({
      supported: false,
      reason: "INVALID_NODE_CONFIG",
    });
    expect(validateNodeConfig("edit.image.gif", 1, { parameters: { fps: 61 } })).toMatchObject({
      supported: false,
      reason: "INVALID_NODE_CONFIG",
    });
  });

  it("persists bounded Node Banana presentation metadata without weakening strict configs", () => {
    expect(validateNodeConfig("input.image", 1, {
      assetId: null,
      presentation: {
        customTitle: "Mood board",
        comment: "Use the latest approved reference.",
        isOptional: true,
      },
    })).toMatchObject({ supported: true });
    expect(validateNodeConfig("input.image", 1, {
      assetId: null,
      presentation: { customTitle: "x".repeat(121) },
    })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
    expect(validateNodeConfig("input.image", 1, {
      assetId: null,
      presentation: { isOptional: "yes" },
    })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
  });

  it("accepts bounded upstream input filenames and Prompt variable names", () => {
    expect(validateNodeConfig("input.audio", 1, {
      assetId: "asset-audio",
      filename: "voice-over.wav",
    })).toMatchObject({ supported: true });
    expect(validateNodeConfig("input.prompt", 1, {
      text: "A portrait",
      variableName: "subject",
    })).toMatchObject({ supported: true });
    expect(validateNodeConfig("input.prompt", 1, {
      text: "A portrait",
      variableName: "",
    })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
  });

  it("accepts bounded durable Output Gallery exclusions", () => {
    expect(validateNodeConfig("output.gallery", 1, {
      mediaType: "audio",
      excludedAssetIds: ["audio-1"],
    })).toMatchObject({
      supported: true,
      config: { excludedAssetIds: ["audio-1"] },
    });
    expect(validateNodeConfig("output.gallery", 1, {
      mediaType: null,
      excludedAssetIds: [""],
    })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
  });

  it("validates optional Gallery occurrence exclusions without changing old configs or single Outputs", () => {
    const entry = { edgeId: "edge", assetId: "same", occurrence: 1 };
    const config = { mediaType: null, excludedAssetIds: ["legacy"], excludedOccurrences: [entry], legacyExcludedEdgeIds: ["old-edge"] };
    expect(validateNodeConfig("output.gallery", 1, config)).toEqual({ supported: true, config });
    expect(validateNodeConfig("output.single", 1, config).supported).toBe(false);
    for (const item of [{ ...entry, edgeId: "" }, { ...entry, assetId: "" }, { ...entry, occurrence: -1 },
      { ...entry, occurrence: 0.5 }, { ...entry, occurrence: 2_000 }, { ...entry, extra: true }]) {
      expect(validateNodeConfig("output.gallery", 1, { ...config, excludedOccurrences: [item] }).supported).toBe(false);
    }
    expect(validateNodeConfig("output.gallery", 1, { ...config, excludedOccurrences: Array(2_000).fill(entry) }).supported).toBe(true);
    expect(validateNodeConfig("output.gallery", 1, { ...config, excludedOccurrences: Array(2_001).fill(entry) }).supported).toBe(false);
    expect(validateNodeConfig("output.gallery", 1, { ...config, excludedOccurrences: null }).supported).toBe(false);
    for (const legacyExcludedEdgeIds of [null, [""], Array(2_001).fill("edge")]) {
      expect(validateNodeConfig("output.gallery", 1, { ...config, legacyExcludedEdgeIds }).supported).toBe(false);
    }
  });

  it("preserves manual Galleries without adding a result snapshot or changing single Outputs", () => {
    const legacy = { mediaType: "image", excludedAssetIds: ["hidden"], presentation: { customTitle: "References" } };
    expect(validateNodeConfig("output.gallery", 1, legacy)).toEqual({ supported: true, config: legacy });
    expect(validateNodeConfig("output.gallery", 1, { mediaType: null }))
      .toEqual({ supported: true, config: { mediaType: null, excludedAssetIds: [] } });
    expect(validateNodeConfig("output.gallery", 1, { ...legacy, resultItems: [] }))
      .toEqual({ supported: true, config: { ...legacy, resultItems: [] } });
    expect(validateNodeConfig("output.single", 1, legacy)).toEqual({ supported: true, config: legacy });
    expect(validateNodeConfig("output.single", 1, { ...legacy, resultItems: [] }).supported).toBe(false);
  });

  it("round-trips ordered frozen Gallery slots with pending, completed and terminal results", () => {
    const source: ResultSourceSnapshot = { nodeId: "producer", executionId: "run", portId: "image", index: 0, state: "pending" };
    const resultItems: GeneratedResultGalleryItem[] = [
      { ...source, id: "slot-1", mediaType: "image", assetId: null },
      { ...source, id: "slot-2", index: 1, outputCount: 2, state: "completed", mediaType: "image", assetId: "first-asset" },
      { ...source, id: "slot-3", executionId: "later-run", portId: "video", state: "failed", mediaType: "video", assetId: null },
      { ...source, id: "slot-4", executionId: null, portId: "audio", state: "cancelled", mediaType: "audio", assetId: null },
    ];
    const config = { mediaType: null, excludedAssetIds: ["first-asset"], resultItems };
    expect(validateNodeConfig("output.gallery", 1, JSON.parse(JSON.stringify(config))))
      .toEqual({ supported: true, config });
    expect(generatedResultGalleryItemSchema.parse(resultItems[0])).toEqual(resultItems[0]);
    expect(resultSourceSchema.parse(source)).toEqual(source);
    expect(validateNodeConfig("input.image", 1, { assetId: null, resultSource: source }))
      .toEqual({ supported: true, config: { assetId: null, resultSource: source } });
  });

  it.each([
    ["empty slot ID", { id: "" }],
    ["missing slot ID", { id: undefined }],
    ["oversized slot ID", { id: "x".repeat(129) }],
    ["empty source ID", { nodeId: " " }],
    ["non-string execution ID", { executionId: 123 }],
    ["missing execution ID", { executionId: undefined }],
    ["empty port ID", { portId: "" }],
    ["negative index", { index: -1 }],
    ["out-of-range index", { index: 500 }],
    ["fractional index", { index: 0.5 }],
    ["negative output count", { outputCount: -1 }],
    ["out-of-range output count", { outputCount: 501 }],
    ["unknown state", { state: "processing" }],
    ["unknown media type", { mediaType: "text" }],
    ["empty asset ID", { assetId: "" }],
    ["missing asset ID", { assetId: undefined }],
    ["unknown field", { url: "https://example.test/asset" }],
  ])("rejects a Gallery snapshot with %s", (_label, patch) => {
    const item = { id: "slot", nodeId: "producer", executionId: null, portId: "image", index: 0,
      state: "pending", mediaType: "image", assetId: null, ...patch };
    expect(generatedResultGalleryItemSchema.safeParse(item).success).toBe(false);
    expect(validateNodeConfig("output.gallery", 1, { mediaType: "image", resultItems: [item] }).supported).toBe(false);
  });

  it("bounds result snapshots at 500 unique slots while retaining optional source output counts", () => {
    const source: ResultSourceSnapshot = { nodeId: "producer", executionId: null, portId: "image", index: 0, state: "pending" };
    expect(resultSourceSchema.parse({ ...source, outputCount: 0 })).toEqual({ ...source, outputCount: 0 });
    expect(resultSourceSchema.parse({ ...source, index: 499, outputCount: 500 })).toEqual({ ...source, index: 499, outputCount: 500 });
    expect(resultSourceSchema.safeParse({ ...source, id: "slot" }).success).toBe(false);
    const resultItems = Array.from({ length: 500 }, (_, index) => ({ ...source,
      id: `slot-${index}`, index, mediaType: "image", assetId: null }));
    expect(validateNodeConfig("output.gallery", 1, { mediaType: "image", resultItems }).supported).toBe(true);
    expect(validateNodeConfig("output.gallery", 1, { mediaType: "image",
      resultItems: [...resultItems, { ...resultItems[0], id: "overflow-slot" }] }).supported).toBe(false);
    expect(validateNodeConfig("output.gallery", 1, { mediaType: "image",
      resultItems: [resultItems[0], { ...resultItems[1], id: resultItems[0].id }] }).supported).toBe(false);
    expect(validateNodeConfig("output.gallery", 1, { mediaType: "image", resultItems: null }).supported).toBe(false);
  });

  it("normalizes versioned video-operation parameters and keeps audio stripping explicit", () => {
    expect(validateNodeConfig("edit.video.stitch", 1, { parameters: {} })).toMatchObject({
      supported: true,
      config: { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } },
    });
    expect(validateNodeConfig("edit.video.trim", 1, { parameters: {} })).toMatchObject({
      supported: true,
      config: { parameters: { startMs: 0, endMs: 5_000, stripAudio: false } },
    });
    expect(validateNodeConfig("edit.video.frameGrab", 1, { parameters: {} })).toMatchObject({
      supported: true,
      config: { parameters: { position: "first" } },
    });
    expect(validateNodeConfig("edit.video.easeCurve", 1, { parameters: {} })).toMatchObject({
      supported: true,
      config: { parameters: { outputDurationMs: 1_500, easingPreset: "easeInOutSine" } },
    });
    expect(validateNodeConfig("edit.video.trim", 1, {
      parameters: { startMs: 5_000, endMs: 5_000 },
    })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
    expect(validateNodeConfig("edit.video.stitch", 1, {
      parameters: { repeat: 4 },
    })).toMatchObject({ supported: false, reason: "INVALID_NODE_CONFIG" });
    expect(validateNodeConfig("edit.image.removeBackground", 1, { parameters: {} })).toMatchObject({
      supported: true,
      config: { parameters: { model: "isnet_fp16" } },
    });
    expect(validateNodeConfig("edit.image.gif", 1, {
      parameters: { clipOrder: ["edge-2", "edge-1"] },
    })).toMatchObject({
      supported: true,
      config: { parameters: { clipOrder: ["edge-2", "edge-1"] } },
    });
  });

  it("rejects the removed Audio Edit kind and exposes no ports", () => {
    expect(canonicalNodeKinds).not.toContain("edit.audio.basic");
    expect(findPortDefinition("edit.audio.basic", "audio", "input")).toBeUndefined();
    expect(validateNodeConfig("edit.audio.basic", 1, { parameters: {} })).toMatchObject({
      supported: false, reason: "UNKNOWN_NODE_KIND",
    });
  });
});
