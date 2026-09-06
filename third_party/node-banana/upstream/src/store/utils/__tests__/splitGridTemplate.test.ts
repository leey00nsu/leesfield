/**
 * Unit tests for split-grid template utilities.
 *
 * Pure helpers: template creation (default/classic), legacy-aware template
 * and cell resolution, materialization staleness detection, and per-cell
 * template instantiation (buildCellInstances).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createDefaultSplitGridTemplate,
  createClassicSplitGridTemplate,
  getSplitGridTemplate,
  computeMaterializedKey,
  getSplitGridCells,
  hasLegacyCellsOnly,
  needsMaterialization,
  buildCellInstances,
  getRouterConnections,
  sanitizeGridOffsets,
  resolveGridOffsets,
  gridBoundaries,
  gridFractions,
  SPLIT_GRID_BASE_NODE_ID,
} from "../splitGridTemplate";
import type {
  SplitGridNodeData,
  SplitGridTemplate,
  WorkflowNode,
  WorkflowNodeData,
  PromptNodeData,
  NanoBananaNodeData,
  ImageInputNodeData,
} from "@/types";

// Mock localStorage for loadNodeDefaults/loadGenerateImageDefaults
// (createDefaultNodeData reads sticky generation settings)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

const GENERATE_SETTINGS: SplitGridNodeData["generateSettings"] = {
  aspectRatio: "16:9",
  resolution: "2K",
  model: "nano-banana-pro",
  useGoogleSearch: true,
  useImageSearch: false,
};

function makeSplitGridData(overrides: Partial<SplitGridNodeData> = {}): SplitGridNodeData {
  return {
    sourceImage: null,
    gridRows: 2,
    gridCols: 2,
    targetCount: 4,
    defaultPrompt: "",
    generateSettings: { ...GENERATE_SETTINGS },
    childNodeIds: [],
    isConfigured: false,
    status: "idle",
    error: null,
    ...overrides,
  };
}

function makeSplitNode(): WorkflowNode {
  return {
    id: "splitGrid-1",
    type: "splitGrid",
    position: { x: 100, y: 200 },
    data: makeSplitGridData() as WorkflowNodeData,
    style: { width: 300, height: 400 },
  };
}

describe("splitGridTemplate utilities", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe("createDefaultSplitGridTemplate", () => {
    it("contains only the base image node and no edges", () => {
      const template = createDefaultSplitGridTemplate();

      expect(template.baseNodeId).toBe(SPLIT_GRID_BASE_NODE_ID);
      expect(template.nodes).toHaveLength(1);
      expect(template.nodes[0]).toEqual({
        id: SPLIT_GRID_BASE_NODE_ID,
        type: "imageInput",
        position: { x: 0, y: 0 },
      });
      expect(template.edges).toEqual([]);
    });
  });

  describe("createClassicSplitGridTemplate", () => {
    it("contains image, prompt, and generate nodes wired image->generate and prompt->generate", () => {
      const template = createClassicSplitGridTemplate();

      expect(template.baseNodeId).toBe(SPLIT_GRID_BASE_NODE_ID);
      expect(template.nodes.map((n) => n.type).sort()).toEqual([
        "imageInput",
        "nanoBanana",
        "prompt",
      ]);

      const imageEdge = template.edges.find((e) => e.source === SPLIT_GRID_BASE_NODE_ID);
      expect(imageEdge).toMatchObject({
        sourceHandle: "image",
        target: "cell-generate",
        targetHandle: "image",
      });

      const promptEdge = template.edges.find((e) => e.source === "cell-prompt");
      expect(promptEdge).toMatchObject({
        sourceHandle: "text",
        target: "cell-generate",
        targetHandle: "text",
      });
    });

    it("seeds prompt text when defaultPrompt is provided", () => {
      const template = createClassicSplitGridTemplate("make it pop");

      const promptNode = template.nodes.find((n) => n.type === "prompt");
      expect(promptNode?.data).toEqual({ prompt: "make it pop" });
    });

    it("leaves prompt and generate data undefined without arguments", () => {
      const template = createClassicSplitGridTemplate();

      const promptNode = template.nodes.find((n) => n.type === "prompt");
      const generateNode = template.nodes.find((n) => n.type === "nanoBanana");
      expect(promptNode?.data).toBeUndefined();
      expect(generateNode?.data).toBeUndefined();
    });

    it("maps generateSettings onto the generate node including selectedModel", () => {
      const template = createClassicSplitGridTemplate("", GENERATE_SETTINGS);

      const generateNode = template.nodes.find((n) => n.type === "nanoBanana");
      expect(generateNode?.data).toMatchObject({
        aspectRatio: "16:9",
        resolution: "2K",
        model: "nano-banana-pro",
        useGoogleSearch: true,
        useImageSearch: false,
        selectedModel: {
          provider: "gemini",
          modelId: "nano-banana-pro",
          displayName: "Nano Banana Pro",
        },
      });
    });
  });

  describe("getSplitGridTemplate", () => {
    it("returns the stored template when present", () => {
      const template = createClassicSplitGridTemplate("stored");
      const data = makeSplitGridData({ template });

      expect(getSplitGridTemplate(data)).toBe(template);
    });

    it("maps legacy childNodeIds-only data onto the classic template", () => {
      const data = makeSplitGridData({
        defaultPrompt: "legacy prompt",
        childNodeIds: [
          { imageInput: "img-1", prompt: "prompt-1", nanoBanana: "gen-1" },
        ],
      });

      const template = getSplitGridTemplate(data);

      expect(template.nodes).toHaveLength(3);
      const promptNode = template.nodes.find((n) => n.type === "prompt");
      expect(promptNode?.data).toEqual({ prompt: "legacy prompt" });
      const generateNode = template.nodes.find((n) => n.type === "nanoBanana");
      expect(generateNode?.data).toMatchObject({
        selectedModel: { modelId: GENERATE_SETTINGS.model },
      });
    });

    it("falls back to the default template otherwise", () => {
      const data = makeSplitGridData();

      expect(getSplitGridTemplate(data)).toEqual(createDefaultSplitGridTemplate());
    });

    it("prefers cells over legacy childNodeIds (non-legacy falls back to default)", () => {
      const data = makeSplitGridData({
        cells: [{ baseImageNodeId: "img-1", nodeIds: ["img-1"] }],
        childNodeIds: [
          { imageInput: "old-img", prompt: "old-prompt", nanoBanana: "old-gen" },
        ],
      });

      expect(getSplitGridTemplate(data)).toEqual(createDefaultSplitGridTemplate());
    });
  });

  describe("computeMaterializedKey", () => {
    it("is stable for identical inputs", () => {
      const template = createClassicSplitGridTemplate("hello", GENERATE_SETTINGS);

      expect(computeMaterializedKey(2, 3, template)).toBe(
        computeMaterializedKey(2, 3, template)
      );
    });

    it("ignores node and edge ordering", () => {
      const template = createClassicSplitGridTemplate("hello");
      const shuffled: SplitGridTemplate = {
        baseNodeId: template.baseNodeId,
        nodes: [...template.nodes].reverse(),
        edges: [...template.edges].reverse(),
      };

      expect(computeMaterializedKey(2, 3, shuffled)).toBe(
        computeMaterializedKey(2, 3, template)
      );
    });

    it("differs when rows or cols change", () => {
      const template = createDefaultSplitGridTemplate();

      const key = computeMaterializedKey(2, 3, template);
      expect(computeMaterializedKey(3, 3, template)).not.toBe(key);
      expect(computeMaterializedKey(2, 2, template)).not.toBe(key);
    });

    it("differs when the template changes", () => {
      const defaultKey = computeMaterializedKey(2, 2, createDefaultSplitGridTemplate());
      const classicKey = computeMaterializedKey(2, 2, createClassicSplitGridTemplate());
      const seededKey = computeMaterializedKey(2, 2, createClassicSplitGridTemplate("seeded"));

      expect(classicKey).not.toBe(defaultKey);
      expect(seededKey).not.toBe(classicKey);
    });

    it("differs when a terminal is wired to the router port", () => {
      const base = createClassicSplitGridTemplate();
      const wired: SplitGridTemplate = {
        ...base,
        router: [{ source: "cell-generate", sourceHandle: "image", targetHandle: "image" }],
      };
      const baseKey = computeMaterializedKey(2, 2, base);
      expect(computeMaterializedKey(2, 2, wired)).not.toBe(baseKey);
      // An empty router array is treated as no router (byte-identical to legacy)
      expect(computeMaterializedKey(2, 2, { ...wired, router: [] })).toBe(baseKey);
    });
  });

  describe("getSplitGridCells", () => {
    it("returns cells when present", () => {
      const cells = [
        { baseImageNodeId: "img-1", nodeIds: ["img-1", "gen-1"], groupId: "group-1" },
      ];
      const data = makeSplitGridData({
        cells,
        childNodeIds: [
          { imageInput: "old-img", prompt: "old-prompt", nanoBanana: "old-gen" },
        ],
      });

      expect(getSplitGridCells(data)).toBe(cells);
    });

    it("maps legacy childNodeIds onto the cell shape", () => {
      const data = makeSplitGridData({
        childNodeIds: [
          { imageInput: "img-1", prompt: "prompt-1", nanoBanana: "gen-1" },
          { imageInput: "img-2", prompt: "prompt-2", nanoBanana: "gen-2" },
        ],
      });

      expect(getSplitGridCells(data)).toEqual([
        { baseImageNodeId: "img-1", nodeIds: ["img-1", "prompt-1", "gen-1"] },
        { baseImageNodeId: "img-2", nodeIds: ["img-2", "prompt-2", "gen-2"] },
      ]);
    });

    it("returns empty array when neither cells nor childNodeIds exist", () => {
      expect(getSplitGridCells(makeSplitGridData())).toEqual([]);
      expect(getSplitGridCells(makeSplitGridData({ cells: [] }))).toEqual([]);
    });
  });

  describe("hasLegacyCellsOnly", () => {
    it("is true when childNodeIds is non-empty and cells are absent", () => {
      const data = makeSplitGridData({
        childNodeIds: [{ imageInput: "a", prompt: "b", nanoBanana: "c" }],
      });

      expect(hasLegacyCellsOnly(data)).toBe(true);
    });

    it("is true when childNodeIds is non-empty and cells is empty", () => {
      const data = makeSplitGridData({
        cells: [],
        childNodeIds: [{ imageInput: "a", prompt: "b", nanoBanana: "c" }],
      });

      expect(hasLegacyCellsOnly(data)).toBe(true);
    });

    it("is false when cells are populated", () => {
      const data = makeSplitGridData({
        cells: [{ baseImageNodeId: "img-1", nodeIds: ["img-1"] }],
        childNodeIds: [{ imageInput: "a", prompt: "b", nanoBanana: "c" }],
      });

      expect(hasLegacyCellsOnly(data)).toBe(false);
    });

    it("is false when childNodeIds is empty", () => {
      expect(hasLegacyCellsOnly(makeSplitGridData())).toBe(false);
    });
  });

  describe("needsMaterialization", () => {
    const template = createDefaultSplitGridTemplate();

    function consistentData(): SplitGridNodeData {
      return makeSplitGridData({
        template,
        cells: [
          { baseImageNodeId: "img-1", nodeIds: ["img-1"], groupId: "g-1" },
          { baseImageNodeId: "img-2", nodeIds: ["img-2"], groupId: "g-2" },
          { baseImageNodeId: "img-3", nodeIds: ["img-3"], groupId: "g-3" },
          { baseImageNodeId: "img-4", nodeIds: ["img-4"], groupId: "g-4" },
        ],
        materializedKey: computeMaterializedKey(2, 2, template),
      });
    }

    const existingIds = new Set(["img-1", "img-2", "img-3", "img-4"]);

    it("is false when cells match the current configuration", () => {
      expect(needsMaterialization(consistentData(), existingIds)).toBe(false);
    });

    it("is false for legacy childNodeIds-only data matching the grid (legacy guard)", () => {
      const data = makeSplitGridData({
        gridRows: 1,
        gridCols: 1,
        childNodeIds: [{ imageInput: "a", prompt: "b", nanoBanana: "c" }],
      });

      expect(needsMaterialization(data, new Set(["a", "b", "c"]))).toBe(false);
    });

    it("is true for legacy data when rows/cols no longer match the child count", () => {
      const data = makeSplitGridData({
        gridRows: 2,
        gridCols: 2,
        childNodeIds: [{ imageInput: "a", prompt: "b", nanoBanana: "c" }],
      });

      expect(needsMaterialization(data, new Set(["a", "b", "c"]))).toBe(true);
    });

    it("is true for legacy data when ignoreLegacy is set", () => {
      const data = makeSplitGridData({
        childNodeIds: [{ imageInput: "a", prompt: "b", nanoBanana: "c" }],
      });

      expect(needsMaterialization(data, new Set(["a", "b", "c"]), { ignoreLegacy: true })).toBe(
        true
      );
    });

    it("is true when no cells were ever materialized", () => {
      expect(needsMaterialization(makeSplitGridData({ template }), new Set())).toBe(true);
      expect(needsMaterialization(makeSplitGridData({ template, cells: [] }), new Set())).toBe(
        true
      );
    });

    it("is true when the materialized key does not match", () => {
      const data = consistentData();
      data.materializedKey = "stale-key";

      expect(needsMaterialization(data, existingIds)).toBe(true);
    });

    it("is true when rows/cols changed since materialization", () => {
      const data = consistentData();
      data.gridCols = 3; // key was computed for 2x2

      expect(needsMaterialization(data, existingIds)).toBe(true);
    });

    it("is true when the cell count does not match rows*cols", () => {
      const data = consistentData();
      data.cells = data.cells!.slice(0, 3);

      expect(needsMaterialization(data, existingIds)).toBe(true);
    });

    it("is false when only some base image nodes were deleted (intentional pruning)", () => {
      const data = consistentData();

      expect(
        needsMaterialization(data, new Set(["img-1", "img-2", "img-3"]))
      ).toBe(false);
    });

    it("is true when every cell's base image node is gone", () => {
      const data = consistentData();

      expect(needsMaterialization(data, new Set())).toBe(true);
    });
  });

  describe("buildCellInstances", () => {
    function makeBuildOptions(template: SplitGridTemplate, rows: number, cols: number) {
      let nodeCounter = 0;
      let groupCounter = 0;
      const makeEdgeData = vi.fn(() => ({ createdAt: 123 }));
      return {
        options: {
          splitNode: makeSplitNode(),
          template,
          rows,
          cols,
          makeNodeId: (type: string) => `${type}-n${++nodeCounter}`,
          makeGroupId: () => `group-g${++groupCounter}`,
          groupColor: "blue" as const,
          makeEdgeData,
        },
        makeEdgeData,
      };
    }

    it("creates rows*cols cells with template-node-count nodes per cell", () => {
      const template = createClassicSplitGridTemplate();
      const { options } = makeBuildOptions(template, 2, 3);

      const result = buildCellInstances(options);

      expect(result.cells).toHaveLength(6);
      expect(result.nodes).toHaveLength(6 * template.nodes.length);
      for (const cell of result.cells) {
        expect(cell.nodeIds).toHaveLength(template.nodes.length);
      }
    });

    it("offsets each cell cluster without overlap (default template)", () => {
      // imageInput is 300x280; split node at (100,200) with width 300.
      // startX = 100 + 300 + 100 = 500, startY = 200.
      // stride = cluster + 2*padding(20) + gap(60) => x: 400, y: 380.
      const { options } = makeBuildOptions(createDefaultSplitGridTemplate(), 2, 2);

      const result = buildCellInstances(options);

      const positions = result.nodes.map((n) => n.position);
      expect(positions).toEqual([
        { x: 500, y: 200 },
        { x: 900, y: 200 },
        { x: 500, y: 580 },
        { x: 900, y: 580 },
      ]);
      // All cluster origins are distinct
      const keys = new Set(positions.map((p) => `${p.x},${p.y}`));
      expect(keys.size).toBe(4);
    });

    it("stamps the cell's groupId on every instantiated node", () => {
      const { options } = makeBuildOptions(createClassicSplitGridTemplate(), 1, 2);

      const result = buildCellInstances(options);

      for (const cell of result.cells) {
        expect(cell.groupId).toBeDefined();
        expect(result.groups[cell.groupId!]).toBeDefined();
        for (const nodeId of cell.nodeIds) {
          const node = result.nodes.find((n) => n.id === nodeId);
          expect(node?.groupId).toBe(cell.groupId);
        }
      }
      // Each cell gets its own group
      expect(new Set(result.cells.map((c) => c.groupId)).size).toBe(2);
    });

    it("creates one group per cell named 'Cell r-c' with a padded bounding box", () => {
      const { options } = makeBuildOptions(createDefaultSplitGridTemplate(), 2, 2);

      const result = buildCellInstances(options);

      const groups = Object.values(result.groups);
      expect(groups).toHaveLength(4);
      expect(groups.map((g) => g.name).sort()).toEqual([
        "Cell 1-1",
        "Cell 1-2",
        "Cell 2-1",
        "Cell 2-2",
      ]);
      // Cluster is a single 300x280 imageInput; padding is 20 per side
      const firstCell = result.cells[0];
      const firstGroup = result.groups[firstCell.groupId!];
      const baseNode = result.nodes.find((n) => n.id === firstCell.baseImageNodeId)!;
      expect(firstGroup.position).toEqual({
        x: baseNode.position.x - 20,
        y: baseNode.position.y - 20,
      });
      expect(firstGroup.size).toEqual({ width: 340, height: 320 });
      expect(firstGroup.color).toBe("blue");
    });

    it("remaps intra-template edges to real node ids", () => {
      const template = createClassicSplitGridTemplate();
      const { options } = makeBuildOptions(template, 1, 1);

      const result = buildCellInstances(options);

      const realIds = new Set(result.nodes.map((n) => n.id));
      const intraEdges = result.edges.filter((e) => e.type !== "reference");
      expect(intraEdges).toHaveLength(template.edges.length);
      for (const edge of intraEdges) {
        expect(realIds.has(edge.source)).toBe(true);
        expect(realIds.has(edge.target)).toBe(true);
      }

      const imageInput = result.nodes.find((n) => n.type === "imageInput")!;
      const promptNode = result.nodes.find((n) => n.type === "prompt")!;
      const generate = result.nodes.find((n) => n.type === "nanoBanana")!;
      expect(intraEdges).toContainEqual(
        expect.objectContaining({
          source: imageInput.id,
          sourceHandle: "image",
          target: generate.id,
          targetHandle: "image",
        })
      );
      expect(intraEdges).toContainEqual(
        expect.objectContaining({
          source: promptNode.id,
          sourceHandle: "text",
          target: generate.id,
          targetHandle: "text",
        })
      );
    });

    it("adds one reference edge per cell from the split node to the base image node", () => {
      const { options, makeEdgeData } = makeBuildOptions(createDefaultSplitGridTemplate(), 2, 2);

      const result = buildCellInstances(options);

      const referenceEdges = result.edges.filter((e) => e.type === "reference");
      expect(referenceEdges).toHaveLength(4);
      const targets = referenceEdges.map((e) => e.target).sort();
      const baseIds = result.cells.map((c) => c.baseImageNodeId).sort();
      expect(targets).toEqual(baseIds);
      for (const edge of referenceEdges) {
        expect(edge.source).toBe("splitGrid-1");
        expect(edge.sourceHandle).toBe("reference");
        expect(edge.targetHandle).toBe("reference");
        expect(edge.data).toEqual({ createdAt: 123 });
      }
      expect(makeEdgeData).toHaveBeenCalledTimes(4);
    });

    it("merges template node data overrides over createDefaultNodeData", () => {
      const template: SplitGridTemplate = {
        baseNodeId: SPLIT_GRID_BASE_NODE_ID,
        nodes: [
          { id: SPLIT_GRID_BASE_NODE_ID, type: "imageInput", position: { x: 0, y: 0 } },
          {
            id: "cell-prompt",
            type: "prompt",
            position: { x: 0, y: 310 },
            data: { prompt: "hello cells" },
          },
        ],
        edges: [],
      };
      const { options } = makeBuildOptions(template, 1, 1);

      const result = buildCellInstances(options);

      const promptNode = result.nodes.find((n) => n.type === "prompt")!;
      expect((promptNode.data as PromptNodeData).prompt).toBe("hello cells");

      // Node without overrides gets plain defaults
      const imageNode = result.nodes.find((n) => n.type === "imageInput")!;
      const imageData = imageNode.data as ImageInputNodeData;
      expect(imageData.image).toBeNull();
      expect(imageData.filename).toBeNull();
    });

    it("applies classic generate overrides on instantiated generate nodes", () => {
      const template = createClassicSplitGridTemplate("", GENERATE_SETTINGS);
      const { options } = makeBuildOptions(template, 1, 1);

      const result = buildCellInstances(options);

      const generate = result.nodes.find((n) => n.type === "nanoBanana")!;
      const data = generate.data as NanoBananaNodeData;
      expect(data.aspectRatio).toBe("16:9");
      expect(data.resolution).toBe("2K");
      expect(data.selectedModel).toEqual({
        provider: "gemini",
        modelId: "nano-banana-pro",
        displayName: "Nano Banana Pro",
      });
      // Default fields survive the merge
      expect(data.status).toBe("idle");
      expect(data.outputImage).toBeNull();
    });

    it("emits one terminal->router edge per cell and a router position when a router is wired", () => {
      const template: SplitGridTemplate = {
        ...createClassicSplitGridTemplate(),
        router: [{ source: "cell-generate", sourceHandle: "image", targetHandle: "image" }],
      };
      const { options } = makeBuildOptions(template, 2, 2);

      const result = buildCellInstances({ ...options, routerNodeId: "router-1" });

      // The router node itself is created by the store, not here
      expect(result.nodes.filter((n) => n.type === "router")).toHaveLength(0);
      // 3 real nodes per cell; the router is never a cell member
      expect(result.nodes).toHaveLength(4 * 3);
      for (const cell of result.cells) expect(cell.nodeIds).toHaveLength(3);

      // One typed router edge per cell, from the generate node
      expect(result.routerEdges).toHaveLength(4);
      for (const e of result.routerEdges) {
        expect(e.target).toBe("router-1");
        expect(e.sourceHandle).toBe("image");
        expect(e.targetHandle).toBe("image");
      }
      // Router edges are separate from the intra-cell edges
      expect(result.edges.some((e) => e.target === "router-1")).toBe(false);

      // Positioned to the right of the whole grid
      expect(result.routerPosition).not.toBeNull();
      const gridRight = Math.max(
        ...Object.values(result.groups).map((g) => g.position.x + g.size.width)
      );
      expect(result.routerPosition!.x).toBeGreaterThan(gridRight);
    });

    it("emits no router edges or position when routerNodeId is not supplied", () => {
      const template: SplitGridTemplate = {
        ...createClassicSplitGridTemplate(),
        router: [{ source: "cell-generate", sourceHandle: "image", targetHandle: "image" }],
      };
      const { options } = makeBuildOptions(template, 2, 2);

      const result = buildCellInstances(options);

      expect(result.routerEdges).toHaveLength(0);
      expect(result.routerPosition).toBeNull();
    });

    it("emits no router edges when a routerNodeId is supplied but the port is unwired", () => {
      const { options } = makeBuildOptions(createClassicSplitGridTemplate(), 2, 2);

      const result = buildCellInstances({ ...options, routerNodeId: "router-1" });

      expect(result.routerEdges).toHaveLength(0);
      expect(result.routerPosition).toBeNull();
    });

    it("carries the terminal's typed handle onto router edges for a text terminal", () => {
      const template: SplitGridTemplate = {
        ...createClassicSplitGridTemplate(),
        router: [{ source: "cell-prompt", sourceHandle: "text", targetHandle: "text" }],
      };
      const { options } = makeBuildOptions(template, 1, 2);

      const result = buildCellInstances({ ...options, routerNodeId: "router-1" });

      expect(result.routerEdges).toHaveLength(2); // one per cell
      for (const e of result.routerEdges) {
        expect(e.target).toBe("router-1");
        expect(e.sourceHandle).toBe("text");
        expect(e.targetHandle).toBe("text");
      }
    });

    it("emits connections*cells router edges with unique ids for multiple terminals", () => {
      const template: SplitGridTemplate = {
        ...createClassicSplitGridTemplate(),
        router: [
          { source: "cell-generate", sourceHandle: "image", targetHandle: "image" },
          { source: "cell-prompt", sourceHandle: "text", targetHandle: "text" },
        ],
      };
      const { options } = makeBuildOptions(template, 2, 2);

      const result = buildCellInstances({ ...options, routerNodeId: "router-1" });

      expect(result.routerEdges).toHaveLength(2 * 4); // 2 terminals * 4 cells
      const ids = result.routerEdges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique
      expect(result.routerEdges.every((e) => e.target === "router-1")).toBe(true);
      expect(result.routerEdges.filter((e) => e.targetHandle === "image")).toHaveLength(4);
      expect(result.routerEdges.filter((e) => e.targetHandle === "text")).toHaveLength(4);
    });

    it("ignores router connections with an unknown source or a non-router targetHandle", () => {
      const template: SplitGridTemplate = {
        ...createClassicSplitGridTemplate(),
        router: [
          { source: "does-not-exist", sourceHandle: "image", targetHandle: "image" },
          { source: "cell-generate", sourceHandle: "image", targetHandle: "bogus" },
        ],
      };
      const { options } = makeBuildOptions(template, 2, 2);

      const result = buildCellInstances({ ...options, routerNodeId: "router-1" });

      expect(result.routerEdges).toHaveLength(0);
      expect(result.routerPosition).toBeNull();
    });

    it("normalizes malformed, mismatched, and duplicate router connections", () => {
      const template: SplitGridTemplate = {
        ...createClassicSplitGridTemplate(),
        router: [
          { source: "cell-generate", sourceHandle: "image", targetHandle: "image" },
          { source: "cell-generate", sourceHandle: "image", targetHandle: "image" },
          { source: "cell-generate", sourceHandle: "bogus", targetHandle: "image" },
          { source: "cell-prompt", sourceHandle: "text", targetHandle: "image" },
        ],
      };

      expect(getRouterConnections(template)).toEqual([
        { source: "cell-generate", sourceHandle: "image", targetHandle: "image" },
      ]);

      const { options } = makeBuildOptions(template, 1, 2);
      const result = buildCellInstances({ ...options, routerNodeId: "router-1" });
      expect(result.routerEdges).toHaveLength(2);
      expect(new Set(result.routerEdges.map((edge) => edge.id)).size).toBe(2);
    });

    it("treats structurally invalid router metadata as unwired", () => {
      const base = createClassicSplitGridTemplate();
      const invalidValues: unknown[] = [{}, [null], [{ source: 42 }]];

      for (const router of invalidValues) {
        const template = { ...base, router } as SplitGridTemplate;
        expect(getRouterConnections(template)).toEqual([]);
        expect(() => computeMaterializedKey(2, 2, template)).not.toThrow();
      }
    });
  });

  describe("grid offset helpers", () => {
    describe("sanitizeGridOffsets", () => {
      it("accepts valid interior offsets of the right length", () => {
        expect(sanitizeGridOffsets([0.25, 0.6], 3)).toEqual([0.25, 0.6]);
      });

      it("rejects wrong-length arrays", () => {
        expect(sanitizeGridOffsets([0.5], 3)).toBeNull();
        expect(sanitizeGridOffsets([0.25, 0.5, 0.75], 3)).toBeNull();
      });

      it("rejects out-of-range or non-ascending values", () => {
        expect(sanitizeGridOffsets([0, 0.5], 3)).toBeNull(); // 0 not inside (0,1)
        expect(sanitizeGridOffsets([0.5, 1], 3)).toBeNull(); // 1 not inside (0,1)
        expect(sanitizeGridOffsets([0.6, 0.4], 3)).toBeNull(); // not ascending
        expect(sanitizeGridOffsets([0.5, 0.5], 3)).toBeNull(); // equal, not strict
      });

      it("rejects boundaries that create slices smaller than the minimum gap", () => {
        expect(sanitizeGridOffsets([0.01, 0.5], 3)).toBeNull();
        expect(sanitizeGridOffsets([0.4, 0.41], 3)).toBeNull();
        expect(sanitizeGridOffsets([0.5, 0.99], 3)).toBeNull();
      });

      it("rejects non-array or non-finite input", () => {
        expect(sanitizeGridOffsets(undefined, 3)).toBeNull();
        expect(sanitizeGridOffsets("nope", 3)).toBeNull();
        expect(sanitizeGridOffsets([Number.NaN], 2)).toBeNull();
      });

      it("returns an empty array for a single slice (no interior lines)", () => {
        expect(sanitizeGridOffsets([], 1)).toEqual([]);
      });
    });

    describe("resolveGridOffsets", () => {
      it("returns evenly spaced offsets when none are provided", () => {
        expect(resolveGridOffsets(4, undefined)).toEqual([0.25, 0.5, 0.75]);
      });

      it("falls back to uniform when the stored offsets are invalid", () => {
        expect(resolveGridOffsets(3, [0.9, 0.1])).toEqual([1 / 3, 2 / 3]);
      });

      it("uses valid custom offsets", () => {
        expect(resolveGridOffsets(3, [0.2, 0.8])).toEqual([0.2, 0.8]);
      });

      it("returns an empty array for a single slice", () => {
        expect(resolveGridOffsets(1, undefined)).toEqual([]);
      });
    });

    describe("gridBoundaries / gridFractions", () => {
      it("wraps interior offsets with 0 and 1", () => {
        expect(gridBoundaries(3, [0.2, 0.5])).toEqual([0, 0.2, 0.5, 1]);
      });

      it("derives per-slice fractions that sum to 1", () => {
        const fractions = gridFractions(3, [0.2, 0.5]);
        expect(fractions).toHaveLength(3);
        expect(fractions[0]).toBeCloseTo(0.2);
        expect(fractions[1]).toBeCloseTo(0.3);
        expect(fractions[2]).toBeCloseTo(0.5);
        expect(fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
      });

      it("gives equal fractions for uniform offsets", () => {
        expect(gridFractions(2, resolveGridOffsets(2, undefined))).toEqual([0.5, 0.5]);
      });
    });
  });
});
