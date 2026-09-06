import { describe, expect, it } from "vitest";

import {
  analyzeCanonicalGraphSupport,
  graphDocumentV2Schema,
  graphDocumentV3Schema,
  pruneGroupsAfterNodeDeletion,
  upgradeCanonicalGraphToV3,
  type CanonicalGroup,
  validateCanonicalGraph,
  type CanonicalEdge,
  type CanonicalNode,
} from "./canonical-graph";

const generationConfig = { prompt: "hello", modelKey: null, parameters: {} };

describe("canonical Graph v3 groups", () => {
  const group: CanonicalGroup = {
    id: "group_1", title: "Group 1", color: "neutral", locked: false,
    bounds: { x: -20, y: -20, width: 400, height: 300 }, memberNodeIds: ["image"],
  };
  const document = {
    schemaVersion: 3, minimumWriterVersion: 3, id: "graph", version: 1, title: "Space",
    nodes: [node("image", "input.image", { assetId: null })], edges: [], groups: [group],
  };

  it("roundtrips explicit group ownership, including an empty frame", () => {
    expect(graphDocumentV3Schema.parse(document)).toEqual(document);
    expect(graphDocumentV3Schema.parse({ ...document, groups: [{ ...group, memberNodeIds: [] }] }).groups).toHaveLength(1);
  });

  it.each([
    ["old writer", { ...document, minimumWriterVersion: 2 }],
    ["old schema", { ...document, schemaVersion: 2 }],
    ["missing groups", { ...document, groups: undefined }],
    ["unknown owner", { ...document, ownerEmail: "other@example.com" }],
    ["duplicate group IDs", { ...document, groups: [group, { ...group, memberNodeIds: [] }] }],
    ["duplicate membership", { ...document, groups: [{ ...group, memberNodeIds: ["image", "image"] }] }],
    ["two group owners", { ...document, groups: [group, { ...group, id: "group_2" }] }],
    ["dangling member", { ...document, groups: [{ ...group, memberNodeIds: ["missing"] }] }],
    ["nested group", { ...document, groups: [{ ...group, parentId: "outer" }] }],
    ["zero width", { ...document, groups: [{ ...group, bounds: { ...group.bounds, width: 0 } }] }],
    ["nonfinite bounds", { ...document, groups: [{ ...group, bounds: { ...group.bounds, x: Infinity } }] }],
    ["group limit", { ...document, groups: Array.from({ length: 501 }, (_, i) => ({ ...group, id: `group_${i}`, memberNodeIds: [] })) }],
  ])("rejects %s before persistence", (_label, value) => {
    expect(graphDocumentV3Schema.safeParse(value).success).toBe(false);
  });

  it("prunes only groups newly emptied by deletion, retaining unrelated empty frames", () => {
    const empty = { ...group, id: "empty", memberNodeIds: [] };
    const partial = { ...group, id: "partial", memberNodeIds: ["other", "third"] };
    const groups = [group, empty, partial];
    const result = pruneGroupsAfterNodeDeletion(groups, new Set(["image", "other"]));
    expect(result).toEqual([empty, { ...partial, memberNodeIds: ["third"] }]);
    expect(result[0]).toBe(empty);
    expect(groups[0].memberNodeIds).toEqual(["image"]);
    expect(pruneGroupsAfterNodeDeletion(groups, new Set(["missing"]))[0]).toBe(group);
  });

  const legacyGroup = {
    id: "cell_group", name: "Renamed cell", color: "purple", locked: true,
    position: { x: 845, y: -120 }, size: { width: 480, height: 550 },
  };
  function legacyDocument() {
    return {
      schemaVersion: 2, minimumWriterVersion: 2, id: "existing_space", version: 17, title: "Keep this Space",
      nodes: [
        node("image", "input.image", { assetId: "original_asset", splitSource: { nodeId: "split", index: 0 } }),
        { ...node("split", "edit.image.splitGrid", {
          parameters: { rows: 1, cols: 1 }, presentation: { comment: "Keep comment" },
          materialization: { rows: 1, cols: 1, cells: [{ baseNodeId: "image", nodeIds: ["image", "deleted"], group: legacyGroup }] },
        }), selectedOutputAssetId: "original_asset" },
      ],
      edges: [edge("ref", "split", "images", "image", "reference")],
    };
  }

  it("upgrades existing Spaces without changing IDs, version, assets, topology or user frame edits", () => {
    const legacy = legacyDocument();
    const before = structuredClone(legacy);
    const upgraded = upgradeCanonicalGraphToV3(legacy);
    expect(upgraded).toMatchObject({
      id: legacy.id, version: 17, title: legacy.title, schemaVersion: 3, minimumWriterVersion: 3,
      edges: legacy.edges,
      groups: [{ id: "cell_group", title: "Renamed cell", color: "purple", locked: true,
        bounds: { x: 845, y: -120, width: 480, height: 550 }, memberNodeIds: ["image"] }],
    });
    expect(upgraded.nodes[0]).toEqual(legacy.nodes[0]);
    expect(upgraded.nodes[1]).toMatchObject({ selectedOutputAssetId: "original_asset", config: {
      parameters: { rows: 1, cols: 1 }, presentation: { comment: "Keep comment" },
      materialization: { cells: [{ baseNodeId: "image", nodeIds: ["image", "deleted"], groupId: "cell_group" }] },
    } });
    expect(JSON.stringify(upgraded.nodes[1].config)).not.toContain('"group":');
    expect(legacy).toEqual(before);
    expect(upgradeCanonicalGraphToV3(upgraded)).toEqual(upgraded);
  });

  it("preserves explicit group deletion, empty frames, and unknown node config", () => {
    const legacy = legacyDocument();
    const config = legacy.nodes[1].config as Record<string, unknown>;
    config.materialization = { rows: 1, cols: 2, cells: [
      { baseNodeId: "image", nodeIds: ["image"], group: null },
      { baseNodeId: "deleted", nodeIds: ["deleted"], group: {
        id: legacyGroup.id, name: legacyGroup.name, color: legacyGroup.color,
        position: legacyGroup.position, size: legacyGroup.size,
      } },
    ] };
    legacy.nodes.push(node("future", "future.kind", { opaque: [1, "keep"] }));
    const upgraded = upgradeCanonicalGraphToV3(legacy);
    expect(upgraded.groups).toEqual([{ id: "cell_group", title: "Renamed cell", color: "purple", locked: false,
      bounds: { x: 845, y: -120, width: 480, height: 550 }, memberNodeIds: [] }]);
    expect(upgraded.nodes[2]).toEqual(legacy.nodes[2]);
    expect(upgradeCanonicalGraphToV3({ ...legacy, nodes: [] }).groups).toEqual([]);
  });

  it("rejects malformed or ambiguous legacy ownership without mutating its input", () => {
    const legacy = legacyDocument();
    const config = legacy.nodes[1].config as Record<string, unknown>;
    const cell = { baseNodeId: "image", nodeIds: ["image"], group: legacyGroup };
    for (const cells of [
      [{ ...cell, group: { ...legacyGroup, size: { width: 0, height: 200 } } }],
      [cell, cell],
      [cell, { ...cell, group: { ...legacyGroup, id: "other_group" } }],
      [{ ...cell, unexpected: true }],
    ]) {
      config.materialization = { rows: 1, cols: 2, cells };
      const before = structuredClone(legacy);
      expect(() => upgradeCanonicalGraphToV3(legacy)).toThrow();
      expect(legacy).toEqual(before);
    }
    expect(() => upgradeCanonicalGraphToV3({ ...document, minimumWriterVersion: 4 })).toThrow();
  });
});

