import { describe, expect, it } from "vitest";

import type {
  CanonicalGraphIssueCode,
  CanonicalJsonValue,
  CanonicalNode,
  GraphDocumentV2,
  GraphDocumentV3,
} from "@/shared/generation-graph/canonical-graph";
import { unavailableEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { findPortDefinition } from "@/shared/generation-graph/node-registry";

import type { GenerationGraphSnapshotDto } from "./graph-types";
import {
  findSpaceNodeCatalogItem,
  getSpacePortLabel,
  isSpaceNodeAuthorable,
  spaceAuthorableNodeKinds,
} from "./space-editor-catalog";
import {
  analyzeEditorDocumentSupport,
  canonicalGraphToEditorDocument,
  editorDocumentToCanonicalGraph,
  generationSnapshotToEditorDocument,
} from "./space-editor-document";

function node(id: string, kind: string, config: CanonicalJsonValue): CanonicalNode {
  return { id, kind, config, configVersion: 1, position: { x: 15, y: -30 }, selectedOutputAssetId: null };
}

function savedGraph(): GraphDocumentV3 {
  return {
    schemaVersion: 3, minimumWriterVersion: 3, id: "existing_space", version: 17, title: "Saved Space",
    nodes: [
      node("video_b", "input.video", { assetId: "asset_b", filename: "  original.mp4  " }),
      {
        ...node("stitch", "edit.video.stitch", {
          parameters: { repeat: 2, stripAudio: false, clipOrder: ["clip_a", "clip_b"] },
          presentation: { customTitle: "  Keep title  ", comment: "Keep comment" },
        }),
        position: { x: 720, y: 40 }, selectedOutputAssetId: "asset_stitched",
      },
      node("generator", "generate.video", {
        prompt: "A saved prompt", modelKey: null,
        parameters: { seed: 0, flag: false, caption: "", optional: null, opaque: { values: [0, false, ""] } },
      }),
      {
        ...node("video_a", "input.video", {
          assetId: "asset_a",
          resultSource: {
            nodeId: "generator", executionId: "execution_saved", portId: "video", index: 1, outputCount: 2, state: "completed",
          },
          templateSource: { nodeId: "split_saved", localNodeId: "local_input", index: 0 },
          splitSource: { nodeId: "split_saved", index: 0 },
          presentation: { isOptional: false },
        }),
        selectedOutputAssetId: "asset_a",
      },
      node("output", "output.single", { mediaType: "video" }),
    ],
    edges: [
      { id: "clip_b", sourceNodeId: "video_b", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 1 },
      { id: "render", sourceNodeId: "stitch", sourcePortId: "video", targetNodeId: "output", targetPortId: "video", sortOrder: 0, hasPause: false },
      { id: "clip_a", sourceNodeId: "video_a", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 0, hasPause: true },
      { id: "binding", sourceNodeId: "generator", sourcePortId: "video", targetNodeId: "video_a", targetPortId: "video", sortOrder: 0 },
    ],
    groups: [
      { id: "group_saved", title: "Saved frame", color: "purple", locked: true,
        bounds: { x: -20, y: -40, width: 700, height: 500 }, memberNodeIds: ["video_a", "generator"] },
      { id: "empty_frame", title: "Empty frame", color: "blue", locked: false,
        bounds: { x: 1000, y: 0, width: 300, height: 200 }, memberNodeIds: [] },
    ],
  };
}

function legacyGraph(): GraphDocumentV2 {
  return {
    schemaVersion: 2, minimumWriterVersion: 2, id: "legacy_space", version: 9, title: "Existing Split",
    nodes: [
      {
        ...node("frame_saved", "input.image", {
          assetId: "asset_saved", splitSource: { nodeId: "split", index: 0 },
          resultSource: { nodeId: "split", executionId: null, portId: "images", index: 0, state: "completed" },
        }),
        selectedOutputAssetId: "asset_saved",
      },
      node("split", "edit.image.splitGrid", {
        parameters: { rows: 1, cols: 2 }, presentation: { comment: "Keep original" },
        materialization: {
          rows: 1, cols: 2, cells: [
            {
              baseNodeId: "frame_saved", nodeIds: ["frame_saved", "deleted_node"],
              group: { id: "cell_frame", name: "Renamed frame", color: "orange",
                position: { x: 800, y: -90 }, size: { width: 480, height: 550 } },
            },
            { baseNodeId: "deleted_node", nodeIds: ["deleted_node"], group: null },
          ],
        },
      }),
    ],
    edges: [
      { id: "split_reference", sourceNodeId: "split", sourcePortId: "images", targetNodeId: "frame_saved", targetPortId: "reference", sortOrder: 0, hasPause: false },
    ],
  };
}

const unsupportedNodeCases: Array<Pick<CanonicalNode, "kind" | "configVersion" | "config"> & {
  reason: CanonicalGraphIssueCode;
}> = [
  { kind: "future.node", configVersion: 1, config: [0, false, null, { opaque: ["keep", ""] }], reason: "UNKNOWN_NODE_KIND" },
  { kind: "generate.image", configVersion: 9, config: { untouched: { parameters: [0, false, null] } }, reason: "UNKNOWN_CONFIG_VERSION" },
  { kind: "edit.image.splitGrid", configVersion: 2, config: { materialization: { futureLayout: [1, 2] } }, reason: "UNKNOWN_CONFIG_VERSION" },
  { kind: "input.prompt", configVersion: 1, config: { text: "Keep text", futureField: { keep: true } }, reason: "INVALID_NODE_CONFIG" },
];

describe("Space editor document conversions", () => {
  it("round-trips v3 IDs, JSON, selections, provenance, group ownership and edge order without normalization", () => {
    const graph = savedGraph();
    const before = structuredClone(graph);
    const document = canonicalGraphToEditorDocument(graph);

    expect(document).toStrictEqual({
      schemaVersion: 3, title: graph.title, nodes: graph.nodes, edges: graph.edges, groups: graph.groups,
    });
    expect(document.nodes.map((item) => item.id)).toEqual(["video_b", "stitch", "generator", "video_a", "output"]);
    expect(document.edges.map((edge) => [edge.id, edge.sortOrder])).toEqual([
      ["clip_b", 1], ["render", 0], ["clip_a", 0], ["binding", 0],
    ]);
    expect(document.edges[0]).not.toHaveProperty("hasPause");
    expect(document.edges[1]).toHaveProperty("hasPause", false);
    expect(document.edges[2]).toHaveProperty("hasPause", true);
    expect(document.nodes[1].config).toMatchObject({ parameters: { clipOrder: ["clip_a", "clip_b"] } });
    expect(document.nodes[3].config).toMatchObject({
      resultSource: { executionId: "execution_saved", portId: "video", index: 1, outputCount: 2 },
      templateSource: { nodeId: "split_saved", localNodeId: "local_input", index: 0 },
      splitSource: { nodeId: "split_saved", index: 0 },
    });
    expect(analyzeEditorDocumentSupport(document)).toEqual({ writable: true, readOnlyReason: null, issues: [] });
    expect(editorDocumentToCanonicalGraph(document, { id: graph.id, version: graph.version })).toStrictEqual(graph);
    expect(editorDocumentToCanonicalGraph(document, { id: graph.id, version: 18 })).toStrictEqual({ ...graph, version: 18 });
    expect(graph).toStrictEqual(before);
  });

  it("loads a server snapshot without persisting server-only output bindings, timestamps or support flags", () => {
    const graph = savedGraph();
    const snapshot: GenerationGraphSnapshotDto = {
      ...graph, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
      writable: false, readOnlyReason: "SERVER_POLICY",
      outputBindings: [{ graphNodeId: "generator", portId: "video", sortOrder: 1, assetId: "asset_a" }],
    };
    const before = structuredClone(snapshot);
    const document = generationSnapshotToEditorDocument(snapshot);

    expect(document).toStrictEqual({
      schemaVersion: 3, title: graph.title, nodes: graph.nodes, edges: graph.edges, groups: graph.groups,
    });
    expect(editorDocumentToCanonicalGraph(document, snapshot)).toStrictEqual(graph);
    expect(snapshot).toStrictEqual(before);
  });

  it("keeps absent config defaults absent even after support analysis", () => {
    const graph: GraphDocumentV3 = {
      ...savedGraph(), nodes: [node("trim", "edit.video.trim", { parameters: {} })], edges: [], groups: [],
    };
    const document = canonicalGraphToEditorDocument(graph);
    expect(analyzeEditorDocumentSupport(document)).toEqual({ writable: true, readOnlyReason: null, issues: [] });
    expect(document.nodes[0].config).toStrictEqual({ parameters: {} });
    expect(editorDocumentToCanonicalGraph(document, graph).nodes[0].config).toStrictEqual({ parameters: {} });
    expect(graph.nodes[0].config).toStrictEqual({ parameters: {} });
  });

  it("upgrades v2 embedded Split frames additively while retaining assets, deleted provenance and edge IDs", () => {
    const legacy = legacyGraph();
    const before = structuredClone(legacy);
    const document = canonicalGraphToEditorDocument(legacy);

    expect(document.schemaVersion).toBe(3);
    expect(document.groups).toStrictEqual([
      { id: "cell_frame", title: "Renamed frame", color: "orange", locked: false,
        bounds: { x: 800, y: -90, width: 480, height: 550 }, memberNodeIds: ["frame_saved"] },
    ]);
    expect(document.nodes[0]).toStrictEqual(legacy.nodes[0]);
    expect(document.nodes[1]).toStrictEqual({ ...legacy.nodes[1], config: {
      parameters: { rows: 1, cols: 2 }, presentation: { comment: "Keep original" },
      materialization: { rows: 1, cols: 2, cells: [
        { baseNodeId: "frame_saved", nodeIds: ["frame_saved", "deleted_node"], groupId: "cell_frame" },
        { baseNodeId: "deleted_node", nodeIds: ["deleted_node"], groupId: null },
      ] },
    } });
    expect(document.edges).toStrictEqual(legacy.edges);
    const restored = editorDocumentToCanonicalGraph(document, legacy);
    expect(restored).toMatchObject({ id: "legacy_space", version: 9, schemaVersion: 3, minimumWriterVersion: 3 });
    expect(canonicalGraphToEditorDocument(restored)).toStrictEqual(document);
    expect(generationSnapshotToEditorDocument({
      ...legacy, groups: [], createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
    })).toStrictEqual(document);
    expect(legacy).toStrictEqual(before);
  });

  it("rejects ambiguous v2 group ownership instead of losing an embedded frame", () => {
    const legacy = legacyGraph();
    const split = legacy.nodes[1].config as Record<string, CanonicalJsonValue>;
    const materialization = split.materialization as Record<string, CanonicalJsonValue>;
    const cells = materialization.cells as CanonicalJsonValue[];
    cells.push(structuredClone(cells[0]));
    const before = structuredClone(legacy);

    expect(() => canonicalGraphToEditorDocument(legacy)).toThrow();
    expect(legacy).toStrictEqual(before);
  });

  it.each(unsupportedNodeCases)(
    "preserves $kind config v$configVersion as opaque JSON and reports $reason",
    ({ kind, configVersion, config, reason }) => {
      const original: CanonicalNode = { ...node("opaque", kind, config), configVersion, selectedOutputAssetId: "asset_saved" };
      for (const schemaVersion of [2, 3] as const) {
        const content = { id: "future_space", version: 5, title: "Opaque Space", nodes: [original], edges: [] };
        const graph = schemaVersion === 2
          ? { ...content, schemaVersion: 2 as const, minimumWriterVersion: 2 as const }
          : { ...content, schemaVersion: 3 as const, minimumWriterVersion: 3 as const, groups: [] };
        const before = structuredClone(graph);
        const document = canonicalGraphToEditorDocument(graph);

        expect(document.nodes).toStrictEqual([original]);
        expect(analyzeEditorDocumentSupport(document)).toMatchObject({
          writable: false, readOnlyReason: reason, issues: [{ code: reason, nodeId: "opaque" }],
        });
        expect(editorDocumentToCanonicalGraph(document, graph).nodes).toStrictEqual([original]);
        expect(generationSnapshotToEditorDocument({
          ...graph, groups: [], createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
        }).nodes).toStrictEqual([original]);
        expect(graph).toStrictEqual(before);
      }
    },
  );

  it("keeps explicit selection intent on the wire draft and outside the canonical graph", () => {
    const graph = savedGraph();
    const document = { ...canonicalGraphToEditorDocument(graph), selectionChanges: ["video_a"] };
    expect(editorDocumentToCanonicalGraph(document, graph)).toStrictEqual(graph);
    expect(document.selectionChanges).toEqual(["video_a"]);
  });
});

describe("Space editor presentation catalog", () => {
  it.each(unavailableEditNodeKinds)("keeps %s readable with its config and selection, while blocking new authoring", (kind) => {
    const graph: GraphDocumentV3 = {
      ...savedGraph(), nodes: [{ ...node("retained", kind, defaultConfigForKind(kind)), selectedOutputAssetId: "asset_saved" }], edges: [], groups: [],
    };
    const item = findSpaceNodeCatalogItem(kind);
    expect(item?.title).toBeTruthy();
    expect(item?.geometry.width).toBeGreaterThan(0);
    expect(isSpaceNodeAuthorable(kind)).toBe(false);
    expect(spaceAuthorableNodeKinds).not.toContain(kind);
    const document = canonicalGraphToEditorDocument(graph);
    expect(analyzeEditorDocumentSupport(document).writable).toBe(true);
    expect(editorDocumentToCanonicalGraph(document, graph)).toStrictEqual(graph);
  });

  it.each(["generate.assistant", "edit.video.extractFrames"])(
    "retains %s in the product authoring palette", (kind) => {
      expect(isSpaceNodeAuthorable(kind)).toBe(true);
      expect(spaceAuthorableNodeKinds).toContain(kind);
    },
  );

  it("offers exactly the 14 currently authorable kinds while retaining all canonical definitions", () => {
    expect(spaceAuthorableNodeKinds).toHaveLength(14);
    for (const kind of ["edit.video.trim", "edit.video.stitch", "edit.image.resize"]) {
      expect(isSpaceNodeAuthorable(kind)).toBe(false);
      expect(findSpaceNodeCatalogItem(kind)?.title).toBeTruthy();
    }
  });

  it("uses shared square media footprints while keeping optional input controls", () => {
    expect(findSpaceNodeCatalogItem("input.video")).toMatchObject({
      title: "Video Input", supportsOptionalInput: true,
      geometry: { width: 300, height: 300, minWidth: 180, minHeight: 100 },
    });
    expect(findSpaceNodeCatalogItem("process.promptConstructor")?.supportsOptionalInput).not.toBe(true);
    expect(findSpaceNodeCatalogItem("edit.video.stitch")?.geometry).toEqual({ width: 400, height: 400, minWidth: 300, minHeight: 200 });
    expect(findSpaceNodeCatalogItem("note.memo")).toMatchObject({ title: "Memo", paletteLabel: "Memo", category: "Process" });
    expect(findSpaceNodeCatalogItem("future.node")).toBeUndefined();
    expect(isSpaceNodeAuthorable("future.node")).toBe(false);
  });

  it("labels canonical ports by direction without changing their identity or frame semantics", () => {
    const imageInput = findPortDefinition("edit.image.resize", "image", "input")!;
    const imageOutput = findPortDefinition("edit.image.resize", "image", "output")!;
    const videoInput = findPortDefinition("edit.video.trim", "video", "input")!;
    const videoOutput = findPortDefinition("edit.video.trim", "video", "output")!;
    expect([getSpacePortLabel("edit.image.resize", imageInput), getSpacePortLabel("edit.image.resize", imageOutput)]).toEqual(["Image In", "Image Out"]);
    expect([getSpacePortLabel("edit.video.trim", videoInput), getSpacePortLabel("edit.video.trim", videoOutput)]).toEqual(["Video In", "Video Out"]);
    expect(getSpacePortLabel("edit.video.extractFrames", findPortDefinition("edit.video.extractFrames", "startFrame", "output")!)).toBe("Start frame");
    expect(getSpacePortLabel("edit.video.extractFrames", findPortDefinition("edit.video.extractFrames", "endFrame", "output")!)).toBe("End frame");
    expect(getSpacePortLabel("generate.image", findPortDefinition("generate.image", "prompt", "input")!)).toBe("Prompt");
    expect(getSpacePortLabel("inspect.imageCompare", findPortDefinition("inspect.imageCompare", "before", "input")!)).toBe("A");
    expect(imageInput.id).toBe("image");
    expect(imageOutput.id).toBe("image");
  });
});
