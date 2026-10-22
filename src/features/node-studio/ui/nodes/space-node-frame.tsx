"use client";
import { useContext, useLayoutEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { findNodeDefinition, validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { NodeTextEditorScope } from "@/shared/ui/node-text-editor";
import { findSpaceNodeCatalogItem } from "../../model/space-editor-catalog";
import { spaceNodePorts, type SpaceNodePort as SpaceNodePortDefinition } from "../../model/space-editor-ports";
import { resolveNodeRunReadiness, getPrimaryNodeRunReadinessReason } from "../../model/node-run-readiness";
import { SpacePortMenuContext, useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector } from "../space-editor-provider";
import { SpaceNodeHeader } from "./space-node-header";
import { SpaceNodeShell } from "./space-node-shell";
import { SpaceNodePort } from "./space-node-port";
import { SpaceNodeExecutionStatus, useSpaceNodeExecutionState } from "./space-node-execution-status";
import { spaceFlowId } from "../../model/space-editor-flow";
import { hasSpaceMediaUpload } from "../../model/space-editor-media";
import { usePendingReferenceUploads } from "@/shared/ui/reference-upload-scope";
import { spaceCommentNavigation, useSpaceComments } from "../../hook/use-space-comments";
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function invokeService(action: () => unknown, report?: (error: Error) => void) {
  const failed = (error: unknown) => report?.(error instanceof Error ? error : new Error(String(error)));
  try { void Promise.resolve(action()).catch(failed); } catch (error) { failed(error); }
}

function SpaceNodeContacts({ id, ports, connections, writable }: {
  id: string; ports: SpaceNodePortDefinition[]; connections: boolean[]; writable: boolean;
}) {
  const tc = useCanvasTranslation(), onActivate = useContext(SpacePortMenuContext), updateInternals = useUpdateNodeInternals();
  const inputPorts = ports.filter(port => port.definition.direction === "input" && port.visible);
  const outputPorts = ports.filter(port => port.definition.direction === "output" && port.visible);
  const topFor = (port: SpaceNodePortDefinition) => {
    const visible = port.definition.direction === "input" ? inputPorts : outputPorts;
    return 48 + Math.max(0, visible.findIndex(anchor => anchor.definition.id === port.anchorPortId)) * 40;
  };
  const signature = ports.map(port => `${port.definition.direction}:${port.definition.id}:${topFor(port)}`).join("|");
  useLayoutEffect(() => { updateInternals(spaceFlowId(id)); }, [id, signature, updateInternals]);
  return <>{ports.map((port, index) => <SpaceNodePort key={port.definition.direction + ":" + port.definition.id}
    reference={{ nodeId: id, portId: port.definition.id, direction: port.definition.direction }} valueType={port.definition.valueType}
    label={tc(port.label)} position={topFor(port)} connectable={writable && port.connectable} visible={port.visible} anchorPortId={port.anchorPortId}
    connected={connections[index]} onActivate={onActivate} />)}</>;
}

/** Bodies subscribe to their own canonical/input/runtime slices, never the full Flow graph. */
export function SpaceNodeFrame({ nodeId: id, children, settingsExpanded, settingsPanel, headerButtons, alwaysVisibleButtons, fullBleed, contentClassName, className, style, onAspectFit }: {
  nodeId: string; children: ReactNode; settingsExpanded?: boolean; settingsPanel?: ReactNode; headerButtons?: ReactNode; alwaysVisibleButtons?: ReactNode;
  fullBleed?: boolean; contentClassName?: string; className?: string; style?: CSSProperties; onAspectFit?: () => void;
}) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation(), t = useTranslations("nodeStudio");
  const comments = useSpaceComments();
  const node = useSpaceSelector(state => state.nodeById.get(id));
  const selected = useSpaceSelector(state => state.selectedNodeIds.includes(id));
  const singleSelected = useSpaceSelector(state => state.selectedNodeIds.length === 1 && state.selectedNodeIds[0] === id);
  const hovered = useSpaceSelector(state => state.hoveredNodeId === id);
  const writable = useSpaceSelector(state => state.writable);
  const runtime = useSpaceSelector(state => state.runtimeByNode.get(id));
  const executionState = useSpaceNodeExecutionState(node, runtime);
  const inputUploading = useSpaceSelector(hasSpaceMediaUpload), referenceUploading = usePendingReferenceUploads("space:");
  const uploading = inputUploading || referenceUploading;
  const portRevision = useSpaceViewSelector(state => state.portRevisionByNode.get(id) ?? 0);
  const catalog = useSpaceViewSelector(state => state.catalog);
  const services = useSpaceViewSelector(state => state.services);
  const bodyHeight = useSpaceViewSelector(state => state.bodyHeightByNode.get(id));
  const kind = node?.kind, configVersion = node?.configVersion, rawConfig = node?.config;
  const supported = useMemo(() => Boolean(kind && configVersion !== undefined && validateNodeConfig(kind, configVersion, rawConfig).supported), [kind, configVersion, rawConfig]);
  const { ports, connections } = useSpaceResolvedInput(id, inputs => {
    const document = scope.session.getDocument();
    const ports = spaceNodePorts(document, id, catalog);
    const connections = ports.map(port => port.definition.direction === "input" ? inputs.incomingEdges(id, port.definition.id).length > 0
      : document.edges.some(edge => edge.sourceNodeId === id && edge.sourcePortId === port.definition.id));
    // Outgoing edge changes have a separate node-scoped revision from resolved inputs.
    return { ports, connections, portRevision };
  });
  const retired = kind ? isUnavailableEditNodeKind(kind) : false;
  const runKind = kind ? findNodeDefinition(kind)?.executionMode : undefined;
  const runnable = Boolean(supported && runKind && runKind !== "none" && !retired && services.runNode);
  const readiness = useSpaceResolvedInput(id, () => {
    if (!runnable) return { ready: false, reasons: [] };
    const inputRuntime = scope.getInputRuntime();
    return resolveNodeRunReadiness(scope.session.getDocument(), id, { ...catalog, assistantResults: inputRuntime.assistantResults,
      mediaOutputs: inputRuntime.mediaOutputs ? Object.fromEntries(inputRuntime.mediaOutputs) : undefined });
  });
  if (!node) return null;
  const item = findSpaceNodeCatalogItem(node.kind), config = record(node.config), presentation = record(config.presentation);
  const executing = executionState.active;
  const blockedReason = getPrimaryNodeRunReadinessReason(readiness);
  const patchPresentation = (key: string, value: string | boolean) => scope.session.dispatch({ type: "node.config.fields", nodeId: id, changes: [{ path: ["presentation", key], value }] });
  return <NodeTextEditorScope><SpaceNodeShell id={id} kind={node.kind} selected={selected} writable={writable}
    onBodyInteract={() => scope.session.select([id])} bodyInteractionAllowed={singleSelected || !selected}
    fullBleed={fullBleed} contentClassName={contentClassName} className={className} style={style} onAspectFit={onAspectFit}
    executing={executing} hasError={executionState.status === "failed"} minWidth={item?.geometry.minWidth} minHeight={item?.geometry.minHeight}
    footer={executionState.status ? <SpaceNodeExecutionStatus state={executionState} /> : undefined}
    bodyHeight={bodyHeight} settingsExpanded={settingsExpanded} settingsPanel={settingsPanel} onPanelHeightChange={height => scope.setPanelHeight(id, height)} onHover={hover => scope.session.hover(hover ? id : null)}
    onResizeStart={() => { scope.beginResize(id); }} onResizeCancel={() => scope.cancelResize(id)}
    onResize={(size, finished) => { if (scope.isResizing(id)) scope.resize(id, size, finished); }}
    header={<SpaceNodeHeader id={id} title={tc(item?.title ?? "Unsupported node")} selected={selected} hovered={hovered} writable={writable && !retired && supported}
      customTitle={typeof presentation.customTitle === "string" ? presentation.customTitle : undefined}
      comment={typeof presentation.comment === "string" ? presentation.comment : undefined}
      focusedComment={comments?.focusedCommentNodeId === id}
      onCommentViewed={comments ? () => comments.markCommentViewed(id) : undefined}
      commentNavigation={spaceCommentNavigation(id, comments) ?? undefined}
      executing={executing} supportsOptionalInput={item?.supportsOptionalInput} optional={presentation.isOptional === true}
      onOptionalChange={optional => patchPresentation("isOptional", optional)} onCustomTitleChange={title => patchPresentation("customTitle", title)} onCommentChange={comment => patchPresentation("comment", comment)}
      onExpand={supported && (node.kind === "input.prompt" || node.kind === "process.promptConstructor") ? () => { scope.toggleExpanded(id); services.expandNode?.(id); } : undefined}
      onBrowse={supported && !retired && node.kind.startsWith("generate.") && services.browseModel ? () => services.browseModel?.(id) : undefined}
      headerButtons={headerButtons} alwaysVisibleButtons={alwaysVisibleButtons}
      onRun={runnable ? () => invokeService(() => services.runNode?.(id), services.onError) : undefined}
      onCancel={supported && !retired && runKind && runKind !== "none" && executing && services.cancelNode ? () => invokeService(() => services.cancelNode?.(id), services.onError) : undefined}
      runReady={writable && readiness.ready && !executing && !uploading && !runtime?.selectionPending} runDisabledReason={runtime?.selectionPending ? tc("Saving...") : uploading ? t("mediaNodes.uploading") : blockedReason ? t(`execution.blocked.${blockedReason}`) : undefined} />}>
    <SpaceNodeContacts id={id} ports={ports} connections={connections} writable={writable} />
    {children}
  </SpaceNodeShell></NodeTextEditorScope>;
}
