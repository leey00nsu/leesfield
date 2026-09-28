import { describe, it, expect } from "vitest";

import {
  blueprintAppMode,
  blueprintToWorkflowFile,
  ComfyConversionError,
  convertEditorGraph,
  editorNodeTypes,
  extractAppMode,
  extractBlueprints,
  isEditorFormat,
  parseAppModeInputId,
  type EditorWorkflowFile,
} from "../editor";
import type { ComfyObjectInfo } from "../types";

const catalog: ComfyObjectInfo = {
  LoadImage: { input: { required: { image: [["a.png"], { image_upload: true }] } } },
  CLIPTextEncode: {
    input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] } },
  },
  KSampler: {
    input: {
      required: {
        seed: ["INT", { default: 0, control_after_generate: true }],
        steps: ["INT", { default: 20 }],
        model: ["MODEL", {}],
      },
    },
  },
  SaveImage: { input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } } },
  ImageCompare: {
    input: { required: { image: ["IMAGE", {}], compare_view: [["side", "slider"], {}] } },
  },
};

describe("isEditorFormat", () => {
  it("distinguishes a save file from an API export", () => {
    expect(isEditorFormat({ nodes: [], links: [] })).toBe(true);
    expect(isEditorFormat({ "1": { class_type: "LoadImage", inputs: {} } })).toBe(false);
  });
});

describe("convertEditorGraph", () => {
  it("maps positional widget values onto named inputs", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        { id: 1, type: "LoadImage", widgets_values: ["cat.png", "image"] },
        { id: 2, type: "CLIPTextEncode", widgets_values: ["a dog"], inputs: [] },
      ],
      links: [],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["1"]?.inputs.image).toBe("cat.png");
    expect(graph["2"]?.inputs.text).toBe("a dog");
  });

  it("skips the control value a seed widget serialises alongside itself", () => {
    const file: EditorWorkflowFile = {
      nodes: [{ id: 3, type: "KSampler", widgets_values: [12345, "randomize", 30], inputs: [] }],
      links: [],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["3"]?.inputs.seed).toBe(12345);
    // Without skipping "randomize", steps would read as a string.
    expect(graph["3"]?.inputs.steps).toBe(30);
  });

  it("fills a required widget the save omitted with the engine's default", () => {
    const file: EditorWorkflowFile = {
      nodes: [{ id: 1, type: "ImageCompare", widgets_values: [], inputs: [] }],
      links: [],
    };
    const graph = convertEditorGraph(file, catalog);
    // The frontend always sends a widget value, so the engine expects one.
    expect(graph["1"]?.inputs.compare_view).toBe("side");
  });

  it("restores connections as [nodeId, slot] links", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        { id: 1, type: "KSampler", widgets_values: [1, "fixed", 20], inputs: [], outputs: [{ type: "IMAGE" }] },
        {
          id: 2,
          type: "SaveImage",
          widgets_values: ["out"],
          inputs: [{ name: "images", type: "IMAGE", link: 7 }],
        },
      ],
      links: [[7, 1, 0, 2, 0, "IMAGE"]],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["2"]?.inputs.images).toEqual(["1", 0]);
  });

  it("drops muted nodes and the links into them", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        { id: 1, type: "KSampler", mode: 2, widgets_values: [1, "fixed", 20], outputs: [{ type: "IMAGE" }] },
        {
          id: 2,
          type: "SaveImage",
          widgets_values: ["out"],
          inputs: [{ name: "images", type: "IMAGE", link: 7 }],
        },
      ],
      links: [[7, 1, 0, 2, 0, "IMAGE"]],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["1"]).toBeUndefined();
    expect(graph["2"]?.inputs.images).toBeUndefined();
  });

  it("routes through a bypassed node to its upstream source", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        { id: 1, type: "LoadImage", widgets_values: ["cat.png", "image"], outputs: [{ type: "IMAGE" }] },
        {
          id: 2,
          type: "ImageCompare",
          mode: 4,
          inputs: [{ name: "image", type: "IMAGE", link: 1 }],
          outputs: [{ type: "IMAGE" }],
        },
        {
          id: 3,
          type: "SaveImage",
          widgets_values: ["out"],
          inputs: [{ name: "images", type: "IMAGE", link: 2 }],
        },
      ],
      links: [
        [1, 1, 0, 2, 0, "IMAGE"],
        [2, 2, 0, 3, 0, "IMAGE"],
      ],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["2"]).toBeUndefined();
    expect(graph["3"]?.inputs.images).toEqual(["1", 0]);
  });

  it("follows a Reroute through to the real origin", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        { id: 1, type: "LoadImage", widgets_values: ["cat.png", "image"], outputs: [{ type: "IMAGE" }] },
        {
          id: 2,
          type: "Reroute",
          inputs: [{ name: "", type: "*", link: 1 }],
          outputs: [{ type: "IMAGE" }],
        },
        {
          id: 3,
          type: "SaveImage",
          widgets_values: ["out"],
          inputs: [{ name: "images", type: "IMAGE", link: 2 }],
        },
      ],
      links: [
        [1, 1, 0, 2, 0, "IMAGE"],
        [2, 2, 0, 3, 0, "IMAGE"],
      ],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["2"]).toBeUndefined();
    expect(graph["3"]?.inputs.images).toEqual(["1", 0]);
  });

  it("expands a subgraph instance with namespaced inner ids", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        {
          id: 50,
          type: "sub-uuid",
          inputs: [],
          outputs: [{ type: "IMAGE" }],
        },
      ],
      links: [],
      definitions: {
        subgraphs: [
          {
            id: "sub-uuid",
            name: "Inner",
            nodes: [{ id: 7, type: "LoadImage", widgets_values: ["inner.png", "image"] }],
            links: [],
            inputs: [],
            outputs: [{ name: "IMAGE", type: "IMAGE", linkIds: [] }],
          },
        ],
      },
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["50:7"]?.class_type).toBe("LoadImage");
    expect(graph["50:7"]?.inputs.image).toBe("inner.png");
  });

  it("names every node the catalog is missing rather than the first one", () => {
    const file: EditorWorkflowFile = {
      nodes: [
        { id: 1, type: "SomeCustomNode", widgets_values: [1] },
        { id: 2, type: "AnotherCustomNode", widgets_values: [2] },
      ],
      links: [],
    };
    expect(editorNodeTypes(file)).toEqual(["AnotherCustomNode", "SomeCustomNode"]);
    expect(() => convertEditorGraph(file, catalog)).toThrow(ComfyConversionError);
  });

  it("maps a CustomCombo's full option list, past what the schema declares", () => {
    const file: EditorWorkflowFile = {
      nodes: [{ id: 1, type: "CustomCombo", widgets_values: ["b", 1, "a", "b", "c", "  "] }],
      links: [],
    };
    const graph = convertEditorGraph(file, catalog);
    expect(graph["1"]?.inputs).toMatchObject({
      choice: "b",
      index: 1,
      option1: "a",
      option2: "b",
      option3: "c",
    });
    // The trailing blank the editor leaves to grow into is not an option.
    expect(graph["1"]?.inputs.option4).toBeUndefined();
  });

  it("rejects a workflow with nothing executable in it", () => {
    expect(() =>
      convertEditorGraph({ nodes: [{ id: 1, type: "Note", widgets_values: ["hi"] }], links: [] }, catalog)
    ).toThrow(ComfyConversionError);
  });
});

