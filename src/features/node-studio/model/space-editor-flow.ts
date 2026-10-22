import type { Edge, Node } from "@xyflow/react";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { isTemporarilyHiddenEditNodeKind } from "@/shared/generation-graph/node-availability";
import { spaceNodeSize as measuredSpaceNodeSize } from "./space-editor-groups";
import { spaceHandleId } from "./space-editor-ports";
import type { SpaceEditorState } from "./space-editor-store";

export type SpaceFlowNode = Node<{ nodeId: string }, "space">;
export type SpaceFlowEdge = Edge<{ edgeId: string }, "space">;
/** IDs are encoded only in the disposable Flow view; canonical IDs remain untouched. */
export const spaceFlowId = (id: string) => encodeURIComponent(id);
export const canonicalSpaceId = (id: string) => decodeURIComponent(id);

export function spaceNodeSize(node: CanonicalNode, state: Pick<SpaceEditorState, "geometryByNode">) {
  const size = measuredSpaceNodeSize(node, state.geometryByNode);
  return { width: size.width, height: size.height };
}

/** A cached, disposable view. Domain config and handle IDs never become a second graph. */
export function createSpaceFlowProjection() {
  let nodeCache = new Map<string, SpaceFlowNode>();
  let edgeCache = new Map<string, { canonical: SpaceEditorState["document"]["edges"][number]; view: SpaceFlowEdge }>();
  let nodes: SpaceFlowNode[] = [], edges: SpaceFlowEdge[] = [];
  let snapshot = { nodes, edges };
  let previousState: SpaceEditorState | undefined;
  return (state: SpaceEditorState) => {
    if (previousState && previousState.document.nodes === state.document.nodes && previousState.document.edges === state.document.edges
      && previousState.document.groups === state.document.groups && previousState.selectedNodeIds === state.selectedNodeIds
      && previousState.selectedEdgeIds === state.selectedEdgeIds && previousState.geometryByNode === state.geometryByNode
      && previousState.gesture === state.gesture && previousState.writable === state.writable) return snapshot;
    previousState = state;
    const selectedNodes = new Set(state.selectedNodeIds), selectedEdges = new Set(state.selectedEdgeIds);
    const gesture = state.gesture;
    const movingGroup = gesture?.kind === "group.move" ? state.document.groups.find(group => group.id === gesture.groupId) : null;
    const movedMembers = new Set(movingGroup?.memberNodeIds);
    const hiddenNodeIds = new Set(state.document.nodes.filter(node => isTemporarilyHiddenEditNodeKind(node.kind)).map(node => node.id));
    const nextNodeCache = new Map<string, SpaceFlowNode>();
    const projectedNodes = state.document.nodes.filter(node => !hiddenNodeIds.has(node.id)).map(node => {
      let position = node.position;
      if (state.gesture?.kind === "nodes" && Object.hasOwn(state.gesture.positions, node.id)) position = state.gesture.positions[node.id];
      if (state.gesture?.kind === "group.move" && movedMembers.has(node.id)) position = { x: node.position.x + state.gesture.delta.x, y: node.position.y + state.gesture.delta.y };
      const size = spaceNodeSize(node, state), selected = selectedNodes.has(node.id), previous = nodeCache.get(node.id);
      const dragging = Boolean(state.gesture?.kind === "nodes" && state.gesture.nodeIds.includes(node.id));
      const view = previous && previous.position.x === position.x && previous.position.y === position.y
        && previous.width === size.width && previous.height === size.height && previous.selected === selected
        && previous.draggable === state.writable && previous.dragging === dragging ? previous : {
          id: spaceFlowId(node.id), type: "space" as const, data: previous?.data ?? { nodeId: node.id }, position,
          width: size.width, height: size.height, style: size, selected, dragging,
          draggable: state.writable, connectable: state.writable, className: "space-flow-node",
        };
      nextNodeCache.set(node.id, view);
      return view;
    });
    const nextEdgeCache = new Map<string, { canonical: SpaceEditorState["document"]["edges"][number]; view: SpaceFlowEdge }>();
    const projectedEdges = state.document.edges.filter(edge => !hiddenNodeIds.has(edge.sourceNodeId) && !hiddenNodeIds.has(edge.targetNodeId)).map(edge => {
      const previous = edgeCache.get(edge.id), selected = selectedEdges.has(edge.id);
      const view = previous?.canonical === edge && previous.view.selected === selected ? previous.view : {
        id: spaceFlowId(edge.id), type: "space" as const, data: previous?.view.data ?? { edgeId: edge.id },
        source: spaceFlowId(edge.sourceNodeId), sourceHandle: spaceHandleId({ direction: "output", portId: edge.sourcePortId }),
        target: spaceFlowId(edge.targetNodeId), targetHandle: spaceHandleId({ direction: "input", portId: edge.targetPortId }),
        selected, animated: false, className: edge.hasPause ? "space-edge-paused" : undefined,
      };
      nextEdgeCache.set(edge.id, { canonical: edge, view });
      return view;
    });
    nodeCache = nextNodeCache; edgeCache = nextEdgeCache;
    if (nodes.length !== projectedNodes.length || projectedNodes.some((node, index) => node !== nodes[index])) nodes = projectedNodes;
    if (edges.length !== projectedEdges.length || projectedEdges.some((edge, index) => edge !== edges[index])) edges = projectedEdges;
    if (snapshot.nodes !== nodes || snapshot.edges !== edges) snapshot = { nodes, edges };
    return snapshot;
  };
}
