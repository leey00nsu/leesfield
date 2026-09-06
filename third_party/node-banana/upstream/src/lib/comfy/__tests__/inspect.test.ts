import { describe, it, expect } from "vitest";

import { inspectWorkflow, normalizeInputs, uniqueSlug } from "../inspect";
import type { ComfyAppInput, ComfyGraph, ComfyObjectInfo } from "../types";

const graph = (): ComfyGraph => ({
  "16": { class_type: "LoadImage", inputs: { image: "product.png" }, _meta: { title: "Product" } },
  "24": {
    class_type: "CLIPTextEncode",
    inputs: { text: "a cat", clip: ["5", 0] },
    _meta: { title: "Prompt" },
  },
  "31": { class_type: "KSampler", inputs: { seed: 42, steps: 20, cfg: 8, model: ["5", 0] } },
  "9": { class_type: "SaveImage", inputs: { images: ["31", 0], filename_prefix: "ComfyUI" } },
  "5": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd.safetensors" } },
});

describe("uniqueSlug", () => {
  it("slugifies and de-duplicates", () => {
    const taken = new Set<string>();
    expect(uniqueSlug("Product · Image", taken)).toBe("product_image");
    expect(uniqueSlug("Product · Image", taken)).toBe("product_image_2");
    expect(uniqueSlug("!!!", taken)).toBe("input");
  });
});

describe("inspectWorkflow with a curve widget", () => {
  // How ComfyUI's CurveEditor arrives: the widget's value is an object, not a
  // scalar, and a graph full of them used to inspect as having no settings.
  const curveGraph = (): ComfyGraph => ({
    "4": {
      class_type: "CurveEditor",
      inputs: {
        curve: { points: [[0, 0], [1, 1]], interpolation: "monotone_cubic" },
        histogram: ["9", 0],
      },
      _meta: { title: "RGB Master" },
    },
    "9": { class_type: "ImageHistogram", inputs: { image: ["1", 0] } },
    "1": { class_type: "LoadImage", inputs: { image: "in.png" } },
    "8": { class_type: "SaveImage", inputs: { images: ["4", 0], filename_prefix: "out" } },
  });

  it("exposes the curve as its own parameter type", () => {
    const inspection = inspectWorkflow(curveGraph(), {
      appMode: { inputs: [{ nodeId: "4", widget: "curve" }], outputNodeIds: ["8"] },
    });
    const param = inspection.suggested.params.find((p) => p.nodeId === "4");
    expect(param).toMatchObject({ type: "curve", inputKey: "curve" });
    expect(param?.default).toEqual({
      points: [[0, 0], [1, 1]],
      interpolation: "monotone_cubic",
    });
  });

  it("never offers a curve as a connectable handle", () => {
    // The engine declares CURVE `socketless`, and there is nothing on the canvas
    // that could produce one.
    const inspection = inspectWorkflow(curveGraph());
    const candidate = inspection.widgetCandidates.find((c) => c.inputKey === "curve");
    expect(candidate?.valueType).toBe("curve");
    expect(candidate?.connectableAs).toBeNull();
    expect(inspection.suggested.inputs.some((i) => i.inputKey === "curve")).toBe(false);
  });

  it("classifies a curve without a reachable catalog", () => {
    // The value's shape is self-describing, which matters because an API-format
    // import may have no engine at all.
    const inspection = inspectWorkflow(curveGraph(), { objectInfo: {} });
    expect(inspection.widgetCandidates.find((c) => c.inputKey === "curve")?.valueType).toBe("curve");
  });
});