describe("parseAppModeInputId", () => {
  it("accepts a bare node id", () => {
    expect(parseAppModeInputId("3")).toEqual({ nodeId: "3" });
    expect(parseAppModeInputId(3)).toEqual({ nodeId: "3" });
  });

  it("decodes a WidgetId triple into its node and widget", () => {
    expect(parseAppModeInputId("graph-uuid:12:steps")).toEqual({ nodeId: "12", widget: "steps" });
    expect(parseAppModeInputId("g:12:model.aspect%5Fratio")).toEqual({
      nodeId: "12",
      widget: "model.aspect_ratio",
    });
  });

  it("keeps a legacy pair intact — it is already the namespaced form", () => {
    expect(parseAppModeInputId("50:7")).toEqual({ nodeId: "50:7" });
  });

  it("rejects junk", () => {
    expect(parseAppModeInputId("")).toBeNull();
    expect(parseAppModeInputId(null)).toBeNull();
  });
});

describe("extractAppMode", () => {
  const base = (extra: EditorWorkflowFile["extra"]): EditorWorkflowFile => ({
    nodes: [
      { id: 3, type: "KSampler" },
      { id: 9, type: "SaveImage" },
      { id: 16, type: "LoadImage" },
    ],
    links: [],
    extra,
  });

  it("reads a modern export that omits the linearMode flag", () => {
    const result = extractAppMode(
      base({ linearData: { inputs: [["3", "seed"], ["3", "steps"]], outputs: ["9"] } })
    );
    expect(result).toEqual({
      inputs: [
        { nodeId: "3", widget: "seed" },
        { nodeId: "3", widget: "steps" },
      ],
      outputNodeIds: ["9"],
    });
  });

  it("honours an explicit linearMode: false", () => {
    expect(
      extractAppMode(base({ linearMode: false, linearData: { inputs: [["3", "seed"]], outputs: ["9"] } }))
    ).toBeNull();
  });

  it("keeps every output node, not just the first", () => {
    const result = extractAppMode(
      base({ linearData: { inputs: [["16", "image"]], outputs: ["9", "16", "3"] } })
    );
    expect(result?.outputNodeIds).toEqual(["9", "16", "3"]);
  });

  it("drops entries pointing at nodes that no longer exist", () => {
    const result = extractAppMode(
      base({ linearData: { inputs: [["3", "seed"], ["99", "seed"]], outputs: ["9", "404"] } })
    );
    expect(result?.inputs).toEqual([{ nodeId: "3", widget: "seed" }]);
    expect(result?.outputNodeIds).toEqual(["9"]);
  });

  it("tolerates the optional third layout element", () => {
    const result = extractAppMode(
      base({ linearData: { inputs: [["3", "seed", { height: 98 }]], outputs: [] } })
    );
    expect(result?.inputs).toEqual([{ nodeId: "3", widget: "seed" }]);
  });

  it("resolves a WidgetId against the namespaced ids conversion produced", () => {
    const file: EditorWorkflowFile = {
      nodes: [{ id: 50, type: "sub-uuid" }],
      links: [],
      extra: { linearData: { inputs: [["sub-uuid:7:image", "image"]], outputs: ["8"] } },
    };
    const result = extractAppMode(file, ["50:7", "50:8"]);
    expect(result?.inputs).toEqual([{ nodeId: "50:7", widget: "image" }]);
    expect(result?.outputNodeIds).toEqual(["50:8"]);
  });

  it("drops an ambiguous namespaced match rather than binding the wrong node", () => {
    const file: EditorWorkflowFile = {
      nodes: [{ id: 50, type: "sub-uuid" }],
      links: [],
      extra: { linearData: { inputs: [["g:5:seed", "seed"]], outputs: ["8"] } },
    };
    // Bare id "5" suffix-matches both "140:5" and "77:5" — binding it to either
    // would silently apply the author's selection to the wrong node, so it is
    // dropped. The unambiguous output still resolves.
    const ambiguous = extractAppMode(file, ["140:5", "77:5", "140:8"]);
    expect(ambiguous?.inputs).toEqual([]);
    expect(ambiguous?.outputNodeIds).toEqual(["140:8"]);
    // With only one candidate it resolves.
    expect(extractAppMode(file, ["140:5", "140:8"])?.inputs).toEqual([
      { nodeId: "140:5", widget: "seed" },
    ]);
  });

  it("de-duplicates repeated selections", () => {
    const result = extractAppMode(
      base({ linearData: { inputs: [["3", "seed"], ["3", "seed"]], outputs: ["9", "9"] } })
    );
    expect(result?.inputs).toHaveLength(1);
    expect(result?.outputNodeIds).toEqual(["9"]);
  });

  it("returns null when nothing survives", () => {
    expect(extractAppMode(base({ linearData: { inputs: [], outputs: [] } }))).toBeNull();
    expect(extractAppMode(base({}))).toBeNull();
  });
});

