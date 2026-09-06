import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getPresetTemplate } from "../../../../.generated/node-banana-runtime/src/lib/quickstart/templates";
import { quickstartSpaceTemplate } from "./quickstart-space-template";
import { graphDocumentV3Schema } from "@/shared/generation-graph/canonical-graph";

import {
  canonicalNodeKinds,
  canonicalNodeRegistry,
  findNodeDefinition,
  validateNodeConfig,
} from "@/shared/generation-graph/node-registry";
import {
  canonicalDocumentToRuntimeGraph,
  defaultConfigForKind,
  runtimeGraphToCanonicalDocument,
} from "../runtime/node-banana/node-banana-runtime-adapter";

import {
  getNodeBananaPortLabel,
  nodeBananaHostedHeaderContract,
  nodeBananaNodeGeometry,
  nodeBananaNodeInventory,
  nodeBananaUpstreamContract,
  nodeBananaUpstreamHeaderContract,
} from "./node-banana-node-inventory";

describe("Node Banana approved Node inventory", () => {
  it("converts all six upstream presets to valid independent empty/minimal Spaces", () => {
    for (const id of ["product-shot", "model-product", "color-variations", "background-swap", "style-transfer", "scene-composite"]) {
      for (const level of ["empty", "minimal"] as const) {
        const original = getPresetTemplate(id, level), before = JSON.stringify(original);
        const converted = quickstartSpaceTemplate(original);
        const parsed = graphDocumentV3Schema.safeParse({ ...converted, id: "space", title: original.name, version: 1, schemaVersion: 3, minimumWriterVersion: 3 });
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
        for (const node of converted.nodes) expect(validateNodeConfig(node.kind, node.configVersion, node.config).supported, node.kind).toBe(true);
        expect(converted.nodes.map((node) => node.id)).not.toEqual(quickstartSpaceTemplate(original).nodes.map((node) => node.id));
        expect(converted.nodes.filter((node) => node.kind === "generate.image").every((node) => (node.config as { modelKey: null }).modelKey === null)).toBe(true);
        expect(JSON.stringify(original)).toBe(before);
      }
    }
  });
  it("covers every canonical kind with the upstream-visible title and an executable canonical contract", () => {
    expect(Object.keys(nodeBananaNodeInventory)).toEqual(canonicalNodeKinds);
    expect(nodeBananaNodeInventory["input.prompt"].title).toBe("Prompt");
    expect(nodeBananaNodeInventory["generate.image"].title).toBe("Generate Image");
    expect(nodeBananaNodeInventory["edit.image.annotation"]).toMatchObject({
      title: "Annotation",
      paletteLabel: "Annotate",
      upstreamComponent: "AnnotationNode.tsx",
    });
    expect(nodeBananaNodeInventory["output.single"].title).toBe("Output");

    for (const kind of canonicalNodeKinds) {
      expect(canonicalNodeRegistry[kind].kind).toBe(kind);
      expect(validateNodeConfig(kind, 1, defaultConfigForKind(kind)).supported).toBe(true);
      const component = nodeBananaNodeInventory[kind].upstreamComponent;
      if (component) {
        expect(existsSync(resolve(process.cwd(), "third_party/node-banana/upstream/src/components/nodes", component))).toBe(true);
      }
    }
  });

  it("keeps Leesfield-only behavior explicitly allowlisted", () => {
    expect(Object.entries(nodeBananaNodeInventory)
      .filter(([, item]) => item.parity !== "upstream")
      .map(([kind, item]) => [kind, item.parity]))
      .toEqual([
        ["output.gallery", "upstream-extended"],
      ]);
  });

  it("tracks every upstream default and resize-minimum footprint", () => {
    expect(Object.keys(nodeBananaNodeGeometry)).toEqual(canonicalNodeKinds);
    expect(nodeBananaNodeGeometry["edit.image.gif"]).toEqual({
      width: 480,
      height: 380,
      minWidth: 460,
      minHeight: 340,
    });
    expect(nodeBananaNodeGeometry["edit.video.stitch"]).toEqual({
      width: 400,
      height: 280,
      minWidth: 500,
      minHeight: 280,
    });
  });

  it("uses the exact upstream labels for same-id input and output handles", () => {
    const ports = canonicalNodeRegistry["edit.image.removeBackground"].ports;
    expect(getNodeBananaPortLabel("edit.image.removeBackground", ports[0])).toBe("Image In");
    expect(getNodeBananaPortLabel("edit.image.removeBackground", ports[1])).toBe("Image Out");

    expect(canonicalNodeRegistry["output.single"].ports.map((port) => [port.id, port.valueType])).toEqual([
      ["image", "image"],
      ["video", "video"],
      ["audio", "audio"],
    ]);
    expect(canonicalNodeRegistry["output.gallery"].ports.map((port) => [port.id, port.valueType])).toEqual([
      ["image", "image"],
      ["video", "video"],
      ["audio", "audio"],
    ]);
    expect(canonicalNodeRegistry["edit.video.easeCurve"].ports.map((port) => [port.direction, port.id, port.valueType])).toEqual([
      ["input", "video", "video"],
      ["output", "video", "video"],
      ["input", "settings", "settings"],
      ["output", "settings", "settings"],
    ]);
    const comparePorts = canonicalNodeRegistry["inspect.imageCompare"].ports;
    expect(comparePorts.map((port) => getNodeBananaPortLabel("inspect.imageCompare", port))).toEqual(["A", "B"]);
  });

  it("keeps a source-audited visible handle and behavior contract for all approved Nodes", () => {
    expect(Object.keys(nodeBananaUpstreamContract)).toEqual(canonicalNodeKinds);
    for (const kind of canonicalNodeKinds) {
      expect(nodeBananaUpstreamContract[kind].handles.length).toBeGreaterThan(0);
      expect(nodeBananaUpstreamContract[kind].behavior).not.toBe("");
    }
  });

  it("tracks upstream and explicitly adapted FloatingNodeHeader actions for every Node", () => {
    expect(Object.keys(nodeBananaUpstreamHeaderContract)).toEqual(canonicalNodeKinds);
    expect(Object.keys(nodeBananaHostedHeaderContract)).toEqual(canonicalNodeKinds);
    expect(nodeBananaUpstreamHeaderContract["input.prompt"]).toEqual(["required", "comment", "expand"]);
    expect(nodeBananaHostedHeaderContract["input.prompt"]).toEqual(["required", "comment", "expand"]);
    expect(nodeBananaUpstreamHeaderContract["input.video"]).toEqual(["comment"]);
    expect(nodeBananaHostedHeaderContract["generate.image"]).toEqual(["comment", "expand", "run"]);
    expect(nodeBananaHostedHeaderContract["edit.image.splitGrid"]).toEqual(["comment"]);
  });

  it("uses the upstream Annotation shape contract instead of the former color-only substitute", () => {
    const upstreamRectangle = {
      id: "shape-1",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      stroke: "#ef4444",
      strokeWidth: 4,
      opacity: 0.75,
      fill: "#ef4444",
    };
    expect(validateNodeConfig("edit.image.annotation", 1, {
      parameters: { shapes: [upstreamRectangle] },
    }).supported).toBe(true);
    expect(validateNodeConfig("edit.image.annotation", 1, {
      parameters: { shapes: [{ ...upstreamRectangle, stroke: undefined, color: "#ef4444" }] },
    }).supported).toBe(false);
  });

  it("round-trips every palette Node through its canonical presenter, ports, defaults and execution mode", () => {
    const expectedExecutionMode = {
      "input.image": "none", "input.audio": "none", "input.video": "none", "input.prompt": "none",
      "process.promptConstructor": "none",
      "generate.image": "server-generation", "generate.audio": "server-generation", "generate.video": "server-generation",
      "edit.image.annotation": "browser-operation", "edit.image.resize": "browser-operation",
      "edit.image.removeBackground": "server-operation", "edit.image.splitGrid": "browser-operation", "edit.image.gif": "browser-operation",
      "edit.video.stitch": "browser-operation", "edit.video.trim": "browser-operation",
      "edit.video.frameGrab": "browser-operation", "edit.video.easeCurve": "browser-operation",
      "output.single": "none", "output.gallery": "none", "inspect.imageCompare": "none",
    } as const;

    for (const [index, kind] of canonicalNodeKinds.entries()) {
      const config = defaultConfigForKind(kind);
      const document = {
        schemaVersion: 3 as const, groups: [],
        minimumWriterVersion: 3 as const,
        id: "inventory-graph",
        version: 1,
        title: "Inventory",
        nodes: [{ id: `node-${index}`, kind, position: { x: index * 10, y: index * 5 }, configVersion: 1, config, selectedOutputAssetId: null }],
        edges: [],
      };
      const runtime = canonicalDocumentToRuntimeGraph(document);
      const restored = runtimeGraphToCanonicalDocument(document, runtime);
      const definition = findNodeDefinition(kind);

      expect(runtime.nodes[0]).toMatchObject({
        type: kind.startsWith("generate.") ? "generationNode" : "canonicalNode",
        data: { canonicalKind: kind, config, ports: definition?.ports },
      });
      expect(restored).toEqual(document);
      expect(definition?.executionMode).toBe(expectedExecutionMode[kind]);
      expect(definition?.ports.every((port) => port.id.length > 0 && port.maxConnections !== 0)).toBe(true);
    }
  });
});
