"use client";
import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  NodeBananaUpstreamNode,
  NodeBananaUpstreamHeader,
  NodeBananaUpstreamHostProvider,
} from "@node-banana-runtime/runtime-entry";
import "@xyflow/react/dist/style.css";
import styles from "@/features/node-studio/ui/node-banana-studio.module.css";
type Host = NonNullable<ComponentProps<typeof NodeBananaUpstreamNode>["host"]>;
const DemoHost = createContext<Host>({});
function DemoNode(props: NodeProps) {
  const host = useContext(DemoHost);
  return (
    <>
      <NodeBananaUpstreamNode {...props} host={host} />
      {props.id !== "prompt" && (
        <Handle
          type="target"
          position={Position.Left}
          id="demo-in"
          className="landing-comparison-port"
        />
      )}
      {!props.id.endsWith("-result") && (
        <Handle
          type="source"
          position={Position.Right}
          id="demo-out"
          className="landing-comparison-port"
        />
      )}
    </>
  );
}
const nodeTypes = { demo: DemoNode };
export function createDemoGraph(prompt: string) {
  const models = [
    { id: "krea", title: "Krea 2", image: "krea-2.png" },
    { id: "gpt", title: "GPT Image 2", image: "gpt-image-2.png" },
    { id: "zimage", title: "Z-Image", image: "z-image.png" },
  ];
  const nodes: Node[] = [
    {
      id: "prompt",
      type: "demo",
      position: { x: 0, y: 370 },
      style: { width: 330, height: 140 },
      data: {
        canonicalKind: "input.prompt",
        config: { text: prompt },
        presentation: { customTitle: "Prompt" },
      },
    },
    ...models.flatMap((model, index): Node[] => [
      {
        id: model.id,
        type: "demo",
        position: { x: 470, y: index * 320 + 55 },
        style: { width: 330, height: 190 },
        data: {
          canonicalKind: "generate.image",
          config: { modelKey: model.id, prompt, parameters: {} },
          promptConnected: true,
          presentation: { customTitle: model.title },
        },
      },
      {
        id: model.id + "-result",
        type: "demo",
        position: { x: 920, y: index * 320 },
        style: { width: 330, height: 280 },
        data: {
          canonicalKind: "input.image",
          image: "/assets/landing-comparison/" + model.image,
          presentation: {
            customTitle: "Result " + String.fromCharCode(65 + index),
          },
        },
      },
    ]),
  ];
  for (const node of nodes) {
    node.data.config = {
      ...((node.data.config as Record<string, unknown>) ?? {}),
      presentation: node.data.presentation,
    };
  }
  return {
    nodes,
    edges: models.flatMap((model) => [
      {
        id: "prompt-" + model.id,
        source: "prompt",
        target: model.id,
        sourceHandle: "demo-out",
        targetHandle: "demo-in",
        style: { stroke: "#71717a", strokeWidth: 1.5 },
      },
      {
        id: model.id + "-result",
        source: model.id,
        target: model.id + "-result",
        sourceHandle: "demo-out",
        targetHandle: "demo-in",
        style: { stroke: "#71717a", strokeWidth: 1.5 },
      },
    ]),
  };
}

export default function LandingSpacesCanvas() {
  const t = useTranslations("inferenceLanding.spaces");
  const initial = useMemo(() => createDemoGraph(t("prompt")), [t]);
  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const host = useMemo<Host>(
    () => ({ writable: false, nodes, edges }),
    [nodes, edges],
  );
  return (
    <div
      data-testid="landing-spaces-canvas"
      className={styles.runtime + " landing-comparison-canvas h-full w-full"}
      aria-label={t("canvas")}
    >
      <NodeBananaUpstreamHostProvider value={host}>
        <DemoHost value={host}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodesConnectable={false}
            noDragClassName="landing-demo-no-drag"
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={1.5}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            deleteKeyCode={null}
            colorMode="dark"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="#36363b"
            />
            <ViewportPortal>
              {nodes.map((node) => (
                <NodeBananaUpstreamHeader
                  key={node.id}
                  runtimeData={{
                    ...node.data,
                    id: node.id,
                    customTitle: (
                      node.data.presentation as { customTitle: string }
                    ).customTitle,
                  }}
                  position={node.position}
                  width={Number(node.style?.width ?? 300)}
                  host={host}
                  runReady={false}
                />
              ))}
            </ViewportPortal>
          </ReactFlow>
        </DemoHost>
      </NodeBananaUpstreamHostProvider>
    </div>
  );
}
