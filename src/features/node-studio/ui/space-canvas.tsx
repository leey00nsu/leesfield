"use client";

import { Component, createElement, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type ReactNode } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  SelectionMode, ViewportPortal, useReactFlow, useViewport,
  type Connection, type EdgeChange, type FinalConnectionState, type NodeChange, type NodeProps, type XYPosition } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useShallow } from "zustand/shallow";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { findNodeDefinition, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { droppedMediaType, normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";
import { AppDialog, AppDialogContent, AppDialogHeader, AppDialogTitle } from "@/shared/ui/app-dialog";
import { isSpaceNodeAuthorable, spaceAuthorableNodeKinds } from "../model/space-editor-catalog";
import { createSpaceFlowProjection, spaceNodeSize, canonicalSpaceId, type SpaceFlowEdge, type SpaceFlowNode } from "../model/space-editor-flow";
import { alignedSpaceNodePositions, spaceEditorFormTarget, spaceInspectorPanOffset, spaceNodeShortcuts } from "../model/space-editor-interactions";
import { copySpaceEditorSelection } from "../model/space-editor-clipboard";
import type { SpaceEditorClipboard, SpaceEditorCommandResult } from "../model/space-editor-command-types";
import { spaceConnectionForPorts, spaceNodePorts, spacePortFromHandle } from "../model/space-editor-ports";
import { prepareConnectedSpaceNode, spaceGenerationModelError } from "../model/space-connected-node";
import { resolveNodeRunReadiness } from "../model/node-run-readiness";
import { hasSpaceMediaUpload } from "../model/space-editor-media";
import { usePendingReferenceUploads } from "@/shared/ui/reference-upload-scope";
import { useSpaceComments } from "../hook/use-space-comments";
import { defaultSpaceCanvasSettings, type SpaceCanvasSettings, type SpacePortReference } from "../model/space-editor-types";
import { SpaceNodeFrame } from "./nodes/space-node-frame";
import { SpaceEdge, SpaceEdgeGradients } from "./space-edge";
import { SpaceGroup } from "./space-group";
import { SpaceMediaDropPreview } from "./space-media-drop-preview";
import { SpaceVideoCaptureMenu } from "./nodes/space-video-capture-menu";
import { SpaceNodeMenu } from "./space-node-menu";
import { SpaceEdgeToolbar, SpaceFloatingActionBar, SpaceSelectionToolbar } from "./space-editor-toolbar";
import { SpacePortMenuContext, useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector } from "./space-editor-provider";
import styles from "./space-canvas.module.css";


class NodeRenderBoundary extends Component<{ children: ReactNode; label: string; onError?: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError?.(error); }
  render() { return this.state.failed ? <div role="alert" className={styles.nodeError}>{this.props.label}</div> : this.props.children; }
}

const SpaceFlowNodeView = memo(function SpaceFlowNodeView({ data }: NodeProps<SpaceFlowNode>) {
  const id = data.nodeId;
  const tc = useCanvasTranslation();
  const Presenter = useSpaceViewSelector(state => state.services.renderNode);
  const onError = useSpaceViewSelector(state => state.services.onError);
  return <NodeRenderBoundary label={tc("Unable to display this node")} onError={onError}>
    {Presenter ? createElement(Presenter, { nodeId: id }) : <SpaceNodeFrame nodeId={id}><div className={styles.placeholder}>{tc("Node")}</div></SpaceNodeFrame>}
  </NodeRenderBoundary>;
});

const nodeTypes = { space: SpaceFlowNodeView }, edgeTypes = { space: SpaceEdge };

function groupShortcutTarget(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && ["c", "v", "z"].includes(event.key.toLowerCase())
    && event.target instanceof Element && event.target.matches("[data-space-group-geometry]") ? event.target : null;
}

function SpaceGroups() {
  const { session } = useSpaceEditor(), { zoom } = useViewport();
  const groups = useSpaceSelector(state => state.document.groups);
  const selectedIds = useSpaceSelector(state => state.selectedNodeIds);
  const gesture = useSpaceSelector(state => state.gesture?.kind === "group.move" || state.gesture?.kind === "group.resize" ? state.gesture : null);
  return <ViewportPortal>{groups.map(group => {
    const bounds = gesture?.groupId === group.id ? gesture.kind === "group.move" ? { ...group.bounds, x: group.bounds.x + gesture.delta.x, y: group.bounds.y + gesture.delta.y } : gesture.bounds : group.bounds;
    return <SpaceGroup key={group.id} group={bounds === group.bounds ? group : { ...group, bounds }} session={session} zoom={zoom}
      selected={group.memberNodeIds.length > 0 && group.memberNodeIds.every(id => selectedIds.includes(id))}
      onSelect={() => session.select(group.memberNodeIds)} />;
  })}</ViewportPortal>;
}

function SpaceSelectionOverlay() {
  const { session } = useSpaceEditor(), flow = useReactFlow();
  useViewport();
  const ids = useSpaceSelector(state => state.selectedNodeIds);
  useSpaceSelector(state => state.gesture);
  const nodes = useSpaceSelector(state => state.document.nodes);
  const geometry = useSpaceSelector(state => state.geometryByNode);
  const download = useSpaceViewSelector(state => state.services.downloadSelected);
  const downloading = useSpaceViewSelector(state => state.services.downloadingSelected);
  const video = useSpaceViewSelector(state => state.videoPreviewByNode.get(ids.length === 1 ? ids[0] : ""));
  const epoch = useSpaceViewSelector(state => state.epoch);
  if (ids.length === 0) return null;
  const selected = nodes.filter(node => ids.includes(node.id));
  if (selected.length === 0) return null;
  const points = selected.map(node => ({ node, position: session.getNodePosition(node.id) ?? node.position }));
  const minX = Math.min(...points.map(item => item.position.x));
  const maxX = Math.max(...points.map(item => item.position.x + spaceNodeSize(item.node, { geometryByNode: geometry }).width));
  const center = (minX + maxX) / 2;
  const top = flow.flowToScreenPosition({ x: center, y: Math.min(...points.map(item => item.position.y)) });
  const bottom = flow.flowToScreenPosition({ x: center, y: Math.max(...points.map(item => item.position.y + spaceNodeSize(item.node, { geometryByNode: geometry }).height)) });
  const single = selected.length === 1 ? selected[0] : undefined;
  const capture = single && (single.kind === "input.video" || (single.kind === "output.single" && video));
  const mediaActions = capture ? <SpaceVideoCaptureMenu key={JSON.stringify([single.id, epoch, video?.asset?.id, video?.asset?.version, video?.asset?.updatedAt, video?.asset?.url])}
    nodeId={single.id} asset={video?.asset} getVideo={video?.getVideo ?? (() => null)} /> : undefined;
  return <SpaceSelectionToolbar session={session} nodeIds={ids} position={{ x: top.x, y: top.y - 34 }} below={{ x: bottom.x, y: bottom.y + 12 }} onDownload={download ? () => { void download(); } : undefined} downloading={downloading} mediaActions={mediaActions} />;
}

function SpaceCanvasActionBar({ onAdd, onOpenNodes }: { onAdd: (kind: CanonicalNodeKind) => void; onOpenNodes: (position: XYPosition) => void }) {
  const scope = useSpaceEditor();
  const ids = useSpaceSelector(state => state.selectedNodeIds), writable = useSpaceSelector(state => state.writable);
  const id = ids.length === 1 ? ids[0] : "";
  const node = useSpaceSelector(state => state.nodeById.get(id));
  const runtime = useSpaceSelector(state => state.runtimeByNode.get(id));
  const inputUploading = useSpaceSelector(hasSpaceMediaUpload), referenceUploading = usePendingReferenceUploads("space:");
  const uploading = inputUploading || referenceUploading;
  const services = useSpaceViewSelector(state => state.services), catalog = useSpaceViewSelector(state => state.catalog), edgeStyle = useSpaceViewSelector(state => state.edgeStyle);
  const executable = Boolean(node && isSpaceNodeAuthorable(node.kind) && findNodeDefinition(node.kind)?.executionMode !== "none");
  const running = Boolean(runtime?.submissionPending || runtime?.execution && ["pending", "processing", "uploading"].includes(runtime.execution.status));
  const ready = useSpaceResolvedInput(id, () => {
    const inputs = scope.getInputRuntime();
    return Boolean(executable && node && !running && !uploading && !runtime?.selectionPending && resolveNodeRunReadiness(scope.session.getDocument(), node.id, { ...catalog, assistantResults: inputs.assistantResults,
      mediaOutputs: inputs.mediaOutputs ? Object.fromEntries(inputs.mediaOutputs) : undefined }).ready);
  });
  return <SpaceFloatingActionBar disabled={!writable} onAdd={onAdd} onOpenNodes={onOpenNodes}
    onOpenModels={services.browseModel ? () => services.browseModel?.() : undefined} selectedNodeCount={ids.length}
    runSelected={executable && node && services.runNode ? () => { void Promise.resolve().then(() => services.runNode?.(node.id)).catch(error => services.onError?.(error instanceof Error ? error : new Error(String(error)))); } : undefined} runReady={ready} edgeStyle={edgeStyle} onToggleEdgeStyle={scope.toggleEdgeStyle} />;
}

type MenuState = { screen: XYPosition; flow: XYPosition; port: SpacePortReference | null; returnFocus: HTMLElement | null };
export function SpaceCanvas({ settings = defaultSpaceCanvasSettings, children, className }: { settings?: SpaceCanvasSettings; children?: ReactNode; className?: string }) {
  return <ReactFlowProvider><SpaceCanvasContent settings={settings} className={className}>{children}</SpaceCanvasContent></ReactFlowProvider>;
}

function SpaceCanvasContent({ settings, children, className }: { settings: SpaceCanvasSettings; children?: ReactNode; className?: string }) {
  const scope = useSpaceEditor(), { session } = scope, tc = useCanvasTranslation(), flow = useReactFlow<SpaceFlowNode, SpaceFlowEdge>();
  const target = useSpaceComments()?.navigationTarget;
  const targetId = target?.nodeId, targetSequence = target?.sequence;
  useEffect(() => {
    if (!targetId) return;
    const state = session.getSnapshot(), node = state.nodeById.get(targetId);
    if (!node) return;
    const size = spaceNodeSize(node, state), position = session.getNodePosition(targetId) ?? node.position;
    void flow.setCenter(position.x + size.width / 2, position.y + size.height / 2, { duration: 300, zoom: 0.7 });
  }, [session, flow, targetId, targetSequence]);
  const root = useRef<HTMLDivElement>(null), clipboard = useRef<SpaceEditorClipboard | null>(null);
  const projection = useMemo(() => createSpaceFlowProjection(), []);
  const getProjection = useCallback(() => projection(session.getSnapshot()), [projection, session]);
  const { nodes, edges } = useSyncExternalStore(session.store.subscribe, getProjection, getProjection);
  const writable = useSpaceSelector(state => state.writable);
  const selection = useSpaceSelector(useShallow(state => ({ nodeIds: state.selectedNodeIds, edgeIds: state.selectedEdgeIds })));
  const selectedNodeId = selection.nodeIds.length === 1 ? selection.nodeIds[0] : null;
  useEffect(() => {
    if (!selectedNodeId) return;
    // Portalled inspectors and Flow's measured projection finish in this commit.
    // Run once per selection; subsequent dragging/panning stays under user control.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      const canvas = root.current;
      const inspector = document.querySelector<HTMLElement>("[data-space-node-inspector] > div");
      const node = [...canvas?.querySelectorAll<HTMLElement>("[data-space-node-id]") ?? []].find(element => element.dataset.spaceNodeId === selectedNodeId);
      if (!canvas || !inspector || !node) return;
      const offset = spaceInspectorPanOffset(node.getBoundingClientRect(), inspector.getBoundingClientRect(), canvas.getBoundingClientRect());
      if (!offset || !offset.x && !offset.y || session.getSnapshot().gesture) return;
      const viewport = flow.getViewport();
      void flow.setViewport({ ...viewport, x: viewport.x + offset.x, y: viewport.y + offset.y }, {
        duration: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
      });
    }); });
    return () => cancelAnimationFrame(frame);
  }, [selectedNodeId, flow, session]);
  const services = useSpaceViewSelector(state => state.services);
  const [menu, setMenu] = useState<MenuState | null>(null), [edgePosition, setEdgePosition] = useState<XYPosition | null>(null), [shortcuts, setShortcuts] = useState(false);
  const report = useCallback((result: SpaceEditorCommandResult) => {
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
    return result.ok;
  }, [scope]);
  const center = useCallback(() => { const rect = root.current?.getBoundingClientRect(); return flow.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 }); }, [flow]);
  const openMenu = useCallback((position: XYPosition, port: SpacePortReference | null = null) => {
    if (!session.getSnapshot().writable) return;
    const at = flow.screenToFlowPosition(position);
    setMenu({ screen: position, flow: port?.direction === "input" ? { x: at.x - 400, y: at.y } : at, port,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : root.current });
  }, [flow, session]);
  const onPortActivate = useCallback((port: SpacePortReference, position: XYPosition) => openMenu(position, port), [openMenu]);
  const openCenteredMenu = useCallback(() => { const rect = root.current?.getBoundingClientRect(); openMenu({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2 - 140, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 - 120 }); }, [openMenu]);
  const createNode = useCallback((kind: CanonicalNodeKind, position: XYPosition, port: SpacePortReference | null = null) => {
    if (!isSpaceNodeAuthorable(kind)) return;
    const modelError = spaceGenerationModelError(kind, scope.view.getState().catalog);
    if (modelError) { scope.view.getState().services.onError?.(new Error(modelError)); setMenu(null); return; }
    const supplied = scope.view.getState().services.createNode?.(kind, position);
    const connected = scope.view.getState().services.createConnectedNode;
    if (port && connected) {
      connected({ kind, position, ...supplied }, port, document.activeElement instanceof HTMLElement ? document.activeElement : root.current);
      setMenu(null); return;
    }
    const id = crypto.randomUUID();
    const result = session.transact(current => {
      const node = { id, kind, position, configVersion: 1, config: defaultConfigForKind(kind), selectedOutputAssetId: null, ...supplied };
      const candidate = { ...current, nodes: [...current.nodes, node] };
      if (!port) return candidate;
      const prepared = prepareConnectedSpaceNode(current, port, node, scope.view.getState().catalog, scope.getInputRuntime());
      if (!prepared.valid) throw new Error(prepared.reason);
      return prepared.document;
    }, { origin: "user", label: "node.create-connected" });
    if (report(result)) { session.select([id]); setMenu(null); root.current?.focus(); }
  }, [scope, session, report]);
  const removeSelection = useCallback(() => {
    const current = session.getSnapshot();
    if (report(session.dispatch({ type: "batch", commands: [{ type: "nodes.remove", nodeIds: current.selectedNodeIds }, { type: "edges.disconnect", edgeIds: current.selectedEdgeIds }] }))) root.current?.focus();
  }, [session, report]);
  const copy = useCallback(() => {
    try { clipboard.current = copySpaceEditorSelection(session.getDocument(), session.getSnapshot().selectedNodeIds); }
    catch (error) { scope.view.getState().services.onError?.(error instanceof Error ? error : new Error("COPY_FAILED")); }
  }, [session, scope]);
  const pasteContent = useCallback(async (items: readonly (string | File)[]) => {
    if (session.getSnapshot().disposed || !session.getSnapshot().writable) return;
    const images = items.filter((item): item is File => typeof item !== "string");
    if (images.length) {
      const selected = session.getSnapshot().selectedNodeIds;
      const replace = images.length === 1 && selected.length === 1 && session.getSnapshot().nodeById.get(selected[0])?.kind === "input.image" ? selected[0] : undefined;
      await scope.view.getState().services.filesDrop?.(images, center(), replace);
    } else {
      const text = items.find((item): item is string => typeof item === "string");
      if (!text) return;
      const id = crypto.randomUUID();
      if (report(session.dispatch({ type: "node.add", node: { id, kind: "input.prompt", position: center(), config: { text } } }))) session.select([id]);
    }
  }, [session, scope, center, report]);
  const paste = useCallback(async () => {
    if (clipboard.current?.nodes.length) {
      if (report(session.dispatch({ type: "clipboard.paste", clipboard: clipboard.current }))) clipboard.current = null;
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      if (session.getSnapshot().disposed) return;
      for (const item of items) {
        const type = item.types.find(type => droppedMediaType(type) === "image");
        if (type) { await pasteContent([new File([await item.getType(type)], "leesfield-pasted-image." + (type.split("/")[1] ?? "png"), { type })]); return; }
      }
      for (const item of items) if (item.types.includes("text/plain")) { await pasteContent([await (await item.getType("text/plain")).text()]); return; }
    } catch (error) { scope.view.getState().services.onError?.(error instanceof Error ? error : new Error("CLIPBOARD_READ_FAILED")); }
  }, [session, scope, report, pasteContent]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Geometry buttons share canvas clipboard/history; editable ancestors still guard them.
    const target = groupShortcutTarget(event)?.parentElement ?? event.target;
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || spaceEditorFormTarget(target)
      || document.querySelector('[aria-modal="true"], [role="alertdialog"]')) return;
    const key = event.key.toLowerCase(), command = event.metaKey || event.ctrlKey;
    if (!command && key === "?") { event.preventDefault(); setShortcuts(true); return; }
    if (command && key === "k") { event.preventDefault(); openCenteredMenu(); return; }
    if (command && key === "c") { event.preventDefault(); copy(); return; }
    if (!writable) return;
    if (command && key === "v") { event.preventDefault(); void paste(); return; }
    if (command && key === "z") { event.preventDefault(); report(event.shiftKey ? session.redo() : session.undo()); return; }
    if (command) return;
    if (event.shiftKey && Object.hasOwn(spaceNodeShortcuts, key)) { event.preventDefault(); createNode(spaceNodeShortcuts[key as keyof typeof spaceNodeShortcuts], center()); return; }
    if (!event.shiftKey && ["v", "h", "g"].includes(key) && session.getSnapshot().selectedNodeIds.length > 1) {
      event.preventDefault(); report(session.dispatch({ type: "nodes.move", positions: alignedSpaceNodePositions(session.getSnapshot(), session.getSnapshot().selectedNodeIds, key as "v" | "h" | "g") })); return;
    }
    if (key === "backspace" || key === "delete") { event.preventDefault(); removeSelection(); }
    if (key === "escape") { setMenu(null); session.cancelGesture(); session.select([]); }
  };
  const beginDrag = (_event: unknown, node: SpaceFlowNode, dragged: SpaceFlowNode[]) => {
    if (!session.getSnapshot().gesture) report(session.beginGesture({ kind: "nodes", nodeIds: (dragged.length ? dragged : [node]).map(item => item.data.nodeId) }));
  };
  const stopDrag = (_event: unknown, node: SpaceFlowNode, dragged: SpaceFlowNode[]) => {
    if (session.getSnapshot().gesture?.kind !== "nodes") return;
    session.updateGesture({ positions: Object.fromEntries((dragged.length ? dragged : [node]).map(item => [item.data.nodeId, item.position])) });
    report(session.commitGesture());
  };
  const onNodesChange = (changes: NodeChange<SpaceFlowNode>[]) => {
    const selections = changes.flatMap(change => change.type === "select" ? [{ id: canonicalSpaceId(change.id), selected: change.selected }] : []);
    if (selections.length) {
      const state = session.getSnapshot(), selected = new Set(state.selectedNodeIds);
      for (const change of selections) if (change.selected) selected.add(change.id); else selected.delete(change.id);
      session.select([...selected], state.selectedEdgeIds);
    }
    const removed = changes.filter(change => change.type === "remove").map(change => canonicalSpaceId(change.id));
    if (removed.length) report(session.dispatch({ type: "nodes.remove", nodeIds: removed }));
    const moving = changes.flatMap(change => change.type === "position" && change.position && (change.dragging === true || scope.isResizing(canonicalSpaceId(change.id))) ? [{ id: canonicalSpaceId(change.id), position: change.position }] : []);
    if (moving.length && session.getSnapshot().gesture?.kind === "nodes") session.updateGesture({ positions: Object.fromEntries(moving.map(change => [change.id, change.position!])) });
    for (const change of changes) if (change.type === "dimensions" && change.dimensions) session.measure(canonicalSpaceId(change.id), change.dimensions);
  };
  const onEdgesChange = (changes: EdgeChange<SpaceFlowEdge>[]) => {
    const selections = changes.flatMap(change => change.type === "select" ? [{ id: canonicalSpaceId(change.id), selected: change.selected }] : []);
    if (selections.length) {
      const state = session.getSnapshot(), selected = new Set(state.selectedEdgeIds);
      for (const change of selections) if (change.selected) selected.add(change.id); else selected.delete(change.id);
      session.select(state.selectedNodeIds, [...selected]);
    }
    const removed = changes.filter(change => change.type === "remove").map(change => canonicalSpaceId(change.id));
    if (removed.length) report(session.dispatch({ type: "edges.disconnect", edgeIds: removed }));
  };
  const connection = (value: Connection) => {
    const from = spacePortFromHandle(canonicalSpaceId(value.source), value.sourceHandle), to = spacePortFromHandle(canonicalSpaceId(value.target), value.targetHandle);
    return from && to ? spaceConnectionForPorts(session.getDocument(), from, to, scope.view.getState().catalog, crypto.randomUUID(), scope.getInputRuntime()) : null;
  };
  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!state.fromNode || state.toNode || !state.fromHandle?.id) return;
    const port = spacePortFromHandle(canonicalSpaceId(state.fromNode.id), state.fromHandle.id), pointer = "changedTouches" in event ? event.changedTouches[0] : event;
    if (port && pointer) openMenu({ x: pointer.clientX, y: pointer.clientY }, port);
  };
  const candidates = menu?.port ? spaceAuthorableNodeKinds.filter(kind => {
    const port = spaceNodePorts(session.getDocument(), menu.port!.nodeId, scope.view.getState().catalog)
      .find(candidate => candidate.definition.id === menu.port!.portId && candidate.definition.direction === menu.port!.direction)?.definition;
    return findNodeDefinition(kind)?.ports.some(candidate => candidate.direction !== menu.port!.direction && (!port || candidate.valueType === port.valueType || candidate.valueType === "media" || port.valueType === "media"));
  }) : undefined;
  const menuNode = menu?.port ? session.getSnapshot().nodeById.get(menu.port.nodeId) : undefined;
  const menuPort = menu?.port && menuNode ? spaceNodePorts(session.getDocument(), menuNode.id, scope.view.getState().catalog)
    .find(candidate => candidate.definition.id === menu.port!.portId && candidate.definition.direction === menu.port!.direction)?.definition : undefined;
  const mediaAction = menuPort && ["image", "video", "audio"].includes(menuPort.valueType) && (menu?.port?.direction === "input" || menuNode?.kind.startsWith("input."));
  const extraActions = menu?.port && mediaAction && services.portMediaRequest ? ["upload", "assets"].map(action => ({ label: tc(action === "upload" ? "Upload" : "Assets"), onSelect: () => {
    services.portMediaRequest?.({ port: menu.port!, action: action as "upload" | "assets", position: menu.flow }); setMenu(null);
  } })) : undefined;
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return <SpacePortMenuContext.Provider value={onPortActivate}><div ref={root} className={[styles.canvas, className].filter(Boolean).join(" ")} data-space-canvas="" role="application" aria-label={tc("Workflow editor")} tabIndex={0}
    onKeyDownCapture={event => {
      if (groupShortcutTarget(event)) {
        onKeyDown(event);
        if (event.defaultPrevented) event.stopPropagation();
        return;
      }
      if (event.defaultPrevented || !writable || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || !event.key.startsWith("Arrow")
        || spaceEditorFormTarget(event.target) || !(event.target instanceof Element) || !event.target.closest(".react-flow__node") || document.querySelector('[aria-modal="true"]')) return;
      const state = session.getSnapshot();
      if (!state.selectedNodeIds.length) return;
      event.preventDefault(); event.stopPropagation();
      if (state.gesture) return;
      const step = event.shiftKey ? 20 : 5;
      const x = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
      const y = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
      report(session.dispatch({ type: "nodes.move", positions: Object.fromEntries(state.selectedNodeIds.flatMap(id => {
        const node = state.nodeById.get(id);
        return node ? [[id, { x: node.position.x + x, y: node.position.y + y }]] : [];
      })) }));
    }}
    onKeyDown={onKeyDown} onPaste={event => {
      if (spaceEditorFormTarget(event.target) || !writable || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (clipboard.current?.nodes.length) { void paste(); return; }
      const files = [...event.clipboardData.files].map(normalizeDroppedMediaFile).filter((file): file is File => Boolean(file));
      void pasteContent(files.length ? files : [event.clipboardData.getData("text/plain")]);
    }}
    onDragOver={event => { if (writable && !spaceEditorFormTarget(event.target)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
    onDrop={event => {
      if (!writable || spaceEditorFormTarget(event.target) || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const kind = event.dataTransfer.getData("application/leesfield-node-kind");
      if (isSpaceNodeAuthorable(kind)) { createNode(kind as CanonicalNodeKind, position); return; }
      const original = [...event.dataTransfer.files], files = original.map(normalizeDroppedMediaFile);
      if (original.length && files.every((file): file is File => file !== null)) void services.filesDrop?.(files, position);
      else if (original.length) services.onError?.(new Error("Unsupported file type."));
    }}>
    <SpaceMediaDropPreview rootRef={root} enabled={writable} getScale={flow.getZoom} />
    <ReactFlow<SpaceFlowNode, SpaceFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onInit={instance => { void instance.fitView({ padding: 0.2, maxZoom: 1, duration: 0 }); }}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStart={beginDrag} onNodeDragStop={stopDrag}
      onSelectionDragStart={(event, dragged) => { if (dragged[0]) beginDrag(event, dragged[0], dragged); }} onSelectionDragStop={(event, dragged) => { if (dragged[0]) stopDrag(event, dragged[0], dragged); }}
      onConnect={value => { const result = connection(value); if (result?.valid) report(session.dispatch({ type: "edge.connect", edge: result.edge })); }} isValidConnection={value => Boolean(connection(value as Connection)?.valid)} onConnectEnd={onConnectEnd}
      onPaneClick={() => { setMenu(null); setEdgePosition(null); root.current?.focus(); }}
      onEdgeClick={event => { setEdgePosition({ x: event.clientX, y: event.clientY - 40 }); }}
      onMoveEnd={(_event, viewport) => session.setViewport(viewport)}
      onDoubleClick={event => { if (event.target instanceof Element && event.target.classList.contains("react-flow__pane")) openMenu({ x: event.clientX, y: event.clientY }); }}
      onPaneContextMenu={event => { event.preventDefault(); openMenu({ x: event.clientX, y: event.clientY }); }}
      nodesDraggable={writable} nodesConnectable={writable} elementsSelectable
      selectionMode={SelectionMode.Partial} selectionOnDrag={settings.selectionMode === "click" && settings.panMode !== "always" && isMac} selectionKeyCode={settings.selectionMode === "altDrag" ? "Alt" : "Shift"}
      panOnDrag={settings.panMode === "always" ? true : settings.panMode === "middleMouse" ? [1] : !isMac} panActivationKeyCode={settings.panMode === "space" ? "Space" : null}
      zoomOnScroll zoomActivationKeyCode={settings.zoomMode === "altScroll" ? "Alt" : settings.zoomMode === "ctrlScroll" ? ["Control", "Meta"] : null}
      zoomOnDoubleClick={false} deleteKeyCode={null} minZoom={nodes.length <= 1 ? 0.65 : 0.1} maxZoom={4} proOptions={{ hideAttribution: true }}
      ariaLabelConfig={{ "controls.zoomIn.ariaLabel": tc("Zoom In"), "controls.zoomOut.ariaLabel": tc("Zoom Out"), "controls.fitView.ariaLabel": tc("Fit View") }}>
      <SpaceEdgeGradients /><SpaceGroups /><Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#404040" />
      <MiniMap pannable zoomable nodeStrokeWidth={2} maskColor="rgba(0,0,0,0.6)" style={{ width: 200, height: 150, margin: 15 }} /><Controls showInteractive={false} fitViewOptions={{ padding: 0.2, maxZoom: 1 }} />
      <Panel position="bottom-center"><SpaceCanvasActionBar onAdd={kind => createNode(kind, center())} onOpenNodes={openMenu} /></Panel>
      <SpaceSelectionOverlay />
      {children}
    </ReactFlow>
    {selection.edgeIds.length === 1 && edgePosition && <SpaceEdgeToolbar session={session} edgeId={selection.edgeIds[0]} position={edgePosition} />}
    {menu && <SpaceNodeMenu position={menu.screen} kinds={candidates} onChoose={kind => createNode(kind, menu.flow, menu.port)} onClose={() => setMenu(null)} extraActions={extraActions} returnFocus={menu.returnFocus} />}
    {!writable && <p role="status" className={styles.readOnly}>{tc("Read only")}</p>}
    <AppDialog open={shortcuts} onOpenChange={setShortcuts}><AppDialogContent surface="editor" size="sm"><AppDialogHeader><AppDialogTitle>{tc("Keyboard Shortcuts")}</AppDialogTitle></AppDialogHeader>
      <dl className={styles.shortcuts}><dt>⌘/Ctrl K</dt><dd>{tc("All nodes")}</dd><dt>⌘/Ctrl C · V</dt><dd>{tc("Copy / Paste")}</dd><dt>⌘/Ctrl Z · ⇧Z</dt><dd>{tc("Undo / Redo")}</dd><dt>V · H · G</dt><dd>{tc("Arrange vertically / horizontally / grid")}</dd><dt>Shift P / I / G / V / T / Y</dt><dd>{tc("Add node")}</dd><dt>Delete</dt><dd>{tc("Delete selected")}</dd></dl>
    </AppDialogContent></AppDialog>
  </div></SpacePortMenuContext.Provider>;
}