describe("inspectWorkflow without App Mode", () => {
  const inspection = inspectWorkflow(graph(), { defaultName: "My Workflow" });

  it("finds the loaders, sinks and widgets", () => {
    expect(inspection.imageInputCandidates.map((c) => c.nodeId)).toEqual(["16"]);
    expect(inspection.outputCandidates.map((c) => c.nodeId)).toEqual(["9"]);
    expect(inspection.widgetCandidates.map((c) => `${c.nodeId}.${c.inputKey}`).sort()).toEqual([
      "24.text",
      "31.cfg",
      "31.seed",
      "31.steps",
      "5.ckpt_name",
    ]);
  });

  it("proposes the image loader and the prompt as connectable inputs", () => {
    expect(inspection.suggested.inputs.map((i) => [i.type, i.nodeId, i.inputKey])).toEqual([
      ["image", "16", "image"],
      ["text", "24", "text"],
    ]);
  });

  it("binds the Save node as the output", () => {
    expect(inspection.suggested.outputs).toEqual([
      // An untitled sink reads better as its plain type than as its class name.
      { id: "9", label: "Image", type: "image", nodeId: "9", classType: "SaveImage" },
    ]);
  });

  it("suggests no inline parameters until the user picks some", () => {
    expect(inspection.suggested.params).toEqual([]);
  });

  it("marks seed widgets so they can be re-randomised per run", () => {
    expect(inspection.widgetCandidates.find((c) => c.inputKey === "seed")?.isSeed).toBe(true);
    expect(inspection.widgetCandidates.find((c) => c.inputKey === "steps")?.isSeed).toBe(false);
  });

  it("uses the node title in labels when the author set one", () => {
    expect(inspection.suggested.inputs[0]?.label).toBe("Product");
    expect(inspection.widgetCandidates.find((c) => c.nodeId === "24")?.label).toBe("Prompt · Text");
  });
});

describe("inspectWorkflow with App Mode", () => {
  const inspection = inspectWorkflow(graph(), {
    defaultName: "Curated",
    appMode: {
      inputs: [
        { nodeId: "16", widget: "image" },
        { nodeId: "24", widget: "text" },
        { nodeId: "31", widget: "steps" },
        { nodeId: "31", widget: "seed" },
      ],
      outputNodeIds: ["9"],
    },
  });

  it("follows the author's selection, in their order", () => {
    expect(inspection.hasAppMode).toBe(true);
    expect(inspection.suggested.inputs.map((i) => i.id)).toEqual(["16:image", "24:text"]);
    expect(inspection.suggested.params.map((p) => p.id)).toEqual(["31:steps", "31:seed"]);
  });

  it("splits a loader's upload widget into an input, not a text parameter", () => {
    const image = inspection.suggested.inputs[0];
    expect(image).toMatchObject({ type: "image", nodeId: "16", inputKey: "image", required: true });
    expect(inspection.suggested.params.some((p) => p.nodeId === "16")).toBe(false);
  });

  it("carries widget defaults through to the parameters", () => {
    expect(inspection.suggested.params.find((p) => p.id === "31:steps")).toMatchObject({
      type: "integer",
      default: 20,
    });
  });

  it("flags exactly the widgets the author curated", () => {
    const curated = inspection.widgetCandidates.filter((c) => c.fromAppMode);
    expect(curated.map((c) => `${c.nodeId}.${c.inputKey}`).sort()).toEqual([
      "24.text",
      "31.seed",
      "31.steps",
    ]);
  });

  it("ignores App Mode entries for nodes the conversion dropped", () => {
    const partial = inspectWorkflow(graph(), {
      appMode: { inputs: [{ nodeId: "999", widget: "seed" }], outputNodeIds: ["999"] },
    });
    expect(partial.suggested.params).toEqual([]);
    // With no valid App Mode output, every real sink is bound instead — an app
    // that produced nothing would be useless.
    expect(partial.suggested.outputs.map((o) => o.nodeId)).toEqual(["9"]);
  });
});

