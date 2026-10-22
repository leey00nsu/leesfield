"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createSpaceEditorSession } from "@/features/node-studio/model/space-editor-store";
import { createSpaceFlowProjection, type SpaceFlowNode } from "@/features/node-studio/model/space-editor-flow";
import { spaceHandleId } from "@/features/node-studio/model/space-editor-ports";
import type { SpaceEditorDocument } from "@/features/node-studio/model/space-editor-types";
import { SpaceEditorProvider, useSpaceEditor, useSpaceSelector } from "@/features/node-studio/ui/space-editor-provider";
import { SpaceNodeShell } from "@/features/node-studio/ui/nodes/space-node-shell";
import { SpaceNodeHeader } from "@/features/node-studio/ui/nodes/space-node-header";
import { SpaceMediaPreview } from "@/features/node-studio/ui/nodes/space-media-preview";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { CanvasProviders } from "@/shared/ui/canvas-providers";
import styles from "./landing-spaces-canvas.module.css";

const demoModels = [
  { id: "krea", title: "Krea 2", image: "krea-2.png" },
  { id: "gpt", title: "GPT Image 2", image: "gpt-image-2.png" },
  { id: "zimage", title: "Z-Image", image: "z-image.png" },
] as const;

const demoAssets: readonly MediaAssetDto[] = demoModels.map((model, index) => ({
  id: "landing-" + model.id,
  displayName: "Result " + String.fromCharCode(65 + index),
  version: 1,
  type: "image",
  status: "completed",
  origin: "generation",
  mimeType: "image/png",
  bytes: null,
  width: null,
  height: null,
  durationMs: null,
  sourceOperationId: null,
  url: "/assets/landing-comparison/" + model.image,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
}));

/** The demo uses the same canonical node/port contract as a saved Space. */
export function createDemoGraph(prompt: string): SpaceEditorDocument {
  return {
    schemaVersion: 3,
    title: "Landing comparison",
    groups: [],
    nodes: [
      {
        id: "prompt",
        kind: "input.prompt",
        position: { x: 0, y: 370 },
        configVersion: 1,
        selectedOutputAssetId: null,
        config: { text: prompt, presentation: { customTitle: "Prompt" } },
      },
      ...demoModels.flatMap((model, index): SpaceEditorDocument["nodes"] => [
        {
          id: model.id,
          kind: "generate.image",
          position: { x: 470, y: index * 320 + 55 },
          configVersion: 1,
          selectedOutputAssetId: null,
          config: { modelKey: model.id, prompt, parameters: {}, presentation: { customTitle: model.title } },
        },
        {
          id: model.id + "-result",
          kind: "input.image",
          position: { x: 920, y: index * 320 },
          configVersion: 1,
          selectedOutputAssetId: null,
          config: { assetId: demoAssets[index].id, presentation: { customTitle: "Result " + String.fromCharCode(65 + index) } },
        },
      ]),
    ],
    edges: demoModels.flatMap(model => [
      { id: "prompt-" + model.id, sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: model.id, targetPortId: "prompt", sortOrder: 0 },
      { id: model.id + "-result", sourceNodeId: model.id, sourcePortId: "image", targetNodeId: model.id + "-result", targetPortId: "reference", sortOrder: 0 },
    ]),
  };
}

function downloadDemoAsset(asset: MediaAssetDto) {
  const link = document.createElement("a");
  link.href = asset.url;
  link.download = asset.url.split("/").at(-1) ?? "result.png";
  link.click();
}

function DemoNode({ data, selected }: NodeProps<SpaceFlowNode>) {
  const tc = useCanvasTranslation(), scope = useSpaceEditor();
  const node = useSpaceSelector(state => state.nodeById.get(data.nodeId));
  if (!node) return null;
  const model = demoModels.find(model => model.id === node.id);
  const asset = demoAssets.find(asset => asset.id === "landing-" + node.id.replace(/-result$/, ""));
  const prompt = node.kind === "input.prompt";
  const result = node.kind === "input.image";
  const text = prompt ? (node.config as { text: string }).text : scope.inputs.promptInput(node.id).text ?? "";
  const title = prompt ? "Prompt" : result ? "Image Input" : "Generate Image";
  const customTitle = (node.config as { presentation?: { customTitle?: string } }).presentation?.customTitle;

  return <SpaceNodeShell id={node.id} kind={node.kind} selected={selected} writable={false}
    fullBleed contentClassName={styles.content}
    header={<SpaceNodeHeader id={node.id} title={title} customTitle={customTitle} writable={false} selected={selected} />}>
    {!prompt && <Handle type="target" position={Position.Left} isConnectable={false}
      id={spaceHandleId({ direction: "input", portId: result ? "reference" : "prompt" })} className={styles.port} />}
    {!result && <Handle type="source" position={Position.Right} isConnectable={false}
      id={spaceHandleId({ direction: "output", portId: prompt ? "text" : "image" })} className={styles.port} />}
    {result && asset ? <SpaceMediaPreview asset={asset} active selected={selected} onDownload={downloadDemoAsset} />
      : prompt ? <div className={styles.promptBody}>
        <AppTextarea readOnly tabIndex={-1} value={text} aria-label={tc("Prompt text")} className={styles.prompt} />
        <div className={styles.promptFooter}>{tc("Add variable")}</div>
      </div> : <div className={styles.modelBody}>
        <label className={styles.modelForm}>
          <span className={styles.promptLabel}>{tc("Prompt")}</span>
          <AppTextarea readOnly tabIndex={-1} value={text} aria-label={model?.title + " · " + tc("Prompt")} className={styles.modelPrompt} />
          <span className={styles.connectedLabel}>{tc("Controlled by connected Prompt node")}</span>
        </label>
        <div className={styles.modelEmpty}>{tc("Run to generate")}</div>
      </div>}
  </SpaceNodeShell>;
}

const nodeTypes = { space: DemoNode };

function LandingSpacesCanvasContent({ prompt, label }: { prompt: string; label: string }) {
  const [session] = useState(() => createSpaceEditorSession({ id: "landing-demo", version: 1, document: createDemoGraph(prompt), writable: false }));
  const initial = useMemo(() => {
    const projection = createSpaceFlowProjection()(session.getSnapshot());
    return {
      nodes: projection.nodes.map(node => {
        const height = node.data.nodeId === "prompt" ? 140 : node.data.nodeId.endsWith("-result") ? 280 : 190;
        // Only this disposable view moves. The canonical demo stays read-only.
        return { ...node, draggable: true, width: 330, height, style: { width: 330, height } };
      }),
      edges: projection.edges.map(edge => ({ ...edge, type: "default", style: { stroke: "#71717a", strokeWidth: 1.5 } })),
    };
  }, [session]);
  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);

  return <SpaceEditorProvider session={session}>
    <div data-testid="landing-spaces-canvas" className={styles.canvas} aria-label={label}>
      <ReactFlowProvider><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodesDraggable nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
        noDragClassName="landing-demo-no-drag"
        fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} maxZoom={1.5}
        panOnScroll={false} zoomOnScroll={false} zoomOnDoubleClick={false} preventScrolling={false}
        deleteKeyCode={null} colorMode="dark">
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#36363b" />
      </ReactFlow></ReactFlowProvider>
    </div>
  </SpaceEditorProvider>;
}

export default function LandingSpacesCanvas() {
  const t = useTranslations("inferenceLanding.spaces"), prompt = t("prompt");
  return <CanvasProviders><LandingSpacesCanvasContent key={prompt} prompt={prompt} label={t("canvas")} /></CanvasProviders>;
}