describe("blueprints", () => {
  const blueprintFile = (): EditorWorkflowFile => ({
    nodes: [
      {
        id: 135,
        type: "3b5ed000",
        title: "Crop Images 2x2",
        inputs: [{ name: "image", type: "IMAGE", link: null }],
        outputs: [{ name: "IMAGE", type: "IMAGE" }],
        widgets_values: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ properties: { proxyWidgets: [["45", "text"], ["31", "seed"], ["31", "control_after_generate"]] } } as any),
      },
    ],
    links: [],
    definitions: {
      subgraphs: [
        {
          id: "3b5ed000",
          name: "Crop Images 2x2",
          nodes: [
            { id: 45, type: "CLIPTextEncode", widgets_values: ["a cat"], inputs: [] },
            { id: 31, type: "KSampler", widgets_values: [1, "fixed", 20], inputs: [] },
          ],
          links: [],
          inputs: [{ name: "image", type: "IMAGE", linkIds: [] }],
          outputs: [
            { name: "IMAGE", type: "IMAGE", linkIds: [] },
            { name: "LATENT", type: "LATENT", linkIds: [] },
          ],
        },
      ],
    },
    extra: { BlueprintDescription: "Splits an image into four." } as EditorWorkflowFile["extra"],
  });

  it("summarises each subgraph's boundary slots", () => {
    const [blueprint] = extractBlueprints(blueprintFile());
    expect(blueprint).toMatchObject({
      id: "3b5ed000",
      name: "Crop Images 2x2",
      description: "Splits an image into four.",
      inputNames: ["image"],
      outputNames: ["IMAGE", "LATENT"],
      nodeCount: 2,
      source: "workflow",
    });
  });

  it("appends a sink per displayable boundary output", () => {
    const { workflow, instanceNodeId, skippedOutputs } = blueprintToWorkflowFile(
      blueprintFile(),
      "3b5ed000"
    );
    expect(instanceNodeId).toBe("135");
    // A blueprint's results leave through slots, not a SaveImage — without an
    // appended sink the run would persist nothing.
    expect(workflow.nodes.filter((n) => n.type === "SaveImage")).toHaveLength(1);
    // LATENT has nothing a node could display.
    expect(skippedOutputs).toEqual(["LATENT (LATENT)"]);
  });

  it("materialises a loader for each media boundary input", () => {
    const { workflow } = blueprintToWorkflowFile(blueprintFile(), "3b5ed000");
    const loader = workflow.nodes.find((n) => n.type === "LoadImage");
    // A blueprint takes its image through a boundary *slot*, so without a
    // materialised loader it would inspect as having no inputs at all.
    expect(loader).toBeDefined();
    // The instance's socket must now point at that loader's link.
    const instance = workflow.nodes.find((n) => String(n.id) === "135");
    const socket = instance?.inputs?.find((i) => i.name === "image");
    expect(socket?.link).toEqual(expect.any(Number));
    expect(workflow.links?.some((l) => Array.isArray(l) && l[0] === socket?.link)).toBe(true);
  });

  it("materialises a loader for a boundary slot that accepts more than one type", () => {
    const file = blueprintFile();
    // How ComfyUI writes a slot that takes either — an image-to-video
    // blueprint's frame is `IMAGE,MASK`. Matching the union as one string finds
    // nothing, which cost those blueprints the only input they exist for.
    file.definitions!.subgraphs![0]!.inputs = [
      { name: "input", type: "IMAGE,MASK", linkIds: [] },
    ];
    file.nodes[0]!.inputs = [{ name: "input", type: "IMAGE,MASK", link: null }];

    const { workflow, unsupportedInputs } = blueprintToWorkflowFile(file, "3b5ed000");
    expect(unsupportedInputs).toEqual([]);
    const loader = workflow.nodes.find((n) => n.type === "LoadImage");
    expect(loader).toBeDefined();
    // The link and the loader's output carry the resolved member, not the union,
    // so downstream slot matching sees a real type.
    expect(loader?.outputs?.[0]?.type).toBe("IMAGE");
    const socket = workflow.nodes.find((n) => String(n.id) === "135")?.inputs?.[0];
    expect(socket?.link).toEqual(expect.any(Number));
  });

  it("takes the first supplyable member of a union, in declared order", () => {
    const file = blueprintFile();
    file.definitions!.subgraphs![0]!.inputs = [
      { name: "input", type: "LATENT,MASK", linkIds: [] },
    ];
    file.nodes[0]!.inputs = [{ name: "input", type: "LATENT,MASK", link: null }];

    const { workflow } = blueprintToWorkflowFile(file, "3b5ed000");
    // LATENT has no loader, so the MASK alternative is what gets built — as a
    // LoadImage feeding an ImageToMask, not a LoadImageMask.
    expect(workflow.nodes.some((n) => n.type === "LoadImage")).toBe(true);
    expect(workflow.nodes.some((n) => n.type === "ImageToMask")).toBe(true);
  });

  it("loads a mask as an image and converts it, never as LoadImageMask", () => {
    // Comfy Cloud stages uploads only for the loader classes its asset layer
    // knows. LoadImageMask is not one, so it rejected every mask we uploaded
    // with "Invalid image file" before a single step ran.
    const file = blueprintFile();
    file.definitions!.subgraphs![0]!.inputs = [{ name: "mask", type: "MASK", linkIds: [] }];
    file.nodes[0]!.inputs = [{ name: "mask", type: "MASK", link: null }];

    const { workflow, unsupportedInputs } = blueprintToWorkflowFile(file, "3b5ed000");
    expect(unsupportedInputs).toEqual([]);
    expect(workflow.nodes.some((n) => n.type === "LoadImageMask")).toBe(false);

    const loader = workflow.nodes.find((n) => n.type === "LoadImage");
    const adapter = workflow.nodes.find((n) => n.type === "ImageToMask");
    expect(loader).toBeDefined();
    expect(adapter?.widgets_values).toEqual(["red"]);
    // The chain must be loader → adapter → boundary. The adapter reads the
    // loader's link; the instance socket reads the adapter's — swapping them
    // would hand the instance an image where it expects a mask.
    const socketLink = workflow.nodes.find((n) => String(n.id) === "135")?.inputs?.[0]?.link;
    expect(adapter?.inputs?.[0]?.link).toBe(loader && findLinkBetween(workflow, loader, adapter!));
    expect(socketLink).toBe(findLinkBetween(workflow, adapter!, { id: 135 }));
    expect(socketLink).not.toBe(adapter?.inputs?.[0]?.link);
  });

  it("still reports a union no member of which can be supplied", () => {
    const file = blueprintFile();
    file.definitions!.subgraphs![0]!.inputs = [
      { name: "guide", type: "LATENT,CONDITIONING", linkIds: [] },
    ];
    file.nodes[0]!.inputs = [{ name: "guide", type: "LATENT,CONDITIONING", link: null }];

    const { workflow, unsupportedInputs } = blueprintToWorkflowFile(file, "3b5ed000");
    expect(unsupportedInputs).toEqual(["guide (LATENT,CONDITIONING)"]);
    expect(workflow.nodes.some((n) => n.type.startsWith("Load"))).toBe(false);
  });

  it("appends a sink for a union-typed boundary output", () => {
    const file = blueprintFile();
    file.definitions!.subgraphs![0]!.outputs = [
      { name: "out", type: "IMAGE,MASK", linkIds: [] },
    ];
    const { workflow, skippedOutputs } = blueprintToWorkflowFile(file, "3b5ed000");
    expect(skippedOutputs).toEqual([]);
    expect(workflow.nodes.some((n) => n.type === "SaveImage")).toBe(true);
  });

  /**
   * The id of the link running from `from` to `to`.
   *
   * Editor links are positional tuples `[id, originId, originSlot, targetId,
   * targetSlot, type]`, so they are read by index rather than by name.
   */
  const findLinkBetween = (
    workflow: { links?: unknown[] },
    from: { id: string | number },
    to: { id: string | number }
  ): unknown => {
    const links = (workflow.links ?? []) as unknown[][];
    const hit = links.find(
      (l) => String(l[1]) === String(from.id) && String(l[3]) === String(to.id)
    );
    return hit?.[0];
  };

  /** Point the blueprint's single output at `type` and lift it. */
  const liftWithOutput = (type: string) => {
    const file = blueprintFile();
    file.definitions!.subgraphs![0]!.outputs = [{ name: "out", type, linkIds: [] }];
    return blueprintToWorkflowFile(file, "3b5ed000");
  };

  it("gives a video sink every widget the engine demands", () => {
    // SaveVideo requires filename_prefix, format AND codec. codec is a
    // COMFY_DYNAMICCOMBO_V3 with no declared default, so leaving it off did not
    // fall back to anything — it vanished from the submitted graph, and every
    // video blueprint died on "SaveVideo.execute() missing 1 required
    // positional argument: 'codec'" after the render had already been paid for.
    const { workflow } = liftWithOutput("VIDEO");
    const sink = workflow.nodes.find((n) => n.type === "SaveVideo");
    expect(sink?.widgets_values).toEqual(["node-banana", "auto", "auto"]);
  });

  it("writes text to a file rather than previewing it", () => {
    // PreviewAny renders in ComfyUI's own web client and writes nothing, so a
    // captioning blueprint ran to success and then reported no output at all.
    const { workflow } = liftWithOutput("STRING");
    expect(workflow.nodes.some((n) => n.type === "PreviewAny")).toBe(false);
    const sink = workflow.nodes.find((n) => n.type === "SaveText");
    expect(sink?.widgets_values).toEqual(["node-banana", "txt"]);
  });

  it("saves a mesh boundary output", () => {
    const { workflow, skippedOutputs } = liftWithOutput("MESH");
    expect(skippedOutputs).toEqual([]);
    expect(workflow.nodes.some((n) => n.type === "SaveGLB")).toBe(true);
  });

  it("routes a mask through an adapter, because no sink takes one directly", () => {
    const { workflow, skippedOutputs } = liftWithOutput("MASK");
    expect(skippedOutputs).toEqual([]);
    const adapter = workflow.nodes.find((n) => n.type === "MaskToImage");
    const sink = workflow.nodes.find((n) => n.type === "SaveImage");
    expect(adapter).toBeDefined();
    expect(sink).toBeDefined();
    // The chain must be slot -> adapter -> sink: the sink reads the adapter's
    // link, not the boundary's, or the mask would reach SaveImage unconverted.
    const adapterOutLink = findLinkBetween(workflow, adapter!, sink!);
    expect(adapterOutLink).toBeDefined();
    expect(sink!.inputs?.[0]?.link).toBe(adapterOutLink);
    expect(adapter!.inputs?.[0]?.link).not.toBe(sink!.inputs?.[0]?.link);
  });

  it("serialises a gaussian splat to a file before saving it", () => {
    const { workflow, skippedOutputs } = liftWithOutput("SPLAT");
    expect(skippedOutputs).toEqual([]);
    expect(workflow.nodes.find((n) => n.type === "SplatToFile3D")?.widgets_values).toEqual(["ply"]);
    expect(workflow.nodes.some((n) => n.type === "SaveGLB")).toBe(true);
  });

  it("leaves the caller's file untouched so a second blueprint still converts", () => {
    const file = blueprintFile();
    blueprintToWorkflowFile(file, "3b5ed000");
    // The instance's sockets are rewritten during lifting — on a copy, not the
    // source, which the caller may inspect again.
    expect(file.nodes[0]?.inputs?.[0]?.link).toBeNull();
  });

  it("carries the author's widget rename so proxied widgets stay distinguishable", () => {
    const file = blueprintFile();
    // Two PrimitiveFloat.value widgets would otherwise share a label.
    file.definitions!.subgraphs![0]!.nodes[0]!.inputs = [
      { name: "text", type: "STRING", label: "prompt", widget: { name: "text" } },
    ];
    const appMode = blueprintAppMode(file, "3b5ed000", "135");
    expect(appMode?.inputs[0]).toEqual({ nodeId: "135:45", widget: "text", label: "prompt" });
  });

  it("ignores a label that merely repeats the widget name", () => {
    const file = blueprintFile();
    // ComfyUI writes `label` defaulted to the input's own name. Four proxied
    // `CurveEditor.curve` widgets would then all read "curve", hiding the node
    // titles (RGB Master, Red, Green, Blue) that actually tell them apart.
    file.definitions!.subgraphs![0]!.nodes[0]!.inputs = [
      { name: "text", type: "STRING", label: "Text", widget: { name: "text" } },
    ];
    const appMode = blueprintAppMode(file, "3b5ed000", "135");
    expect(appMode?.inputs[0]).toEqual({ nodeId: "135:45", widget: "text" });
  });

  it("treats proxied widgets as the author's curated parameters", () => {
    const appMode = blueprintAppMode(blueprintFile(), "3b5ed000", "135");
    expect(appMode?.inputs).toEqual([
      { nodeId: "135:45", widget: "text" },
      { nodeId: "135:31", widget: "seed" },
    ]);
    // `control_after_generate` is a frontend affordance, not an engine input.
    expect(appMode?.inputs.some((i) => i.widget === "control_after_generate")).toBe(false);
  });

  /**
   * A blueprint whose author promoted widgets onto the boundary itself.
   * `-1` addresses the subgraph's own input slot rather than an inner node.
   */
  const boundaryPromotedFile = (): EditorWorkflowFile => {
    const file = blueprintFile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file.nodes[0] as any).properties = {
      proxyWidgets: [
        ["-1", "prompt"],
        ["-1", "ckpt_name"],
        ["-1", "image"],
      ],
    };
    const def = file.definitions!.subgraphs![0]!;
    def.inputs = [
      { name: "prompt", type: "STRING", linkIds: [900] },
      // One slot feeding two loaders — the author's single choice.
      { name: "ckpt_name", type: "COMBO", linkIds: [901, 902] },
      // Media slots become real loader nodes, never widgets.
      { name: "image", type: "IMAGE", linkIds: [903] },
    ];
    def.nodes = [
      { id: 45, type: "CLIPTextEncode", widgets_values: ["a cat"], inputs: [{ name: "text" }] },
      { id: 31, type: "CheckpointLoaderSimple", widgets_values: [], inputs: [{ name: "ckpt_name" }] },
      { id: 32, type: "VAELoader", widgets_values: [], inputs: [{ name: "vae_name" }] },
      { id: 33, type: "PreviewImage", widgets_values: [], inputs: [{ name: "images" }] },
    ];
    def.links = [
      [900, -1, 0, 45, 0, "STRING"],
      [901, -1, 1, 31, 0, "COMBO"],
      [902, -1, 1, 32, 0, "COMBO"],
      [903, -1, 2, 33, 0, "IMAGE"],
    ];
    return file;
  };

  it("resolves a widget the author promoted onto the blueprint's own boundary", () => {
    // `-1` means the subgraph's input slot, not a node. Namespacing it blindly
    // produced `135:-1`, which matches nothing, so inspection dropped it in
    // silence — a text-to-video app arrived with no prompt, width or length.
    const appMode = blueprintAppMode(boundaryPromotedFile(), "3b5ed000", "135");
    expect(appMode?.inputs.find((i) => i.widget === "text")).toEqual({
      nodeId: "135:45",
      widget: "text",
      // The slot's own name, which the author chose and which is unique across
      // the boundary — unlike the derived "CLIPTextEncode · Text".
      label: "prompt",
      // A STRING boundary slot is the author saying "feed this from outside",
      // so it becomes a handle rather than only a text box.
      connectAs: "text",
    });
  });

  it("makes a string boundary input connectable even when proxied from an inner node", () => {
    // The author can promote a widget either way. Proxying the inner node
    // directly left us blind to the fact that it was a declared *input*: a
    // blueprint whose whole job is picking a line out of an incoming list
    // offered no way to receive that list, only a box to paste it into.
    const file = blueprintFile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file.nodes[0] as any).properties = { proxyWidgets: [["45", "text"]] };
    const def = file.definitions!.subgraphs![0]!;
    def.inputs = [{ name: "text_per_line", type: "STRING", linkIds: [900] }];
    def.nodes = [{ id: 45, type: "RegexExtract", widgets_values: [""], inputs: [{ name: "text" }] }];
    def.links = [[900, -1, 0, 45, 0, "STRING"]];

    const appMode = blueprintAppMode(file, "3b5ed000", "135");
    expect(appMode?.inputs[0]).toEqual({
      nodeId: "135:45",
      widget: "text",
      label: "text_per_line",
      connectAs: "text",
    });
  });

  it("keeps one boundary slot that drives several loaders as one control", () => {
    const appMode = blueprintAppMode(boundaryPromotedFile(), "3b5ed000", "135");
    const ckpt = appMode?.inputs.find((i) => i.label === "ckpt_name");
    expect(ckpt).toMatchObject({ nodeId: "135:31", widget: "ckpt_name" });
    // Exposing only the first would let the user change the checkpoint and
    // leave its VAE pointing at the old one.
    expect(ckpt?.alsoBind).toEqual([{ nodeId: "135:32", widget: "vae_name" }]);
  });

  it("leaves a media boundary slot to its materialised loader", () => {
    // An IMAGE slot becomes a LoadImage node; binding it here as a widget too
    // would either miss the upload or duplicate the input handle.
    const appMode = blueprintAppMode(boundaryPromotedFile(), "3b5ed000", "135");
    expect(appMode?.inputs.some((i) => i.widget === "images")).toBe(false);
  });

  it("reports a boundary input it cannot supply instead of building a broken app", () => {
    const file = blueprintFile();
    file.definitions!.subgraphs![0]!.inputs = [
      { name: "image", type: "IMAGE", linkIds: [] },
      { name: "model", type: "MODEL", linkIds: [] },
    ];
    file.nodes[0]!.inputs = [
      { name: "image", type: "IMAGE", link: null },
      { name: "model", type: "MODEL", link: null },
    ];
    const { unsupportedInputs } = blueprintToWorkflowFile(file, "3b5ed000");
    // A MODEL slot has no loader and is not a widget, so the inner node would
    // be missing a required input the engine rejects.
    expect(unsupportedInputs).toEqual(["model (MODEL)"]);
  });

  it("reports a blueprint id that is not in the file", () => {
    expect(() => blueprintToWorkflowFile(blueprintFile(), "nope")).toThrow(ComfyConversionError);
  });
});

