import { describe, expect, it } from "vitest";

import {
  canonicalNodeKinds,
  canonicalNodeRegistry,
  findPortDefinition,
  validateNodeConfig,
} from "./node-registry";

describe("canonical node registry", () => {
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