function node(id: string, kind: string, config: CanonicalNode["config"]): CanonicalNode {
  return {
    id,
    kind,
    position: { x: 0, y: 0 },
    configVersion: 1,
    config,
    selectedOutputAssetId: null,
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  sortOrder = 0,
): CanonicalEdge {
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, sortOrder };
}

describe("canonical Graph v2", () => {
  it("accepts a canonical v2 graph and rejects legacy fields", () => {
    const graph = {
      schemaVersion: 2,
      minimumWriterVersion: 2,
      id: "graph_1",
      version: 7,
      title: "Canonical",
      nodes: [node("image", "generate.image", generationConfig)],
      edges: [],
    };
    expect(graphDocumentV2Schema.safeParse(graph).success).toBe(true);
    expect(graphDocumentV2Schema.safeParse({
      ...graph,
      nodes: [{ ...graph.nodes[0], type: "imageGeneration" }],
    }).success).toBe(false);
  });

  it("preserves an unknown node payload and marks the Graph read-only", () => {
    const rawConfig = { future: { nested: [1, true, "value"] } };
    const graph = graphDocumentV2Schema.parse({
      schemaVersion: 2,
      minimumWriterVersion: 2,
      id: "graph_1",
      version: 1,
      title: "Future",
      nodes: [node("future", "future.engine.node", rawConfig)],
      edges: [],
    });

    expect(graph.nodes[0].config).toEqual(rawConfig);
    expect(analyzeCanonicalGraphSupport(graph)).toMatchObject({
      writable: false,
      readOnlyReason: "UNKNOWN_NODE_KIND",
    });
  });

  it("rejects incompatible types, single-port overflow and duplicate ordered positions", () => {
    const nodes = [
      node("prompt", "input.prompt", { text: "hello" }),
      node("image_a", "input.image", { assetId: null }),
      node("image_b", "input.image", { assetId: null }),
      node("video", "generate.video", generationConfig),
      node("resize", "edit.image.resize", { parameters: {} }),
      node("gif", "edit.image.gif", { parameters: {} }),
    ];
    const issues = validateCanonicalGraph({
      nodes,
      edges: [
        edge("wrong_type", "prompt", "text", "video", "initImage"),
        edge("resize_a", "image_a", "image", "resize", "image"),
        edge("resize_b", "image_b", "image", "resize", "image"),
        edge("frame_a", "image_a", "image", "gif", "frames", 0),
        edge("frame_b", "image_b", "image", "gif", "frames", 0),
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "PORT_VALUE_TYPE_MISMATCH",
        "PORT_CARDINALITY_EXCEEDED",
        "PORT_ORDER_DUPLICATE",
      ]),
    );
  });

  it("accepts upstream Image and Video gallery handles at the same time", () => {
    const issues = validateCanonicalGraph({
      nodes: [
        node("image", "input.image", { assetId: null }),
        node("video", "input.video", { assetId: null }),
        node("gallery", "output.gallery", { mediaType: null }),
      ],
      edges: [
        edge("image_edge", "image", "image", "gallery", "image", 0),
        edge("video_edge", "video", "video", "gallery", "video", 0),
      ],
    });

    expect(issues).toEqual([]);
  });

});
