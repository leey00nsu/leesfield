import { describe, it, expect } from "vitest";

import {
  comboOptions,
  graphClassTypes,
  isExposableWidget,
  isPromptWidget,
  isSeedKey,
  leafKey,
  loaderInputType,
  loaderWidgetKey,
  mediaTypeForFilename,
  mimeForFilename,
  outputTypeFor,
  parseApiGraph,
  patchGraph,
  pruneToOutputs,
  widgetConstraints,
} from "../graph";
import type { ComfyGraph, ComfyObjectInfo } from "../types";

const simpleGraph = (): ComfyGraph => ({
  "1": { class_type: "LoadImage", inputs: { image: "placeholder.png" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "a cat", clip: ["5", 0] } },
  "3": {
    class_type: "KSampler",
    inputs: { seed: 42, steps: 20, cfg: 8, positive: ["2", 0], latent_image: ["1", 0] },
  },
  "4": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: "ComfyUI" } },
  "5": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd.safetensors" } },
});

describe("parseApiGraph", () => {
  it("accepts a bare API graph", () => {
    expect(Object.keys(parseApiGraph(simpleGraph()))).toHaveLength(5);
  });

  it("unwraps a {prompt: …} envelope", () => {
    const graph = parseApiGraph({ prompt: simpleGraph() });
    expect(graph["4"]?.class_type).toBe("SaveImage");
  });

  it("drops non-node keys rather than failing", () => {
    const graph = parseApiGraph({ ...simpleGraph(), extra_data: { foo: 1 }, client_id: "abc" });
    expect(Object.keys(graph).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("rejects a blob with no nodes", () => {
    expect(() => parseApiGraph({ nothing: "here" })).toThrow(/No executable nodes/);
    expect(() => parseApiGraph([1, 2, 3])).toThrow(/workflow JSON object/);
    expect(() => parseApiGraph(null)).toThrow(/workflow JSON object/);
  });
});

describe("widget classification", () => {
  it("reads the leaf of a dotted dynamic-combo key", () => {
    expect(leafKey("model.aspect_ratio")).toBe("aspect_ratio");
    expect(leafKey("steps")).toBe("steps");
  });

  it("recognises every seed spelling ComfyUI uses", () => {
    expect(isSeedKey("seed")).toBe(true);
    expect(isSeedKey("noise_seed")).toBe(true);
    expect(isSeedKey("output_mode.texture_seed")).toBe(true);
    expect(isSeedKey("steps")).toBe(false);
  });

  it("treats encoder strings and prompt-shaped keys as connectable text", () => {
    const encode = { class_type: "CLIPTextEncode", inputs: {} };
    expect(isPromptWidget(encode, "text")).toBe(true);
    expect(isPromptWidget({ class_type: "KSampler", inputs: {} }, "prompt")).toBe(true);
    expect(isPromptWidget({ class_type: "KSampler", inputs: {} }, "steps")).toBe(false);
  });

  it("hides plumbing widgets and link inputs", () => {
    const node = { class_type: "LoadImage", inputs: {} };
    expect(isExposableWidget(node, "image", "cat.png")).toBe(false);
    expect(isExposableWidget(node, "filename_prefix", "ComfyUI")).toBe(false);
    expect(isExposableWidget(node, "steps", ["2", 0])).toBe(false);
    expect(isExposableWidget(node, "steps", 20)).toBe(true);
  });

  it("folds a CustomCombo's option list into its choice widget", () => {
    const node = {
      class_type: "CustomCombo",
      inputs: { choice: "b", index: 1, option1: "a", option2: "b", option3: "  " },
    };
    expect(comboOptions(node, "choice")).toEqual(["a", "b"]);
    expect(isExposableWidget(node, "index", 1)).toBe(false);
    expect(isExposableWidget(node, "option1", "a")).toBe(false);
  });
});

describe("object_info driven metadata", () => {
  const objectInfo: ComfyObjectInfo = {
    KSampler: {
      input: {
        required: {
          steps: ["INT", { default: 20, min: 1, max: 10000, tooltip: "How many steps." }],
          sampler_name: [["euler", "dpmpp_2m"], { tooltip: "Sampler." }],
          text: ["STRING", { multiline: true }],
          mode: ["COMBO", { options: ["fast", "slow"] }],
        },
      },
    },
  };
  const node = { class_type: "KSampler", inputs: { steps: 20 } };

  it("reads a legacy combo, where the option array IS the type", () => {
    expect(comboOptions(node, "sampler_name", objectInfo)).toEqual(["euler", "dpmpp_2m"]);
  });

  it("reads a V3 combo, whose options sit in the config object", () => {
    expect(comboOptions(node, "mode", objectInfo)).toEqual(["fast", "slow"]);
  });

  it("returns null for a free-form widget", () => {
    expect(comboOptions(node, "steps", objectInfo)).toBeNull();
  });

  it("surfaces bounds, tooltips and multiline", () => {
    expect(widgetConstraints(objectInfo, node, "steps")).toEqual({
      minimum: 1,
      maximum: 10000,
      description: "How many steps.",
    });
    expect(widgetConstraints(objectInfo, node, "text").multiline).toBe(true);
  });

  it("treats the int64 extremes as no bound at all", () => {
    // What a generic `PrimitiveFloat` declares. Reported verbatim it would tell
    // the user their brightness must stay under 9,223,372,036,854,775,807.
    const unbounded: ComfyObjectInfo = {
      PrimitiveFloat: {
        input: {
          required: {
            value: ["FLOAT", { min: -9223372036854775808, max: 9223372036854775807 }],
          },
        },
      },
    };
    const primitive = { class_type: "PrimitiveFloat", inputs: { value: 0 } };
    expect(widgetConstraints(unbounded, primitive, "value")).toEqual({});
  });

  it("descends into the selected option of a dynamic combo", () => {
    const dynamic: ComfyObjectInfo = {
      Partner: {
        input: {
          required: {
            model: [
              "COMFY_DYNAMICCOMBO_V3",
              {
                options: [
                  { key: "flux", inputs: { required: { resolution: [["1K", "2K"]] } } },
                  { key: "sdxl", inputs: { required: { resolution: [["512", "768"]] } } },
                ],
              },
            ],
          },
        },
      },
    };
    const partner = { class_type: "Partner", inputs: { model: "sdxl" } };
    expect(comboOptions(partner, "model.resolution", dynamic)).toEqual(["512", "768"]);
  });
});

describe("loaderWidgetKey", () => {
  it("uses the conventional widget the node declares", () => {
    expect(loaderWidgetKey("LoadImage", { class_type: "LoadImage", inputs: { image: "a.png" } })).toBe(
      "image"
    );
    expect(
      loaderWidgetKey("VHS_LoadVideo", { class_type: "VHS_LoadVideo", inputs: { video: "a.mp4" } })
    ).toBe("video");
  });

  it("finds the filename widget when the pack names it something else", () => {
    // Core LoadVideo calls it `file`, VHS calls it `video` — the node itself
    // is the authority, not the class name.
    expect(
      loaderWidgetKey("LoadVideo", { class_type: "LoadVideo", inputs: { file: "a.mp4", fps: 24 } })
    ).toBe("file");
  });

  it("falls back to the conventional name when the graph has no such widget", () => {
    expect(loaderWidgetKey("LoadImage")).toBe("image");
    expect(loaderWidgetKey("LoadAudio")).toBe("audio");
  });

  it("does not guess when several string widgets could be the filename", () => {
    expect(
      loaderWidgetKey("LoadVideo", {
        class_type: "LoadVideo",
        inputs: { path: "a.mp4", format: "mp4" },
      })
    ).toBe("video");
  });
});

describe("input/output classification", () => {
  it("maps loader classes to the media they ingest", () => {
    expect(loaderInputType("LoadImage")).toBe("image");
    expect(loaderInputType("LoadAudio")).toBe("audio");
    expect(loaderInputType("VHS_LoadVideo")).toBe("video");
    expect(loaderInputType("KSampler")).toBeNull();
  });

  it("maps sink classes to the handle they produce", () => {
    expect(outputTypeFor("SaveImage")).toBe("image");
    expect(outputTypeFor("VHS_VideoCombine")).toBe("video");
    expect(outputTypeFor("PreviewAny")).toBe("text");
    expect(outputTypeFor("SaveGLB")).toBe("3d");
    expect(outputTypeFor("KSampler")).toBeNull();
  });

  it("falls back to the file extension for produced media", () => {
    expect(mediaTypeForFilename("out.png")).toBe("image");
    expect(mediaTypeForFilename("clip.mp4")).toBe("video");
    expect(mediaTypeForFilename("voice.flac")).toBe("audio");
    expect(mediaTypeForFilename("mesh.glb")).toBe("3d");
  });
});

describe("patchGraph", () => {
  it("binds media, assignments and outputs without touching the original", () => {
    const graph = simpleGraph();
    const patched = patchGraph(graph, {
      media: [{ nodeId: "1", inputKey: "image", value: "uploaded.png" }],
      assignments: [{ nodeId: "2", inputKey: "text", value: "a dog" }],
      outputNodeIds: ["4"],
    });
    expect(patched["1"]?.inputs.image).toBe("uploaded.png");
    expect(patched["2"]?.inputs.text).toBe("a dog");
    // The source graph is the app's stored contract — it must survive a run.
    expect(graph["1"]?.inputs.image).toBe("placeholder.png");
  });

  it("coerces a form value to the type the widget already holds", () => {
    const patched = patchGraph(simpleGraph(), {
      media: [],
      assignments: [
        { nodeId: "3", inputKey: "steps", value: "35" },
        { nodeId: "3", inputKey: "cfg", value: "not a number" },
      ],
      outputNodeIds: [],
    });
    expect(patched["3"]?.inputs.steps).toBe(35);
    // An unparseable value must not turn a numeric widget into a string the
    // engine will reject — keep what was there.
    expect(patched["3"]?.inputs.cfg).toBe(8);
  });

  it("randomises seeds but leaves ones the user pinned", () => {
    const graph = simpleGraph();
    graph["6"] = { class_type: "Sampler2", inputs: { noise_seed: 1, steps: 5 } };
    const patched = patchGraph(graph, {
      media: [],
      assignments: [],
      outputNodeIds: [],
      seed: 12345,
      pinnedSeeds: [{ nodeId: "3", inputKey: "seed" }],
    });
    expect(patched["3"]?.inputs.seed).toBe(42);
    expect(patched["6"]?.inputs.noise_seed).toBe(12345);
    expect(patched["6"]?.inputs.steps).toBe(5);
  });

  it("rewrites a preview sink so its output is actually persisted", () => {
    const graph: ComfyGraph = {
      "1": { class_type: "PreviewImage", inputs: { images: ["2", 0] } },
    };
    const patched = patchGraph(graph, { media: [], assignments: [], outputNodeIds: ["1"] });
    expect(patched["1"]?.class_type).toBe("SaveImage");
    expect(patched["1"]?.inputs.images).toEqual(["2", 0]);
    expect(patched["1"]?.inputs.filename_prefix).toBe("node-banana");
  });

  it("gives each run its own output filename so a repeat run is not served from cache", () => {
    const graph: ComfyGraph = {
      "1": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: "art" } },
      "2": { class_type: "UpscaleImage", inputs: { image: ["3", 0] } },
    };
    const first = patchGraph(graph, {
      media: [],
      assignments: [],
      outputNodeIds: ["1"],
      runTag: "aaa111",
    });
    const second = patchGraph(graph, {
      media: [],
      assignments: [],
      outputNodeIds: ["1"],
      runTag: "bbb222",
    });
    expect(first["1"]?.inputs.filename_prefix).toBe("art_aaa111");
    expect(second["1"]?.inputs.filename_prefix).toBe("art_bbb222");
    // Only the sink varies — upstream must stay byte-identical so the engine
    // can still serve the expensive work from its cache.
    expect(first["2"]).toEqual(second["2"]);
  });

  it("tags a rewritten preview sink too", () => {
    const graph: ComfyGraph = {
      "1": { class_type: "PreviewImage", inputs: { images: ["2", 0] } },
    };
    const patched = patchGraph(graph, {
      media: [],
      assignments: [],
      outputNodeIds: ["1"],
      runTag: "ccc333",
    });
    expect(patched["1"]?.class_type).toBe("SaveImage");
    expect(patched["1"]?.inputs.filename_prefix).toBe("node-banana_ccc333");
  });

  it("leaves filenames alone without a run tag, and never invents one", () => {
    const graph: ComfyGraph = {
      "1": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: "art" } },
      "2": { class_type: "ShowText", inputs: { text: ["3", 0] } },
    };
    const untagged = patchGraph(graph, { media: [], assignments: [], outputNodeIds: ["1"] });
    expect(untagged["1"]?.inputs.filename_prefix).toBe("art");

    // A sink with no filename to vary must not gain one — an input the class
    // does not declare would fail validation on the engine.
    const tagged = patchGraph(graph, {
      media: [],
      assignments: [],
      outputNodeIds: ["1", "2"],
      runTag: "ddd444",
    });
    expect(tagged["2"]?.inputs).not.toHaveProperty("filename_prefix");
  });

  it("re-derives a CustomCombo's index from the chosen label", () => {
    const graph: ComfyGraph = {
      "1": {
        class_type: "CustomCombo",
        inputs: { choice: "a", index: 0, option1: "a", option2: "b", option3: "c" },
      },
    };
    const patched = patchGraph(graph, {
      media: [],
      assignments: [{ nodeId: "1", inputKey: "choice", value: "c" }],
      outputNodeIds: [],
    });
    // The engine executes on `index`; a headless run has no frontend to keep
    // the two in sync, so picking "c" must move the index too.
    expect(patched["1"]?.inputs.index).toBe(2);
  });

  it("reports a binding that points at a missing node", () => {
    expect(() =>
      patchGraph(simpleGraph(), {
        media: [{ nodeId: "99", inputKey: "image", value: "x.png" }],
        assignments: [],
        outputNodeIds: [],
      })
    ).toThrow(/missing from the workflow/);
  });
});

