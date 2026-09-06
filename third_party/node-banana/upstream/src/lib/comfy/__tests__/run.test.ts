import { describe, it, expect } from "vitest";

import { buildRunGraph, hashSeed, nameFailedOutput, newRunTag, resolveOutputs } from "../server/run";
import type { ComfyAppDefinition } from "../types";

const app = (overrides: Partial<ComfyAppDefinition> = {}): ComfyAppDefinition => ({
  id: "app-1",
  name: "Test App",
  description: "",
  source: "upload",
  graph: {
    "16": { class_type: "LoadImage", inputs: { image: "placeholder.png" } },
    "24": { class_type: "CLIPTextEncode", inputs: { text: "saved prompt", clip: ["5", 0] } },
    "31": {
      class_type: "KSampler",
      inputs: { seed: 7, steps: 20, positive: ["24", 0], latent_image: ["16", 0] },
    },
    "9": { class_type: "SaveImage", inputs: { images: ["31", 0] } },
    "5": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd.safetensors" } },
    "99": { class_type: "SaveImage", inputs: { images: ["98", 0] } },
    "98": { class_type: "UpscaleImage", inputs: { image: ["31", 0] } },
  },
  inputs: [
    {
      id: "16:image",
      name: "product",
      label: "Product",
      type: "image",
      nodeId: "16",
      inputKey: "image",
      required: true,
    },
    {
      id: "24:text",
      name: "prompt",
      label: "Prompt",
      type: "text",
      nodeId: "24",
      inputKey: "text",
      required: false,
    },
  ],
  params: [
    { id: "31:steps", label: "Steps", nodeId: "31", inputKey: "steps", type: "integer", default: 20 },
    { id: "31:seed", label: "Seed", nodeId: "31", inputKey: "seed", type: "integer", isSeed: true },
  ],
  outputs: [{ id: "9", label: "Result", type: "image", nodeId: "9", classType: "SaveImage" }],
  classTypes: [],
  nodeCount: 7,
  createdAt: 0,
  ...overrides,
});

describe("newRunTag", () => {
  it("is unique and safe to append to a filename prefix", () => {
    const tags = new Set(Array.from({ length: 100 }, () => newRunTag()));
    expect(tags.size).toBe(100);
    for (const tag of tags) expect(tag).toMatch(/^[0-9a-f]{10}$/);
  });
});

describe("hashSeed", () => {
  it("is deterministic and stays inside the safe integer range", () => {
    expect(hashSeed("run-1")).toBe(hashSeed("run-1"));
    expect(hashSeed("run-1")).not.toBe(hashSeed("run-2"));
    // ComfyUI declares seed maxima up to 2^64-1, which JSON cannot round-trip.
    expect(hashSeed("anything")).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    // And ComfyUI rejects a negative seed, so the floor matters as much.
    expect(hashSeed("anything")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashSeed("anything"))).toBe(true);
  });
});