describe("a boundary slot the author wired to more than one node", () => {
  it("keeps every binding when the slot becomes a handle", () => {
    // A Blueprint's `STRING` boundary slot is declared connectable, so it lands
    // on a handle rather than in the settings — and a prompt slot feeding two
    // text encoders is still one connection point. Carrying the extra bindings
    // only on parameters silently dropped them here, leaving the second encoder
    // on the workflow's own saved text.
    const inspection = inspectWorkflow(graph(), {
      appMode: {
        inputs: [
          {
            nodeId: "24",
            widget: "text",
            connectAs: "text",
            alsoBind: [{ nodeId: "9", widget: "filename_prefix" }],
          },
        ],
        outputNodeIds: ["9"],
      },
    });

    const prompt = inspection.suggested.inputs.find((i) => i.id === "24:text");
    expect(prompt?.type).toBe("text");
    expect(prompt?.alsoBind).toEqual([{ nodeId: "9", inputKey: "filename_prefix" }]);
  });
});

describe("inspectWorkflow with App Mode and an uncurated loader", () => {
  it("still exposes a media loader App Mode does not mention", () => {
    // A blueprint's boundary inputs are not widgets, so they never appear in a
    // curated list — dropping them would leave the node with no way to be fed.
    const inspection = inspectWorkflow(graph(), {
      appMode: { inputs: [{ nodeId: "31", widget: "steps" }], outputNodeIds: ["9"] },
    });
    const image = inspection.suggested.inputs.find((i) => i.type === "image");
    expect(image).toMatchObject({ nodeId: "16", inputKey: "image" });
    // Optional, since the author did not ask for it — an unconnected handle
    // just runs with whatever the workflow was saved with.
    expect(image?.required).toBe(false);
  });

  it("does not duplicate a loader the author did curate", () => {
    const inspection = inspectWorkflow(graph(), {
      appMode: { inputs: [{ nodeId: "16", widget: "image" }], outputNodeIds: ["9"] },
    });
    expect(inspection.suggested.inputs.filter((i) => i.nodeId === "16")).toHaveLength(1);
    expect(inspection.suggested.inputs[0]?.required).toBe(true);
  });

  it("uses the author's rename over the derived label", () => {
    const inspection = inspectWorkflow(graph(), {
      appMode: {
        inputs: [{ nodeId: "31", widget: "steps", label: "Detail" }],
        outputNodeIds: ["9"],
      },
    });
    expect(inspection.suggested.params[0]?.label).toBe("Detail");
    // The dialog's candidate list must show the same name the node will.
    expect(inspection.widgetCandidates.find((c) => c.inputKey === "steps")?.label).toBe("Detail");
  });
});

describe("inspectWorkflow parameter typing", () => {
  const objectInfo: ComfyObjectInfo = {
    KSampler: {
      input: {
        required: {
          sampler_name: [["euler", "dpmpp_2m"], { tooltip: "Which sampler." }],
          steps: ["INT", { default: 20, min: 1, max: 150 }],
        },
      },
    },
  };

  it("turns a combo widget into a select with its options", () => {
    const withCombo: ComfyGraph = {
      "1": { class_type: "KSampler", inputs: { sampler_name: "euler", steps: 20 } },
      "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } },
    };
    const inspection = inspectWorkflow(withCombo, {
      objectInfo,
      appMode: { inputs: [{ nodeId: "1", widget: "sampler_name" }], outputNodeIds: ["2"] },
    });
    expect(inspection.suggested.params[0]).toMatchObject({
      type: "string",
      enum: ["euler", "dpmpp_2m"],
      default: "euler",
      description: "Which sampler.",
    });
  });

  it("trusts the engine's declared type over the current value's shape", () => {
    const floatAtZero: ComfyGraph = {
      "1": { class_type: "Primitive", inputs: { value: 0 } },
      "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } },
    };
    const inspection = inspectWorkflow(floatAtZero, {
      objectInfo: { Primitive: { input: { required: { value: ["FLOAT", { default: 0.0 }] } } } },
      appMode: { inputs: [{ nodeId: "1", widget: "value" }], outputNodeIds: ["2"] },
    });
    // A FLOAT sitting at 0 serializes as an integer; typing it as one would
    // stop the user entering 0.5.
    expect(inspection.suggested.params[0]?.type).toBe("number");
  });

  it("carries numeric bounds so the node can validate input", () => {
    const withNumber: ComfyGraph = {
      "1": { class_type: "KSampler", inputs: { steps: 20 } },
      "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } },
    };
    const inspection = inspectWorkflow(withNumber, {
      objectInfo,
      appMode: { inputs: [{ nodeId: "1", widget: "steps" }], outputNodeIds: ["2"] },
    });
    expect(inspection.suggested.params[0]).toMatchObject({ minimum: 1, maximum: 150 });
  });
});

