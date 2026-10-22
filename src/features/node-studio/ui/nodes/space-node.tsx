"use client";

import { useMemo } from "react";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { useSpaceSelector } from "../space-editor-provider";
import { SpaceTextNode } from "./space-node-text";
import { SpaceMediaInputNode } from "./space-node-media";
import { SpaceNodeAuthoringProvider } from "./space-node-authoring-provider";
import { SpaceGenerationNode } from "./space-node-generation";
import { SpaceAssistantNode } from "./space-node-assistant";
import { SpaceVideoNode } from "./space-node-video";
import { SpaceResizeNode } from "./space-node-resize";
import { SpaceOutputNode } from "./space-node-output";
import { SpaceGalleryNode } from "./space-node-gallery";
import { SpaceCompareNode } from "./space-node-compare";
import { SpaceRetiredNode } from "./space-node-retired";

/** One presenter per supported kind; opaque/retired content never enters an editor. */
export function SpaceNode({ nodeId }: { nodeId: string }) {
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const kind = node?.kind, configVersion = node?.configVersion, config = node?.config;
  const supported = useMemo(() => Boolean(kind && configVersion !== undefined && validateNodeConfig(kind, configVersion, config).supported), [kind, configVersion, config]);
  if (!kind) return null;
  if (!supported || isUnavailableEditNodeKind(kind)) return <SpaceRetiredNode nodeId={nodeId} />;
  if (["note.memo", "input.prompt", "process.promptConstructor"].includes(kind)) return <SpaceTextNode nodeId={nodeId} />;
  if (["input.image", "input.audio", "input.video"].includes(kind)) return <SpaceMediaInputNode nodeId={nodeId} />;
  if (["generate.image", "generate.audio", "generate.video"].includes(kind)) return <SpaceNodeAuthoringProvider nodeId={nodeId}><SpaceGenerationNode nodeId={nodeId} /></SpaceNodeAuthoringProvider>;
  if (kind === "generate.assistant") return <SpaceAssistantNode nodeId={nodeId} />;
  if (kind === "edit.image.resize") return <SpaceNodeAuthoringProvider nodeId={nodeId}><SpaceResizeNode nodeId={nodeId} /></SpaceNodeAuthoringProvider>;
  if (kind === "output.single") return <SpaceOutputNode nodeId={nodeId} />;
  if (kind === "output.gallery") return <SpaceGalleryNode nodeId={nodeId} />;
  if (kind === "inspect.imageCompare") return <SpaceCompareNode nodeId={nodeId} />;
  if (["edit.video.stitch", "edit.video.trim", "edit.video.extractFrames"].includes(kind)) return <SpaceNodeAuthoringProvider nodeId={nodeId}><SpaceVideoNode nodeId={nodeId} /></SpaceNodeAuthoringProvider>;
  return <SpaceRetiredNode nodeId={nodeId} />;
}