describe("pruneToOutputs", () => {
  it("keeps only what a bound output depends on", () => {
    const graph = simpleGraph();
    graph["10"] = { class_type: "SaveImage", inputs: { images: ["11", 0] } };
    graph["11"] = { class_type: "UpscaleImage", inputs: { image: ["3", 0] } };

    const pruned = pruneToOutputs(graph, ["4"]);
    expect(Object.keys(pruned).sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(pruned["10"]).toBeUndefined();
  });

  it("returns the whole graph when nothing valid is kept", () => {
    const graph = simpleGraph();
    expect(Object.keys(pruneToOutputs(graph, ["nope"]))).toHaveLength(5);
  });
});

describe("graphClassTypes", () => {
  it("lists distinct class types for a compatibility check", () => {
    expect(graphClassTypes(simpleGraph())).toEqual([
      "CLIPTextEncode",
      "CheckpointLoaderSimple",
      "KSampler",
      "LoadImage",
      "SaveImage",
    ]);
  });
});

describe("3D and text file typing", () => {
  it("types a gaussian splat as 3D, not as a picture", () => {
    // A 23MB .ply came back labelled image/png because the extension was
    // missing from the table and fell through to the image fallback.
    expect(mimeForFilename("scene.ply")).toBe("model/ply");
    expect(mediaTypeForFilename("scene.ply")).toBe("3d");
    expect(mediaTypeForFilename("scene.splat")).toBe("3d");
    expect(mediaTypeForFilename("scene.spz")).toBe("3d");
  });

  it("types a saved caption as text", () => {
    expect(mimeForFilename("caption.txt")).toBe("text/plain");
  });
});