/* ── a workflow containing a subgraph whose widgets were promoted ── */

/**
 * The shape ComfyUI saves for a subgraph node with promoted widgets.
 *
 * Two things about it are easy to get wrong, and both were:
 *
 * - The instance's `widgets_values` line up against the *definition's* widget
 *   boundary slots, not against the instance's own `inputs`. An instance only
 *   materialises the slots the author wired or touched, so `inputs` is shorter
 *   and in a different order.
 * - App Mode addresses a promoted widget by the *instance* node, which does not
 *   survive conversion — the subgraph is expanded into `instance:inner` ids.
 */
const SUBGRAPH_ID = "sub-abc";

const promotedCatalog: ComfyObjectInfo = {
  Sampler: {
    input: {
      required: {
        prompt: ["STRING", { multiline: true }],
        width: ["INT", { default: 512 }],
        height: ["INT", { default: 512 }],
      },
    },
  },
  PrimitiveFloat: { input: { required: { value: ["FLOAT", { default: 1 }] } } },
  VAELoader: { input: { required: { vae_name: [["a.safetensors"], {}] } } },
  SaveImage: { input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } } },
};

const promotedFile = (): EditorWorkflowFile =>
  JSON.parse(
    JSON.stringify({
      nodes: [
        {
          id: 105,
          type: SUBGRAPH_ID,
          // Only the slots the author touched: three of the five, out of order.
          inputs: [
            { name: "first_frame", type: "IMAGE", link: null },
            { name: "width", type: "INT", widget: { name: "width" }, link: null },
            { name: "duration", type: "FLOAT", widget: { name: "duration" }, link: null },
          ],
          outputs: [{ name: "IMAGE", type: "IMAGE", links: [90] }],
          widgets_values: ["a red car", 1344, 768, 5, "audio.safetensors"],
        },
        {
          id: 92,
          type: "SaveImage",
          inputs: [{ name: "images", type: "IMAGE", link: 90 }],
          widgets_values: ["ComfyUI"],
        },
      ],
      links: [{ id: 90, origin_id: 105, origin_slot: 0, target_id: 92, target_slot: 0 }],
      extra: {
        linearData: {
          inputs: [
            ["root:105:prompt", "prompt"],
            ["root:105:duration", "duration"],
          ],
          outputs: ["92"],
        },
      },
      definitions: {
        subgraphs: [
          {
            id: SUBGRAPH_ID,
            name: "Inner",
            // `first_frame` is fed into a socket, so it carries no widget value
            // and must not consume one of the positional slots.
            inputs: [
              { name: "first_frame", type: "IMAGE", linkIds: [] },
              { name: "prompt", type: "STRING", linkIds: [11] },
              { name: "width", type: "INT", linkIds: [12] },
              { name: "height", type: "INT", linkIds: [13] },
              { name: "duration", type: "FLOAT", label: "clip length", linkIds: [14] },
              { name: "vae_name", type: "COMBO", linkIds: [15] },
            ],
            outputs: [{ name: "IMAGE", type: "IMAGE", linkIds: [16] }],
            nodes: [
              {
                id: 1,
                type: "Sampler",
                inputs: [
                  { name: "prompt", type: "STRING", widget: { name: "prompt" }, link: 11 },
                  { name: "width", type: "INT", widget: { name: "width" }, link: 12 },
                  { name: "height", type: "INT", widget: { name: "height" }, link: 13 },
                ],
                outputs: [{ name: "IMAGE", type: "IMAGE", links: [16] }],
                widgets_values: ["saved prompt", 512, 512],
              },
              {
                id: 2,
                type: "PrimitiveFloat",
                inputs: [{ name: "value", type: "FLOAT", widget: { name: "value" }, link: 14 }],
                outputs: [{ name: "FLOAT", type: "FLOAT", links: [] }],
                widgets_values: [1],
              },
              {
                id: 3,
                type: "VAELoader",
                inputs: [
                  { name: "vae_name", type: "COMBO", widget: { name: "vae_name" }, link: 15 },
                ],
                outputs: [{ name: "VAE", type: "VAE", links: [] }],
                widgets_values: ["old.safetensors"],
              },
            ],
            links: [
              { id: 11, origin_id: -10, origin_slot: 1, target_id: 1, target_slot: 0 },
              { id: 12, origin_id: -10, origin_slot: 2, target_id: 1, target_slot: 1 },
              { id: 13, origin_id: -10, origin_slot: 3, target_id: 1, target_slot: 2 },
              { id: 14, origin_id: -10, origin_slot: 4, target_id: 2, target_slot: 0 },
              { id: 15, origin_id: -10, origin_slot: 5, target_id: 3, target_slot: 0 },
            ],
          },
        ],
      },
    })
  ) as EditorWorkflowFile;