describe("buildRunGraph", () => {
  it("binds uploads, text and parameters", () => {
    const graph = buildRunGraph({
      app: app(),
      text: { prompt: "a running fox" },
      uploads: { product: "uploaded-123.png" },
      params: { "31:steps": 35 },
    });
    expect(graph["16"]?.inputs.image).toBe("uploaded-123.png");
    expect(graph["24"]?.inputs.text).toBe("a running fox");
    expect(graph["31"]?.inputs.steps).toBe(35);
  });

  it("passes the run tag down to the bound sink", () => {
    // A converted graph always carries the saver's required `filename_prefix`.
    const saving = () => {
      const definition = app();
      definition.graph["9"] = {
        class_type: "SaveImage",
        inputs: { images: ["31", 0], filename_prefix: "art" },
      };
      return definition;
    };
    // Two runs of an otherwise identical graph must differ at the sink, or the
    // engine executes nothing the second time and returns no outputs at all.
    const first = buildRunGraph({
      app: saving(),
      text: {},
      uploads: {},
      params: {},
      runTag: "aaa111",
    });
    const second = buildRunGraph({
      app: saving(),
      text: {},
      uploads: {},
      params: {},
      runTag: "bbb222",
    });
    expect(first["9"]?.inputs.filename_prefix).not.toEqual(second["9"]?.inputs.filename_prefix);
    expect(first["31"]).toEqual(second["31"]);
  });

  it("keeps the author's saved values for inputs left unconnected", () => {
    const graph = buildRunGraph({
      app: app(),
      text: {},
      uploads: { product: "uploaded-123.png" },
      params: {},
    });
    // A partially-wired app should still run and show the author's example
    // rather than refusing.
    expect(graph["24"]?.inputs.text).toBe("saved prompt");
  });

  it("patches a core/ASSET reference through unchanged", () => {
    const reference = { __type: "core/ASSET", info: { id: "asset-1" } };
    const graph = buildRunGraph({
      app: app(),
      text: {},
      uploads: { product: reference },
      params: {},
    });
    expect(graph["16"]?.inputs.image).toEqual(reference);
  });

  it("prunes branches no bound output depends on", () => {
    const graph = buildRunGraph({ app: app(), text: {}, uploads: {}, params: {} });
    // Node 99/98 feed a Save the author did not expose — running them would be
    // billed work whose result is discarded.
    expect(graph["99"]).toBeUndefined();
    expect(graph["98"]).toBeUndefined();
    expect(graph["9"]).toBeDefined();
  });

  it("keeps a bound input even when its branch reaches no bound output", () => {
    const orphaned = app();
    // A loader whose only consumer is an unexposed Save: pruning from the
    // outputs alone would drop it, and binding its upload would then fail.
    orphaned.graph["31"] = { class_type: "KSampler", inputs: { seed: 7, steps: 20 } };
    const graph = buildRunGraph({
      app: orphaned,
      text: {},
      uploads: { product: "uploaded-123.png" },
      params: {},
    });
    expect(graph["16"]?.inputs.image).toBe("uploaded-123.png");
  });

  it("randomises seeds unless the user set one", () => {
    const randomised = buildRunGraph({
      app: app(),
      text: {},
      uploads: {},
      params: {},
      seed: 4242,
    });
    expect(randomised["31"]?.inputs.seed).toBe(4242);

    const pinned = buildRunGraph({
      app: app(),
      text: {},
      uploads: {},
      params: { "31:seed": 999 },
      seed: 4242,
    });
    expect(pinned["31"]?.inputs.seed).toBe(999);
  });

  it("patches a curve into the graph verbatim", () => {
    const definition = app();
    definition.graph["40"] = {
      class_type: "CurveEditor",
      inputs: { curve: { points: [[0, 0], [1, 1]], interpolation: "monotone_cubic" } },
    };
    definition.params = [
      ...definition.params,
      { id: "40:curve", label: "Curve", nodeId: "40", inputKey: "curve", type: "curve" },
    ];
    const shaped = {
      points: [
        [0, 0],
        [0.5, 0.8],
        [1, 1],
      ],
      interpolation: "monotone_cubic",
    };
    const graph = buildRunGraph({
      app: definition,
      text: {},
      uploads: {},
      params: { "40:curve": shaped },
    });
    // The engine expects its own JSON shape back — coercing it to a string or a
    // number would be rejected outright.
    expect(graph["40"]?.inputs.curve).toEqual(shaped);
  });

  it("ignores blank parameter values instead of writing empties into the graph", () => {
    const graph = buildRunGraph({
      app: app(),
      text: {},
      uploads: {},
      params: { "31:steps": "" },
    });
    expect(graph["31"]?.inputs.steps).toBe(20);
  });
});