describe("inspectWorkflow warnings", () => {
  it("warns when the workflow produces nothing", () => {
    const sinkless: ComfyGraph = { "1": { class_type: "KSampler", inputs: { steps: 20 } } };
    const inspection = inspectWorkflow(sinkless);
    expect(inspection.suggested.outputs).toEqual([]);
    expect(inspection.warnings.join(" ")).toMatch(/no Save or Preview node/);
  });

  it("warns when nothing can be fed in", () => {
    const closed: ComfyGraph = {
      "1": { class_type: "KSampler", inputs: { steps: 20 } },
      "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } },
    };
    expect(inspectWorkflow(closed).warnings.join(" ")).toMatch(/No inputs were detected/);
  });

  it("prefers a Save node over a Preview when both exist", () => {
    const both: ComfyGraph = {
      "1": { class_type: "PreviewImage", inputs: { images: ["3", 0] } },
      "2": { class_type: "SaveImage", inputs: { images: ["3", 0] } },
      "3": { class_type: "KSampler", inputs: { steps: 20 } },
    };
    expect(inspectWorkflow(both).suggested.outputs.map((o) => o.nodeId)).toEqual(["2"]);
  });

  it("falls back to a Preview when it is the only sink", () => {
    const previewOnly: ComfyGraph = {
      "1": { class_type: "PreviewImage", inputs: { images: ["3", 0] } },
      "3": { class_type: "KSampler", inputs: { steps: 20 } },
    };
    expect(inspectWorkflow(previewOnly).suggested.outputs.map((o) => o.nodeId)).toEqual(["1"]);
  });
});

describe("normalizeInputs", () => {
  it("re-derives unique names after the user renames labels", () => {
    const inputs: ComfyAppInput[] = [
      { id: "a", name: "x", label: "Reference", type: "image", nodeId: "1", inputKey: "image", required: true },
      { id: "b", name: "x", label: "Reference", type: "image", nodeId: "2", inputKey: "image", required: true },
    ];
    expect(normalizeInputs(inputs).map((i) => i.name)).toEqual(["reference", "reference_2"]);
  });
});

describe("an App Mode whose entries all failed to resolve", () => {
  it("detects a surface rather than proposing an empty node", () => {
    // App Mode is followed exactly, which is right when it resolves and
    // catastrophic when it does not: a workflow whose entries addressed a
    // subgraph instance arrived with no inputs, no settings, and no hint that
    // anything had been lost. Detection is a poorer answer than the author's,
    // and a far better one than nothing.
    const inspection = inspectWorkflow(graph(), {
      appMode: { inputs: [{ nodeId: "does-not-exist", widget: "prompt" }], outputNodeIds: ["9"] },
    });

    // The prompt is only ever offered by detection: the curated branch adds
    // media loaders regardless, so counting inputs would pass either way.
    expect(inspection.suggested.inputs.map((i) => `${i.nodeId}.${i.inputKey}`)).toContain("24.text");
    // The author's outputs are recorded separately and stay honoured.
    expect(inspection.suggested.outputs.map((o) => o.nodeId)).toEqual(["9"]);
  });

  it("still follows App Mode when even one entry resolves", () => {
    const inspection = inspectWorkflow(graph(), {
      appMode: {
        inputs: [
          { nodeId: "does-not-exist", widget: "prompt" },
          { nodeId: "31", widget: "steps" },
        ],
        outputNodeIds: ["9"],
      },
    });

    // Curated, so the loaders are added but the KSampler's `cfg` — which the
    // author did not expose — stays off the node.
    expect(inspection.suggested.params.map((p) => p.inputKey)).toEqual(["steps"]);
  });
});
