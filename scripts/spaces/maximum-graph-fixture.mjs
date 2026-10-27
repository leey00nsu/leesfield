export const NODE_LIMIT = 500;
export const EDGE_LIMIT = 2_000;
export const GROUP_LIMIT = 500;
const SOURCE_COUNT = 250;
const INPUTS_PER_CONSTRUCTOR = 8;
const COLORS = ["neutral", "blue", "green", "purple", "orange", "red"];

function fixtureId(graph, label) {
  return `${graph.id}-${label}`;
}

export function maximumGraph(graph) {
  const nodes = Array.from({ length: NODE_LIMIT }, (_, index) => {
    const source = index < SOURCE_COUNT;
    const localIndex = index % SOURCE_COUNT;
    return {
      id: fixtureId(graph, `${source ? "prompt" : "constructor"}-${localIndex}`),
      kind: source ? "input.prompt" : "process.promptConstructor",
      configVersion: 1,
      position: { x: (index % 25) * 480, y: Math.floor(index / 25) * 440 },
      config: source ? {
        text: `Boundary source ${localIndex}`,
        variableName: `source_${localIndex}`,
        presentation: { comment: `Source comment ${localIndex}`, isOptional: false },
      } : {
        template: `Boundary constructor ${localIndex}: @source_${localIndex} / @missing`,
        presentation: { comment: `Constructor comment ${localIndex}` },
        // Template provenance can outlive its original Split node. Preserve it
        // as opaque config, as with the existing saved-document fixtures.
        templateSource: {
          nodeId: fixtureId(graph, "historical-split"),
          localNodeId: fixtureId(graph, "template-constructor"),
          index: localIndex,
        },
      },
      selectedOutputAssetId: null,
    };
  });
  // Each constructor has eight distinct, ordered incoming text connections.
  // Sources have no incoming edges, so this remains a valid canonical DAG.
  const edges = Array.from({ length: EDGE_LIMIT }, (_, index) => {
    const constructor = Math.floor(index / INPUTS_PER_CONSTRUCTOR);
    const sortOrder = index % INPUTS_PER_CONSTRUCTOR;
    return {
      id: fixtureId(graph, `edge-${index}`),
      sourceNodeId: nodes[(constructor + sortOrder) % SOURCE_COUNT].id,
      sourcePortId: "text",
      targetNodeId: nodes[SOURCE_COUNT + constructor].id,
      targetPortId: "text",
      sortOrder,
      ...(sortOrder === INPUTS_PER_CONSTRUCTOR - 1 ? { hasPause: true } : {}),
    };
  });
  const groups = nodes.map((node, index) => ({
    id: fixtureId(graph, `group-${index}`),
    title: `Boundary group ${index}`,
    color: COLORS[index % COLORS.length],
    bounds: { x: node.position.x - 24, y: node.position.y - 40, width: 400, height: 400 },
    locked: index % 3 === 0,
    memberNodeIds: [node.id],
  }));
  return { schemaVersion: 3, expectedVersion: graph.version, title: graph.title, nodes, edges, groups };
}