describe("a subgraph instance's promoted widget values", () => {
  it("lines them up against the definition's slots, not the instance's inputs", () => {
    // Zipping against the instance's three materialised inputs put the prompt
    // string into `width`, `1344` into `duration`, and a VAE filename slot got
    // the number 5. Every value here belongs to a different slot under the two
    // orderings, so a regression cannot pass by coincidence.
    const graph = convertEditorGraph(promotedFile(), promotedCatalog);

    expect(graph["105:1"]?.inputs.prompt).toBe("a red car");
    expect(graph["105:1"]?.inputs.width).toBe(1344);
    expect(graph["105:1"]?.inputs.height).toBe(768);
    expect(graph["105:2"]?.inputs.value).toBe(5);
    expect(graph["105:3"]?.inputs.vae_name).toBe("audio.safetensors");
  });

  it("does not spend a value on a slot that is fed by a link", () => {
    // `first_frame` reaches a socket, so it carries no widget value. Counting
    // it would shift every value after it by one.
    const graph = convertEditorGraph(promotedFile(), promotedCatalog);
    expect(graph["105:1"]?.inputs.prompt).not.toBe(1344);
  });
});

describe("App Mode entries that name a subgraph instance", () => {
  it("resolves them to the inner input the boundary slot drives", () => {
    // The author sees one control on the subgraph node; conversion expands that
    // node away, so the id matched nothing and the control was dropped in
    // silence — a workflow arrived with no inputs and no settings at all.
    const file = promotedFile();
    const graph = convertEditorGraph(file, promotedCatalog);
    const appMode = extractAppMode(file, Object.keys(graph));

    expect(appMode?.inputs).toEqual([
      { nodeId: "105:1", widget: "prompt", label: "prompt", connectAs: "text" },
      { nodeId: "105:2", widget: "value", label: "clip length" },
    ]);
  });

  it("prefers the author's own name for the slot", () => {
    // "clip length" is what they renamed it to; "PrimitiveFloat · Value" is
    // what the inner node would have been called.
    const file = promotedFile();
    const graph = convertEditorGraph(file, promotedCatalog);
    expect(extractAppMode(file, Object.keys(graph))?.inputs[1]?.label).toBe("clip length");
  });

  it("still resolves an entry that names a real node", () => {
    const file = promotedFile();
    file.extra!.linearData!.inputs = [["root:92:filename_prefix", "filename_prefix"]];
    const graph = convertEditorGraph(file, promotedCatalog);
    expect(extractAppMode(file, Object.keys(graph))?.inputs).toEqual([
      { nodeId: "92", widget: "filename_prefix" },
    ]);
  });
});
