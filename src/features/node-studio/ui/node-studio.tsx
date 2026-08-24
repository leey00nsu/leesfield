"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useTranslations } from "next-intl";

import type { GenerationGraphSnapshotDto, UpdateGenerationGraphDto } from "../model/graph-types";
import type { GenerationGraphFlowEdge, ImageGenerationFlowNode } from "../model/flow-types";
import type { NodeAuthoringCatalogState } from "../model/node-authoring-context";
import { NodeAuthoringProvider } from "../model/node-authoring-context";
import { flowToUpdateGraph, graphSnapshotToFlow } from "../lib/graph-adapter";
import { validateFlowConnection } from "../lib/connection-validation";
import {
  deleteImageNode,
  duplicateImageNode,
  replaceImageNodeConfig,
} from "../lib/image-node-config";
import { nodeRegistry, nodeTypes } from "../model/node-registry";
import { NodeStudioToolbar, type NodeStudioToolMode } from "./node-studio-toolbar";

type NodeStudioProps = {
  graph: GenerationGraphSnapshotDto;
  onDraftChange: (draft: UpdateGenerationGraphDto) => void;
  catalog?: NodeAuthoringCatalogState;
};

const emptyCatalog: NodeAuthoringCatalogState = {
  imageModels: [],
  isLoading: false,
  error: null,
  retry: () => undefined,
};

export function NodeStudio({ graph, onDraftChange, catalog = emptyCatalog }: NodeStudioProps) {
  const t = useTranslations("nodeStudio");
  const initial = graphSnapshotToFlow(graph);
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const nodesRef = useRef(initial.nodes);
  const edgesRef = useRef(initial.edges);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<NodeStudioToolMode>("select");
  const instanceRef = useRef<ReactFlowInstance<ImageGenerationFlowNode, GenerationGraphFlowEdge> | null>(null);

  const publish = useCallback(
    (nextNodes: ImageGenerationFlowNode[], nextEdges: GenerationGraphFlowEdge[]) => {
      onDraftChange(flowToUpdateGraph(graph.title, graph.version, nextNodes, nextEdges));
    },
    [graph.title, graph.version, onDraftChange],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<ImageGenerationFlowNode>[]) => {
      const next = applyNodeChanges(changes, nodesRef.current);
      nodesRef.current = next;
      setNodes(next);
      publish(next, edgesRef.current);
    },
    [publish],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<GenerationGraphFlowEdge>[]) => {
      const next = applyEdgeChanges(changes, edgesRef.current);
      edgesRef.current = next;
      setEdges(next);
      publish(nodesRef.current, next);
    },
    [publish],
  );

  const isValidConnection = useCallback<IsValidConnection<GenerationGraphFlowEdge>>(
    (connection) => {
      const result = validateFlowConnection(nodes, edges, connection);
      if (!result.valid) setValidationMessage(t(`validation.${result.issues[0]?.code ?? "UNKNOWN"}`));
      return result.valid;
    },
    [edges, nodes, t],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = validateFlowConnection(nodes, edges, connection);
      if (!result.valid || !result.kind) return;
      const nextEdge: GenerationGraphFlowEdge = {
        ...connection,
        id: crypto.randomUUID(),
        data: { kind: result.kind },
        label: result.kind === "primary" ? "Primary" : "Reference",
        ariaLabel: `${result.kind} connection`,
        style:
          result.kind === "primary"
            ? { stroke: "var(--primary)", strokeWidth: 2 }
            : { stroke: "rgba(255,255,255,0.48)", strokeWidth: 2, strokeDasharray: "6 5" },
      };
      const next = addEdge(nextEdge, edges);
      edgesRef.current = next;
      setEdges(next);
      setValidationMessage(null);
      publish(nodes, next);
    },
    [edges, nodes, publish],
  );

  const addImageNode = useCallback(() => {
    const position = instanceRef.current?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }) ?? { x: 80, y: 80 };
    const next = [...nodes, nodeRegistry.imageGeneration.create(crypto.randomUUID(), position)];
    nodesRef.current = next;
    setNodes(next);
    publish(next, edges);
  }, [edges, nodes, publish]);

  const updateImageNodeConfig = useCallback(
    (nodeId: string, config: ImageGenerationFlowNode["data"]["config"]) => {
      const next = replaceImageNodeConfig(nodesRef.current, nodeId, config);
      if (next === nodesRef.current) return;
      nodesRef.current = next;
      setNodes(next);
      publish(next, edgesRef.current);
    },
    [publish],
  );

  const handleDuplicateImageNode = useCallback(
    (nodeId: string) => {
      const next = duplicateImageNode(
        nodesRef.current,
        nodeId,
        crypto.randomUUID(),
      );
      if (next === nodesRef.current) return;
      nodesRef.current = next;
      setNodes(next);
      publish(next, edgesRef.current);
    },
    [publish],
  );

  const handleDeleteImageNode = useCallback(
    (nodeId: string) => {
      const next = deleteImageNode(
        nodesRef.current,
        edgesRef.current,
        nodeId,
      );
      if (next.nodes.length === nodesRef.current.length) return;
      nodesRef.current = next.nodes;
      edgesRef.current = next.edges;
      setNodes(next.nodes);
      setEdges(next.edges);
      publish(next.nodes, next.edges);
    },
    [publish],
  );

  const authoringContext = useMemo(
    () => ({
      ...catalog,
      updateImageNodeConfig,
      duplicateImageNode: handleDuplicateImageNode,
      deleteImageNode: handleDeleteImageNode,
    }),
    [
      catalog,
      handleDeleteImageNode,
      handleDuplicateImageNode,
      updateImageNodeConfig,
    ],
  );

  return (
    <section className="relative h-[min(58rem,calc(100dvh-8rem))] min-h-[42rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)]">
      <NodeAuthoringProvider value={authoringContext}>
        <ReactFlow<ImageGenerationFlowNode, GenerationGraphFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          instanceRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        deleteKeyCode={["Backspace", "Delete"]}
        nodesDraggable={toolMode === "select"}
        elementsSelectable={toolMode === "select"}
        selectionOnDrag={toolMode === "select"}
        panOnDrag={toolMode === "pan"}
        fitView
        minZoom={0.2}
        maxZoom={2}
        className={toolMode === "pan" ? "node-studio-flow cursor-grab active:cursor-grabbing" : "node-studio-flow"}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.1)" />
        <Controls position="bottom-right" showInteractive={false} />
        <Panel position="top-left">
          <NodeStudioToolbar
            mode={toolMode}
            onModeChange={setToolMode}
            onAddImageNode={addImageNode}
          />
        </Panel>
        </ReactFlow>
      </NodeAuthoringProvider>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-sm rounded-3xl border border-white/10 bg-background-dark/72 p-8 backdrop-blur-xl">
            <h2 className="font-display text-2xl">{t("empty.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">{t("empty.description")}</p>
          </div>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {validationMessage}
      </p>
    </section>
  );
}