describe("resolveOutputs", () => {
  const media = (nodeId: string) => ({
    nodeId,
    type: "image" as const,
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
    filename: "out.png",
  });

  it("matches assets to handles by node id", () => {
    const resolved = resolveOutputs(app(), [media("9")]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.handleId).toBe("9");
    expect(resolved[0]?.value.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("never emits a data URL with no media type", () => {
    // Comfy Cloud reports an empty content type for a workflow's own saved
    // files. `data:;base64,…` is parsed as text: it will not render in an
    // <img>, and decoding it back for a downstream node loses the format.
    const resolved = resolveOutputs(app(), [{ ...media("9"), contentType: "" }]);
    expect(resolved[0]?.value.startsWith("data:;")).toBe(false);
    expect(resolved[0]?.value.startsWith("data:application/octet-stream;base64,")).toBe(true);
  });

  it("falls back to type matching when the producing node differs", () => {
    // Some packs report a file under a different node than the bound sink.
    const resolved = resolveOutputs(app(), [media("77")]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.handleId).toBe("9");
  });

  it("returns text outputs as plain strings, not data URLs", () => {
    const textApp = app({
      outputs: [{ id: "40", label: "Caption", type: "text", nodeId: "40", classType: "PreviewAny" }],
    });
    const resolved = resolveOutputs(textApp, [{ nodeId: "40", type: "text", text: "a fox" }]);
    expect(resolved[0]).toEqual({ handleId: "40", type: "text", value: "a fox" });
  });

  it("assigns each asset to at most one handle", () => {
    const twoOutputs = app({
      outputs: [
        { id: "9", label: "A", type: "image", nodeId: "9", classType: "SaveImage" },
        { id: "99", label: "B", type: "image", nodeId: "99", classType: "SaveImage" },
      ],
    });
    const resolved = resolveOutputs(twoOutputs, [media("9"), media("99")]);
    expect(resolved.map((r) => r.handleId)).toEqual(["9", "99"]);
  });

  it("leaves a handle unresolved rather than mismatching types", () => {
    const videoApp = app({
      outputs: [{ id: "9", label: "Clip", type: "video", nodeId: "9", classType: "SaveVideo" }],
    });
    expect(resolveOutputs(videoApp, [media("77")])).toEqual([]);
  });
});

describe("a setting the author tied to several nodes", () => {
  it("writes every binding, not just the first", () => {
    // A Blueprint boundary slot can feed a checkpoint loader, a VAE loader and
    // a text encoder at once. The author exposed one control; writing only the
    // first would leave the model beside the VAE it did not ship with.
    const graph = buildRunGraph({
      app: app({
        params: [
          {
            id: "5:ckpt_name",
            label: "ckpt_name",
            nodeId: "5",
            inputKey: "ckpt_name",
            type: "string",
            alsoBind: [{ nodeId: "98", inputKey: "image" }],
          },
        ],
      }),
      text: {},
      uploads: {},
      params: { "5:ckpt_name": "flux.safetensors" },
    });

    expect(graph["5"]?.inputs.ckpt_name).toBe("flux.safetensors");
    expect(graph["98"]?.inputs.image).toBe("flux.safetensors");
  });

  it("keeps an extra-bound node out of the prune", () => {
    // Pruning keeps only what a bound output, input or param reaches. A node
    // reachable solely through an extra binding must survive too, or patching
    // it would write into a node that is no longer in the graph.
    const graph = buildRunGraph({
      app: app({
        outputs: [{ id: "9", label: "Image", type: "image", nodeId: "9", classType: "SaveImage" }],
        params: [
          {
            id: "5:ckpt_name",
            label: "ckpt_name",
            nodeId: "5",
            inputKey: "ckpt_name",
            type: "string",
            alsoBind: [{ nodeId: "99", inputKey: "filename_prefix" }],
          },
        ],
      }),
      text: {},
      uploads: {},
      params: { "5:ckpt_name": "flux.safetensors" },
    });

    expect(graph["99"]).toBeDefined();
    expect(graph["99"]?.inputs.filename_prefix).toBe("flux.safetensors");
  });

  it("does the same when the author's control became a handle", () => {
    // A Blueprint's STRING boundary slot becomes a connectable input, not a
    // setting — and one prompt slot can feed two text encoders. Carrying the
    // extra bindings only on params left the second encoder rendering the
    // workflow's own saved text while the first got the user's.
    const graph = buildRunGraph({
      app: app({
        inputs: [
          {
            id: "24:text",
            name: "prompt",
            label: "Prompt",
            type: "text",
            nodeId: "24",
            inputKey: "text",
            required: false,
            alsoBind: [{ nodeId: "99", inputKey: "filename_prefix" }],
          },
        ],
      }),
      text: { prompt: "a running fox" },
      uploads: {},
      params: {},
    });

    expect(graph["24"]?.inputs.text).toBe("a running fox");
    // Reached only through the extra binding, so it also proves the prune kept it.
    expect(graph["99"]?.inputs.filename_prefix).toBe("a running fox");
  });
});

describe("nameFailedOutput", () => {
  const twoOutputs = app({
    outputs: [
      { id: "9", label: "Result", type: "image", nodeId: "9", classType: "SaveImage" },
      { id: "1000002", label: "Audio", type: "audio", nodeId: "1000002", classType: "SaveAudio" },
    ],
  });

  it("names the handle a failing sink belongs to", () => {
    // What this is for: a Blueprint that hands back a video's audio alongside
    // the picture loses the picture too when the clip is silent, and says so
    // only as "node 1000002" — a node the importer invented, which the user has
    // never seen.
    const message = nameFailedOutput(
      { error: "Comfy Cloud job failed: SaveAudio: input audio is None.", errorNodeId: "1000002" },
      twoOutputs
    );
    expect(message).toContain('"Audio" output');
    expect(message).toContain("Inputs, settings and outputs");
  });

  it("stays quiet when the failure is not an output of this node", () => {
    const message = nameFailedOutput(
      { error: "Comfy Cloud job failed: KSampler: out of memory", errorNodeId: "31" },
      twoOutputs
    );
    expect(message).toBe("Comfy Cloud job failed: KSampler: out of memory");
  });

  it("does not offer to drop the only output there is", () => {
    // Turning it off would leave nothing to run for, and the dialog refuses it.
    const message = nameFailedOutput(
      { error: "Comfy Cloud job failed: SaveImage exploded", errorNodeId: "9" },
      app()
    );
    expect(message).toBe("Comfy Cloud job failed: SaveImage exploded");
  });
});
