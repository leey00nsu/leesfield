"use client";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { memo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, useEdges, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import type { PortDefinition } from "@/shared/generation-graph/node-registry";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import {
  getNodeBananaPortLabel,
  nodeBananaNodeGeometry,
  nodeBananaNodeInventory,
} from "../../model/node-banana-node-inventory";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { MediaInputNodeControls, MediaOutputNodeControls } from "./media-node-controls";
import { ImageOperationNodeControls } from "./image-operation-node-controls";
import { NodeBananaFloatingNodeHeader } from "./node-banana-floating-node-header";
import { NodeBananaPromptEditor } from "./node-banana-prompt-editor";
import {
  VideoOperationNodeControls,
  type VideoOperationKind,
} from "./video-operation-node-controls";

type CanonicalRuntimeNode = Node<NodeBananaNodeData, string>;

function portTop(
  kind: keyof typeof nodeBananaNodeInventory,
  port: PortDefinition,
  index: number,
  count: number,
) {
  if (kind === "output.single") return { image: "35%", video: "50%", audio: "65%" }[port.id] ?? "50%";
  if (kind === "output.gallery") return { image: "40%", video: "60%", audio: "80%" }[port.id] ?? "50%";
  if (kind === "inspect.imageCompare") return port.id === "before" ? "35%" : "65%";
  if (kind === "edit.video.easeCurve") return port.id === "settings" ? "75%" : "35%";
  if (kind === "edit.video.stitch" && port.id === "soundtrack") return "90%";
  return count === 1 ? "50%" : `${((index + 1) / (count + 1)) * 100}%`;
}

function portColor(kind: keyof typeof nodeBananaNodeInventory, port: PortDefinition) {
  if (kind === "input.image" && port.direction === "input") return "#6b7280";
  if (port.valueType === "image") return "var(--handle-color-image, var(--primary))";
  if (port.valueType === "video") return "var(--handle-color-video, var(--primary))";
  if (port.valueType === "audio") return "var(--handle-color-audio, rgb(167, 139, 250))";
  if (port.valueType === "text") return "var(--handle-color-text, rgb(74, 222, 128))";
  if (port.valueType === "settings") return "rgb(190, 242, 100)";
  return "var(--primary)";
}

function PortHandle({
  kind,
  port,
  index,
  count,
  selected,
  handleId,
  label: labelOverride,
  top: topOverride,
}: {
  kind: keyof typeof nodeBananaNodeInventory;
  port: PortDefinition;
  index: number;
  count: number;
  selected: boolean;
  handleId?: string;
  label?: string;
  top?: string;
}) {
  const top = topOverride ?? portTop(kind, port, index, count);
  const input = port.direction === "input";
  const label = labelOverride ?? getNodeBananaPortLabel(kind, port);
  const accessibleLabel = port.required ? `${label}, required` : label;
  return (
    <>
      <Handle
        id={handleId ?? port.id}
        type={input ? "target" : "source"}
        position={input ? Position.Left : Position.Right}
        className="!z-20 !h-3 !w-3 !border-2 !border-neutral-900"
        data-handletype={port.valueType}
        style={{ top, background: portColor(kind, port) }}
        aria-label={accessibleLabel}
      />
      <span
        className={cn(
          "pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-neutral-400 transition-opacity",
          input ? "right-[calc(100%+8px)] text-right" : "left-[calc(100%+8px)]",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
        style={{ top }}
      >
        {label}
      </span>
    </>
  );
}

function PromptInputNodeControls({ id, data }: { id: string; data: NodeBananaNodeData }) {
  const tc = useCanvasTranslation();
  const authoring = useNodeAuthoring();
  const config = data.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Record<string, CanonicalJsonValue>
    : {};
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const incoming = authoring.getNodePromptInput?.(id) ?? { connected: false, text: null };
  const value = incoming.connected
    ? incoming.text ?? ""
    : typeof config.text === "string" ? config.text : "";
  return (
    <textarea
      data-node-banana-component="PromptNode"
      value={value}
      rows={6}
      maxLength={20_000}
      disabled={!writable || incoming.connected}
      aria-label={incoming.connected ? tc("Text from connected Prompt node") : undefined}
      placeholder={incoming.connected ? tc("Text from connected node...") : tc("Describe what to generate...")}
      className="nodrag nopan nowheel h-full min-h-[100px] w-full resize-none rounded-lg border-0 bg-neutral-800 p-3 pb-7 text-xs leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-900/70 disabled:text-neutral-400"
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        if (!incoming.connected) authoring.updateCanonicalNodeConfig?.(id, { ...config, text: event.target.value });
      }}
    />
  );
}

export const CanonicalNode = memo(function CanonicalNode({ id, data, selected }: NodeProps<CanonicalRuntimeNode>) {
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const kind = data.canonicalKind as keyof typeof nodeBananaNodeInventory;
  const geometry = nodeBananaNodeGeometry[kind] ?? { width: 320, height: 180, minWidth: 200, minHeight: 100 };
  const title = nodeBananaNodeInventory[kind]?.title ?? data.canonicalKind;
  const edges = useEdges();
  const inputs = data.ports.filter((port) => port.direction === "input");
  const outputs = data.ports.filter((port) => port.direction === "output");
  const dynamicInput = kind === "edit.image.gif"
    ? inputs.find((port) => port.id === "frames")
    : kind === "edit.video.stitch"
      ? inputs.find((port) => port.id === "clips")
      : undefined;
  const dynamicPrefix = kind === "edit.image.gif" ? "image" : "video";
  const dynamicEdges = dynamicInput
    ? edges.filter((edge) => edge.target === id && edge.targetHandle?.startsWith(`${dynamicPrefix}-`))
    : [];
  const highestDynamicIndex = dynamicEdges.reduce((highest, edge) => {
    const index = Number(edge.targetHandle?.match(/-(\d+)$/)?.[1] ?? -1);
    return Number.isFinite(index) ? Math.max(highest, index) : highest;
  }, -1);
  const dynamicHandleCount = dynamicInput ? Math.max(highestDynamicIndex + 2, 2) : 0;
  const regularInputs = dynamicInput ? inputs.filter((port) => port !== dynamicInput) : inputs;
  const isPrompt = data.canonicalKind === "input.prompt";
  const isAnnotation = data.canonicalKind === "edit.image.annotation";
  const isMediaInput = data.canonicalKind === "input.image" || data.canonicalKind === "input.audio" || data.canonicalKind === "input.video";
  const fullBleed = isPrompt || isMediaInput;
  const [editorOpen, setEditorOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const expandable = isPrompt || isAnnotation;
  const runnableFromHeader = data.canonicalKind === "edit.image.removeBackground";
  const promptConfig = data.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Record<string, CanonicalJsonValue>
    : {};
  return (
    <article
      ref={articleRef}
      className={cn(
        "group relative rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-100 shadow-lg",
        fullBleed ? "min-h-[160px] overflow-visible p-0" : "min-h-[180px] overflow-visible p-3",
        selected && "ring-2 ring-primary/40 shadow-primary/20",
        !data.supported && "border-amber-500/60",
      )}
      style={{ width: geometry.width, minHeight: geometry.height }}
      aria-label={title}
      aria-current={selected ? "true" : undefined}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={geometry.minWidth}
        minHeight={geometry.minHeight}
        lineClassName="!border-primary/45"
        handleClassName="!h-2.5 !w-2.5 !border-primary !bg-neutral-900"
      />
      <NodeBananaFloatingNodeHeader
        nodeId={id}
        title={title}
        config={data.config}
        selected={selected}
        requiredToggle={data.canonicalKind === "input.image" || data.canonicalKind === "input.audio" || data.canonicalKind === "input.prompt"}
        expandable={expandable}
        expanded={editorOpen}
        onToggleExpanded={() => setEditorOpen(true)}
        runnable={runnableFromHeader}
        onRun={() => articleRef.current?.querySelector<HTMLButtonElement>("[data-node-run]")?.click()}
      />
      {dynamicInput ? Array.from({ length: dynamicHandleCount }, (_, index) => (
        <PortHandle
          key={`${dynamicPrefix}-${index}`}
          kind={kind}
          port={dynamicInput}
          index={index}
          count={dynamicHandleCount}
          selected={selected}
          handleId={`${dynamicPrefix}-${index}`}
          label={`${kind === "edit.image.gif" ? "Frame" : "Video"} ${index + 1}`}
        />
      )) : null}
      {regularInputs.map((port, index) => <PortHandle key={port.id} kind={kind} port={port} index={index} count={regularInputs.length} selected={selected} />)}
      {outputs.map((port, index) => <PortHandle key={port.id} kind={kind} port={port} index={index} count={outputs.length} selected={selected} />)}

      {!data.supported ? (
        <div className="mt-3 rounded border border-neutral-700 bg-neutral-900/45 px-3 py-2 text-[11px] leading-5 text-neutral-400">
          {t("runtime.unsupportedDescription", { reason: data.supportReason ?? "UNKNOWN" })}
        </div>
      ) : null}
      {data.supported && data.canonicalKind === "input.prompt" ? (
        <PromptInputNodeControls id={id} data={data} />
      ) : null}
      {data.supported && data.canonicalKind === "input.image" ? (
        <MediaInputNodeControls id={id} data={data} mediaType="image" />
      ) : null}
      {data.supported && data.canonicalKind === "input.audio" ? (
        <MediaInputNodeControls id={id} data={data} mediaType="audio" />
      ) : null}
      {data.supported && data.canonicalKind === "input.video" ? (
        <MediaInputNodeControls id={id} data={data} mediaType="video" />
      ) : null}
      {data.supported && data.canonicalKind === "output.single" ? (
        <MediaOutputNodeControls id={id} kind="output.single" />
      ) : null}
      {data.supported && data.canonicalKind === "output.gallery" ? (
        <MediaOutputNodeControls id={id} kind="output.gallery" />
      ) : null}
      {data.supported && data.canonicalKind === "inspect.imageCompare" ? (
        <MediaOutputNodeControls id={id} kind="inspect.imageCompare" />
      ) : null}
      {data.supported && data.canonicalKind.startsWith("edit.image.") ? (
        <ImageOperationNodeControls
          id={id}
          data={data}
          kind={data.canonicalKind as
            | "edit.image.annotation"
            | "edit.image.resize"
            | "edit.image.removeBackground"
            | "edit.image.splitGrid"
            | "edit.image.gif"}
          editorOpen={isAnnotation ? editorOpen : undefined}
          onEditorOpenChange={isAnnotation ? setEditorOpen : undefined}
        />
      ) : null}
      {data.supported && data.canonicalKind.startsWith("edit.video.") ? (
        <VideoOperationNodeControls
          id={id}
          data={data}
          kind={data.canonicalKind as VideoOperationKind}
        />
      ) : null}
      {isPrompt ? (
        <NodeBananaPromptEditor
          open={editorOpen}
          initialPrompt={typeof promptConfig.text === "string" ? promptConfig.text : ""}
          onClose={() => setEditorOpen(false)}
          onSubmit={(text) => authoring.updateCanonicalNodeConfig?.(id, { ...promptConfig, text })}
        />
      ) : null}
    </article>
  );
});

export const UnsupportedCanonicalNode = CanonicalNode;
