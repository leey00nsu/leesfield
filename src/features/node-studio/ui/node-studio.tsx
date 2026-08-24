"use client";

import { useCallback, useRef, useState } from "react";
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
import { flowToUpdateGraph, graphSnapshotToFlow } from "../lib/graph-adapter";
import { validateFlowConnection } from "../lib/connection-validation";
import { nodeRegistry, nodeTypes } from "../model/node-registry";
import { NodeStudioToolbar } from "./node-studio-toolbar";

type NodeStudioProps = {
  graph: GenerationGraphSnapshotDto;
  onDraftChange: (draft: UpdateGenerationGraphDto) => void;
};

export function NodeStudio({ graph, onDraftChange }: NodeStudioProps) {
  const t = useTranslations("nodeStudio");
  const initial = graphSnapshotToFlow(graph);
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const nodesRef = useRef(initial.nodes);
  const edgesRef = useRef(initial.edges);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const instanceRef = useRef<ReactFlowInstance<ImageGenerationFlowNode, GenerationGraphFlowEdge> | null>(null);

  const publish = useCallback(
    (nextNodes: ImageGenerationFlowNode[], nextEdges: GenerationGraphFlowEdge[]) => {
      onDraftChange(flowToUpdateGraph(graph.title, graph.version, nextNodes, nextEdges));
    },
    [graph.title, graph.version, onDraftChange],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<ImageGenerationFlowNode>[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        nodesRef.current = next;
        publish(next, edgesRef.current);
        return next;
      });
    },
    [publish],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<GenerationGraphFlowEdge>[]) => {
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        edgesRef.current = next;
        publish(nodesRef.current, next);
        return next;
      });
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
            : { stroke: "var(--accent-purple)", strokeWidth: 2, strokeDasharray: "6 5" },
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

  return (
    <section className="relative h-[calc(100dvh-10.5rem)] min-h-[34rem] overflow-hidden rounded-3xl border border-white/10 bg-creative-surface-muted">
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
        fitView
        minZoom={0.2}
        maxZoom={2}
        className="node-studio-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.12)" />
        <Controls position="bottom-right" showInteractive={false} />
        <Panel position="top-left">
          <NodeStudioToolbar
            onAddImageNode={addImageNode}
            onFitView={() => void instanceRef.current?.fitView({ padding: 0.2, duration: 250 })}
          />
        </Panel>
      </ReactFlow>

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
