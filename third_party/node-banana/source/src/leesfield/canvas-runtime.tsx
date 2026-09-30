"use client";

import { useCanvasTranslation } from "./localization";
import { PortIcon } from "./port-handle";

import {
  Component,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type FinalConnectionState,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  FloatingActionBar as UpstreamFloatingActionBar,
  type FloatingActionBarHostedItem,
} from "../components/FloatingActionBar";
import {
  ModelSearchDialog as UpstreamModelSearchDialog,
  type ModelSearchDialogHostedProps,
} from "../components/modals/ModelSearchDialog";
import {
  ConnectionDropMenu as UpstreamConnectionDropMenu,
  type ConnectionDropMenuHostedOption,
} from "../components/ConnectionDropMenu";
import {
  NodeSearchMenu as UpstreamNodeSearchMenu,
  type NodeSearchMenuHostedOption,
} from "../components/NodeSearchMenu";
import {
  EditableEdge as UpstreamEditableEdge,
} from "../components/edges/EditableEdge";
import {
  EdgeToolbar as UpstreamEdgeToolbar,
  type EdgeToolbarHostedProps,
} from "../components/EdgeToolbar";
import {
  MultiSelectToolbar as UpstreamMultiSelectToolbar,
  type MultiSelectToolbarHostedProps,
} from "../components/MultiSelectToolbar";
import { SharedEdgeGradients as UpstreamSharedEdgeGradients } from "../components/edges/SharedEdgeGradients";
import { ReferenceEdge } from "../components/edges/ReferenceEdge";
import { NodeBananaUpstreamHostProvider, type NodeBananaUpstreamHostValue } from "./upstream-node-host";
import { KeyboardShortcutsDialog } from "../components/KeyboardShortcutsDialog";

// Node IDs are external data; inherited Object keys are not layout entries.
function ownEntry<T>(record: Record<string, T>, key: string): T {
  return Object.hasOwn(record, key) ? record[key] : undefined as T;
}

export type NodeBananaRuntimeNode = Node<Record<string, unknown>, string>;
export type NodeBananaRuntimeEdge = Edge<Record<string, unknown>, string>;

export type NodeBananaRuntimeGroup = {
  id: string; title: string; color: "neutral" | "blue" | "green" | "purple" | "orange" | "red";
  bounds: { x: number; y: number; width: number; height: number };
  locked: boolean; memberNodeIds: string[];
};
export type NodeBananaRuntimeGraph = {
  nodes: NodeBananaRuntimeNode[];
  edges: NodeBananaRuntimeEdge[];
  groups?: NodeBananaRuntimeGroup[];
};

export type NodeBananaPendingConnection = {
  nodeId: string;
  handleId: string | null;
  handleType: "source" | "target";
  replaceExisting?: boolean;
};

export type NodeBananaRuntimePaletteItem = {
  kind: string;
  label: string;
  description?: string;
  mediaType?: "text" | "image" | "audio" | "video" | "media";
  category?: "Input" | "Text" | "Generate" | "Process" | "Output";
  initialModelKey?: string;
};

export type NodeBananaRuntimeModelItem = {
  key: string;
  label: string;
  provider: string;
  mediaType: "image" | "video" | "audio";
  capabilities: readonly string[];
};

export type NodeBananaCanvasSettings = {
  panMode: "space" | "middleMouse" | "always";
  zoomMode: "altScroll" | "ctrlScroll" | "scroll";
  selectionMode: "click" | "altDrag" | "shiftDrag";
};

export type NodeBananaCanvasReason =
  | "connect"
  | "create"
  | "delete"
  | "drag"
  | "edges"
  | "nodes"
  | "paste"
  | "redo"
  | "undo";

export type NodeBananaCanvasLabels = {
  application: string;
  addNode: string;
  selectTool: string;
  panTool: string;
  undo: string;
  redo: string;
  copy: string;
  paste: string;
  fitView: string;
  searchPlaceholder: string;
  closeMenu: string;
  emptyTitle: string;
  emptyDescription: string;
  readOnly: string;
};

type CreateNodeResult = {
  node: NodeBananaRuntimeNode;
  edge?: NodeBananaRuntimeEdge | null;
};

export type NodeBananaCanvasProps = {
  contextId?: string;
  host?: NodeBananaUpstreamHostValue;
  navigationTarget?: { nodeId: string; sequence: number } | null;
  onUndoRecorderChange?: (recorder: ((previous: NodeBananaRuntimeGraph) => void) | null) => void;
  remapPastedNodes?: (nodes: NodeBananaRuntimeNode[], ids: Record<string, string>, offset: { x: number; y: number }, groupIds: Record<string, string>) => NodeBananaRuntimeNode[];
  onCreateGroup?: (ids: string[], nodes: NodeBananaRuntimeNode[]) => void;
  onUngroup?: (ids: string[]) => void;
  onImportCanvasMedia?: (source: File | { assetId: string }, signal: AbortSignal) => Promise<{ assetId: string; mediaType: "image" | "audio" | "video" }>;
  renderAssetPicker?: (mediaType: "image" | "audio" | "video", onSelect: (assetId: string) => void, onClose: () => void) => ReactNode;
  onInputError?: (error: Error) => void;
  graph: NodeBananaRuntimeGraph;
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  paletteItems: readonly NodeBananaRuntimePaletteItem[];
  modelItems?: readonly NodeBananaRuntimeModelItem[];
  labels: NodeBananaCanvasLabels;
  writable: boolean;
  canvasSettings?: NodeBananaCanvasSettings;
  className?: string;
  onGraphChange: (graph: NodeBananaRuntimeGraph, reason: NodeBananaCanvasReason) => void;
  onCreateNode: (
    item: NodeBananaRuntimePaletteItem,
    position: XYPosition,
    pendingConnection: NodeBananaPendingConnection | null,
  ) => CreateNodeResult;
  createId: () => string;
  isValidConnection?: IsValidConnection<NodeBananaRuntimeEdge>;
  isNodeRunnable?: (nodeId: string) => boolean;
  onRunNode?: (nodeId: string) => void | Promise<unknown>;
  onDownloadSelectedImages?: (nodeIds: string[]) => void | Promise<void>;
  downloadingImages?: boolean;
  renderNodeHeader?: (node: NodeBananaRuntimeNode) => ReactNode;
  canvasOverlay?: ReactNode;
  filterPaletteItems?: (
    items: readonly NodeBananaRuntimePaletteItem[],
    pendingConnection: NodeBananaPendingConnection | null,
  ) => readonly NodeBananaRuntimePaletteItem[];
  renderEmptyState?: () => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ClipboardSnapshot = NodeBananaRuntimeGraph;
type MenuState = {
  open: boolean;
  screen: XYPosition;
  flow: XYPosition;
  pendingConnection: NodeBananaPendingConnection | null;
  query: string;
};

type InteractionState = {
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  nodeLayout: Record<string, Pick<NodeBananaRuntimeNode, "width" | "height" | "measured">>;
  nodeGeometry: Record<string, { width: number; height: number; settingsPanelHeight: number }>;
  nodePositions: Record<string, XYPosition>;
  edgeOffsets: Record<string, { offsetX: number; offsetY: number }>;
  edgeToolbarPosition: XYPosition | null;
  clipboard: ClipboardSnapshot | null;
  pasteCount: number;
  undo: NodeBananaRuntimeGraph[];
  redo: NodeBananaRuntimeGraph[];
  viewport: Viewport;
  mode: "select" | "pan";
  edgeStyle: "angular" | "curved";
  menu: MenuState;
};

const closedMenu: MenuState = {
  open: false,
  screen: { x: 0, y: 0 },
  flow: { x: 0, y: 0 },
  pendingConnection: null,
  query: "",
};

function createInteractionStore(): StoreApi<InteractionState> {
  return createStore<InteractionState>(() => ({
    selectedNodeIds: [],
    selectedEdgeIds: [],
    nodeLayout: {},
    nodeGeometry: {},
    nodePositions: {},
    edgeOffsets: {},
    edgeToolbarPosition: null,
    clipboard: null,
    pasteCount: 0,
    undo: [],
    redo: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    mode: "select",
    edgeStyle: "angular",
    menu: closedMenu,
  }));
}

function cloneGraph(graph: NodeBananaRuntimeGraph): NodeBananaRuntimeGraph {
  return {
    ...(graph.groups ? { groups: structuredClone(graph.groups) } : {}),
    nodes: graph.nodes.map((node) => ({ ...node, data: { ...node.data } })),
    edges: graph.edges.map((edge) => ({ ...edge, data: edge.data ? { ...edge.data } : edge.data })),
  };
}

function isFormTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='dialog'], [role='alertdialog']"));
}

function pointerPosition(event: MouseEvent | TouchEvent): XYPosition {
  if ("touches" in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
  }
  return { x: event.clientX, y: event.clientY };
}

// These adapters only translate Leesfield's canonical runtime contracts into
// the actual vendored components' hosted props. UI/state remains upstream.
function hostedPosition(root: HTMLDivElement | null, screen: XYPosition): XYPosition {
  const rect = root?.getBoundingClientRect();
  return { x: screen.x + (rect?.left ?? 0), y: screen.y + (rect?.top ?? 0) };
}

function hostedMenuOption(item: NodeBananaRuntimePaletteItem): NodeSearchMenuHostedOption {
  return { type: item.kind, label: item.label, description: item.description, value: item };
}

function hostedConnectionOption(item: NodeBananaRuntimePaletteItem): ConnectionDropMenuHostedOption {
  return { type: item.kind, label: item.label, icon: <PortIcon type={item.kind.includes("prompt") || item.kind.includes("Constructor") ? "text" : item.kind.includes("audio") ? "audio" : item.kind.includes("video") ? "video" : "image"}/>, value: item };
}

function HostedFloatingActionBar({
  labels,
  writable,
  items,
  selectedNodeCount,
  runEnabled,
  onAddItem,
  onBrowseModels,
  onRunSelected,
  edgeStyle,
  onToggleEdgeStyle,
}: {
  labels: NodeBananaCanvasLabels;
  writable: boolean;
  items: readonly NodeBananaRuntimePaletteItem[];
  selectedNodeCount: number;
  runEnabled: boolean;
  onAddItem: (item: NodeBananaRuntimePaletteItem) => void;
  onBrowseModels: () => void;
  onRunSelected: () => void;
  edgeStyle: "angular" | "curved";
  onToggleEdgeStyle: () => void;
}) {
  return (
    <UpstreamFloatingActionBar
      hosted={{
        ariaLabel: labels.application,
        writable,
        items,
        selectedNodeCount,
        runEnabled,
        onAddItem: (item: FloatingActionBarHostedItem) => onAddItem(item as NodeBananaRuntimePaletteItem),
        onBrowseModels,
        onRunSelected,
        edgeStyle,
        onToggleEdgeStyle,
      }}
    />
  );
}

function HostedModelBrowserDialog({
  open,
  models,
  onChoose,
  onClose,
}: {
  open: boolean;
  models: readonly NodeBananaRuntimeModelItem[];
  onChoose: (model: NodeBananaRuntimeModelItem) => void;
  onClose: () => void;
}) {
  const tc = useCanvasTranslation();
  const modelById = useMemo(() => new Map(models.map((model) => [model.key, model])), [models]);
  const hostedModels: ModelSearchDialogHostedProps["hostedModels"] = useMemo(
    () => models.map((model) => ({
      id: model.key,
      name: model.label,
      description: null,
      provider: model.provider as ModelSearchDialogHostedProps["hostedModels"][number]["provider"],
      capabilities: model.capabilities as ModelSearchDialogHostedProps["hostedModels"][number]["capabilities"],
    })),
    [models],
  );
  return (
    <UpstreamModelSearchDialog
      isOpen={open}
      onClose={onClose}
      title={tc("All models")}
      hosted={{
        hostedModels,
        onHostedModelSelected: (model) => {
          const selected = modelById.get(model.id);
          if (selected) onChoose(selected);
        },
      }}
    />
  );
}

function HostedNodeSearchMenu({
  root,
  labels,
  menu,
  items,
  onChoose,
  onClose,
}: {
  root: HTMLDivElement | null;
  labels: NodeBananaCanvasLabels;
  menu: MenuState;
  items: readonly NodeBananaRuntimePaletteItem[];
  onChoose: (item: NodeBananaRuntimePaletteItem) => void;
  onClose: () => void;
}) {
  if (!menu.open || menu.pendingConnection) return null;
  return (
    <UpstreamNodeSearchMenu
      position={hostedPosition(root, menu.screen)}
      onSelect={() => undefined}
      onClose={onClose}
      hosted={{
        hostedOptions: items.map(hostedMenuOption),
        hostedAriaLabel: labels.addNode,
        hostedSearchLabel: labels.searchPlaceholder,
        hostedCloseLabel: labels.closeMenu,
        onHostedSelect: (option) => {
          if (option.value && typeof option.value === "object" && "kind" in option.value) {
            onChoose(option.value as NodeBananaRuntimePaletteItem);
          }
        },
      }}
    />
  );
}

function pendingHandleType(pending: NodeBananaPendingConnection): "image" | "text" | "video" | "audio" | "3d" | "easeCurve" | null {
  // Reference inputs accept images; retain the original handle ID for edge creation.
  const rawHandleId = pending.handleId === "reference" ? "image" : pending.handleId;
  const handleId = rawHandleId?.match(/^(image|video|audio)(?:-|$)/)?.[1] ?? rawHandleId;
  return handleId === "image" || handleId === "text" || handleId === "video" || handleId === "audio" || handleId === "3d" || handleId === "easeCurve"
    ? handleId
    : null;
}

function HostedConnectionDropMenu({
  inputMedia = false,
  root,
  labels,
  menu,
  items,
  onChoose,
  onMedia,
  onClose,
}: {
  root: HTMLDivElement | null;
  labels: NodeBananaCanvasLabels;
  menu: MenuState;
  items: readonly NodeBananaRuntimePaletteItem[];
  inputMedia?: boolean;
  onMedia: (action: "upload" | "assets", mediaType: "image" | "audio" | "video") => void;
  onChoose: (item: NodeBananaRuntimePaletteItem) => void;
  onClose: () => void;
}) {
  const pending = menu.pendingConnection;
  if (!menu.open || !pending) return null;
  const handleType = pendingHandleType(pending);
  return (
    <UpstreamConnectionDropMenu
      position={hostedPosition(root, menu.screen)}
      handleType={handleType}
      connectionType={pending.handleType === "source" ? "source" : "target"}
      onSelect={() => undefined}
      onClose={onClose}
      hosted={{
        hostedOptions: [...items.filter(item => !(pending.handleType === "target" && item.kind === ("input." + handleType))).map(hostedConnectionOption), ...((inputMedia || (pending.handleType === "target" && items.some(item=>item.kind === ("input." + handleType)))) && (handleType === "image" || handleType === "audio" || handleType === "video") ? ["upload", "assets"].map(action=>({type:action,label:action === "upload" ? "Upload" : "Assets",icon:<PortIcon type={action}/>,value:action})) : [])],
        hostedAriaLabel: labels.addNode,
        onHostedSelect: (option) => {
          if ((option.value === "upload" || option.value === "assets") && (handleType === "image" || handleType === "audio" || handleType === "video")) { onMedia(option.value, handleType); return; }
          if (option.value && typeof option.value === "object" && "kind" in option.value) {
            onChoose(option.value as NodeBananaRuntimePaletteItem);
          }
        },
      }}
    />
  );
}

export function NodeBananaCanvasRuntime({
  contextId,
  host,
  navigationTarget,
  onUndoRecorderChange,
  remapPastedNodes,
  onCreateGroup,
  onUngroup,
  onImportCanvasMedia,
  renderAssetPicker,
  onInputError,
  graph,
  nodeTypes,
  edgeTypes,
  paletteItems,
  modelItems = [],
  labels,
  writable,
  canvasSettings = { panMode: "space", zoomMode: "altScroll", selectionMode: "click" },
  className,
  onGraphChange,
  onCreateNode,
  createId,
  isValidConnection,
  isNodeRunnable,
  onRunNode,
  onDownloadSelectedImages,
  downloadingImages,
  renderNodeHeader,
  canvasOverlay,
  filterPaletteItems,
}: NodeBananaCanvasProps) {
  const tc = useCanvasTranslation();
  const store = useMemo(createInteractionStore, []);
  const interaction = useStore(store);
  const runtimeEdgeTypes = useMemo<EdgeTypes>(
    () => ({ ...edgeTypes, editable: UpstreamEditableEdge, reference: ReferenceEdge }),
    [edgeTypes],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReactFlowInstance<NodeBananaRuntimeNode, NodeBananaRuntimeEdge> | null>(null);
  const dragStartRef = useRef<NodeBananaRuntimeGraph | null>(null);
  const navigationNodes = useRef(graph.nodes);
  navigationNodes.current = graph.nodes;
  useEffect(() => {
    if (!navigationTarget) return;
    const node = navigationNodes.current.find((entry) => entry.id === navigationTarget.nodeId);
    const instance = instanceRef.current;
    if (!node || !instance) return;
    const measured = instance.getNode(node.id);
    void instance.setCenter(node.position.x + (measured?.measured?.width ?? measured?.width ?? 350) / 2,
      node.position.y + (measured?.measured?.height ?? measured?.height ?? 200) / 2,
      { zoom: 0.7, duration: 300 });
  }, [navigationTarget]);
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const modalCount = useRef(0);
  const incrementModalCount = useCallback(() => { modalCount.current += 1; }, []);
  const decrementModalCount = useCallback(() => { modalCount.current = Math.max(0, modalCount.current - 1); }, []);
  const [contentBusy, setContentBusy] = useState(false);
  const contentController = useRef<AbortController | null>(null);
  const contentMounted = useRef(false);
  useEffect(() => {
    contentMounted.current = true;
    return () => { contentMounted.current = false; };
  }, []);
  useEffect(() => {
    if (!writable) contentController.current?.abort();
    return () => contentController.current?.abort();
  }, [writable]);

  const recordUndo = useCallback((previous: NodeBananaRuntimeGraph) => {
    store.setState((state) => ({ undo: [...state.undo.slice(-49), cloneGraph(previous)], redo: [] }));
  }, [store]);

  useEffect(() => {
    onUndoRecorderChange?.(recordUndo);
    return () => onUndoRecorderChange?.(null);
  }, [onUndoRecorderChange, recordUndo]);

  const publish = useCallback((next: NodeBananaRuntimeGraph, reason: NodeBananaCanvasReason, record = true) => {
    if (!writable) return;
    if (record) recordUndo(graph);
    const remaining = new Set(next.nodes.map((node) => node.id));
    const removed = new Set(graph.nodes.filter((node) => !remaining.has(node.id)).map((node) => node.id));
    const groups = next.groups ?? graph.groups;
    onGraphChange({ ...next, ...(groups ? { groups: groups.flatMap((group) => {
      const members = group.memberNodeIds.filter((id) => !removed.has(id));
      return members.length === group.memberNodeIds.length ? [group]
        : members.length ? [{ ...group, memberNodeIds: members }] : [];
    }) } : {}) }, reason);
  }, [graph, onGraphChange, recordUndo, writable]);

  const onNodesChange = useCallback((changes: NodeChange<NodeBananaRuntimeNode>[]) => {
    const selection = changes.filter((change) => change.type === "select");
    if (selection.length) {
      const currentSelection = store.getState().selectedNodeIds;
      const selected = new Set(currentSelection);
      for (const change of selection) change.selected ? selected.add(change.id) : selected.delete(change.id);
      const selectedNodeIds = [...selected];
      if (
        selectedNodeIds.length !== currentSelection.length ||
        selectedNodeIds.some((id, index) => id !== currentSelection[index])
      ) store.setState({ selectedNodeIds });
    }
    const dimensions = changes.filter((change) => change.type === "dimensions");
    if (dimensions.length) {
      const current = store.getState().nodeLayout;
      const dimensionIds = new Set(dimensions.map((change) => change.id));
      const measuredNodes = applyNodeChanges(
        dimensions,
        graph.nodes.map((node) => ({ ...node, ...ownEntry(current, node.id) })),
      );
      const nodeLayout = { ...current };
      let changed = false;
      for (const node of measuredNodes) {
        if (!dimensionIds.has(node.id)) continue;
        const next = { width: node.width, height: node.height, measured: node.measured };
        const previous = ownEntry(current, node.id);
        if (
          previous?.width !== next.width ||
          previous?.height !== next.height ||
          previous?.measured?.width !== next.measured?.width ||
          previous?.measured?.height !== next.measured?.height
        ) {
          nodeLayout[node.id] = next;
          changed = true;
        }
      }
      if (changed) store.setState({ nodeLayout });
      // NodeResizer writes its own node through dimension changes (its onResize
      // callback only sizes the other selected nodes). Keep explicit resize
      // attributes in sync; passive ResizeObserver measurements never write here.
      for (const change of dimensions) {
        if (!change.setAttributes || !change.dimensions) continue;
        const previous = ownEntry(store.getState().nodeGeometry, change.id);
        if (!previous) continue;
        const width = change.setAttributes === true || change.setAttributes === "width"
          ? change.dimensions.width : previous.width;
        const height = change.setAttributes === true || change.setAttributes === "height"
          ? change.dimensions.height : previous.height;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
          || (previous.width === width && previous.height === height)) continue;
        store.setState((state) => ({
          nodeGeometry: { ...state.nodeGeometry, [change.id]: { ...previous, width, height } },
        }));
      }
    }
    const positions = changes
      .filter((change) => change.type === "position")
      .filter((change) => change.dragging === true);
    if (positions.length && dragStartRef.current) {
      const current = store.getState().nodePositions;
      const positionIds = new Set(positions.map((change) => change.id));
      const movedNodes = applyNodeChanges(
        positions,
        graph.nodes.map((node) => ({
          ...node,
          position: ownEntry(current, node.id) ?? node.position,
        })),
      );
      const nodePositions = { ...current };
      let changed = false;
      for (const node of movedNodes) {
        if (!positionIds.has(node.id)) continue;
        const previous = ownEntry(current, node.id) ?? graph.nodes.find((candidate) => candidate.id === node.id)?.position;
        if (
          !previous ||
          previous.x !== node.position.x ||
          previous.y !== node.position.y
        ) {
          nodePositions[node.id] = node.position;
          changed = true;
        }
      }
      if (changed) store.setState({ nodePositions });
    }
    const durableChanges: NodeChange<NodeBananaRuntimeNode>[] = [];
    for (const change of changes) {
      if (change.type === "select" || change.type === "dimensions" || change.type === "position") continue;
      if (change.type !== "replace") {
        durableChanges.push(change);
        continue;
      }
      const current = graph.nodes.find((node) => node.id === change.id);
      if (!current || dragStartRef.current) continue;
      // Upstream BaseNode uses setNodes for resize/settings layout. Retain only
      // this transient geometry, never replace host data or selection wholesale.
      const width = change.item.width ?? change.item.style?.width;
      const height = change.item.height ?? change.item.style?.height;
      if (typeof width === "number" && Number.isFinite(width) && width > 0
        && typeof height === "number" && Number.isFinite(height) && height > 0) {
        const previous = ownEntry(store.getState().nodeGeometry, change.id);
        const panel = change.item.data?._settingsPanelHeight;
        const settingsPanelHeight = typeof panel === "number" && Number.isFinite(panel)
          ? Math.max(0, panel) : previous?.settingsPanelHeight ?? 0;
        if (previous?.width !== width || previous?.height !== height
          || previous?.settingsPanelHeight !== settingsPanelHeight) {
          store.setState((state) => ({
            nodeGeometry: { ...state.nodeGeometry, [change.id]: { width, height, settingsPanelHeight } },
          }));
        }
      }
      if (
        current.position.x === change.item.position.x &&
        current.position.y === change.item.position.y
      ) continue;
      durableChanges.push({
        ...change,
        item: { ...current, position: change.item.position },
      });
    }
    if (!durableChanges.length || !writable) return;
    const nodes = applyNodeChanges(durableChanges, graph.nodes);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const removed = durableChanges.some((change) => change.type === "remove");
    publish({ nodes, edges }, removed ? "delete" : "nodes", removed);
  }, [graph, publish, store, writable]);

  const commitNodeDrag = useCallback((_event: MouseEvent | TouchEvent, draggedNode: NodeBananaRuntimeNode) => {
    const previous = dragStartRef.current;
    dragStartRef.current = null;
    if (!previous || !writable) return;
    const bufferedPositions = store.getState().nodePositions;
    const previousPosition = bufferedPositions[draggedNode.id] ?? graph.nodes.find((node) => node.id === draggedNode.id)?.position;
    const positions = previousPosition &&
      previousPosition.x === draggedNode.position.x &&
      previousPosition.y === draggedNode.position.y
      ? bufferedPositions
      : { ...bufferedPositions, [draggedNode.id]: draggedNode.position };
    const nodes = graph.nodes.map((node) => ownEntry(positions, node.id)
      ? { ...node, position: ownEntry(positions, node.id) }
      : node);
    const changed = nodes.some((node, index) =>
      node.position.x !== graph.nodes[index]?.position.x ||
      node.position.y !== graph.nodes[index]?.position.y,
    );
    if (changed) {
      recordUndo(previous);
      const movedIds = new Set(Object.keys(positions));
      const groups = graph.groups?.map((group) => ({ ...group,
        memberNodeIds: group.memberNodeIds.filter((id) => !movedIds.has(id)),
      }));
      if (groups) for (const node of nodes) {
        if (!movedIds.has(node.id)) continue;
        const layout = ownEntry(store.getState().nodeLayout, node.id);
        const geometry = ownEntry(store.getState().nodeGeometry, node.id);
        const x = node.position.x + (layout?.measured?.width ?? geometry?.width ?? node.width ?? 300) / 2;
        const y = node.position.y + (layout?.measured?.height ?? geometry?.height ?? node.height ?? 280) / 2;
        const owner = groups.find(({ bounds: b }) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
        owner?.memberNodeIds.push(node.id);
      }
      publish({ nodes, edges: graph.edges, ...(groups ? { groups } : {}) }, "drag", false);
    }
    if (Object.keys(positions).length) store.setState({ nodePositions: {} });
  }, [graph, publish, recordUndo, store, writable]);

  const onEdgesChange = useCallback((changes: EdgeChange<NodeBananaRuntimeEdge>[]) => {
    const selection = changes.filter((change) => change.type === "select");
    if (selection.length) {
      const currentSelection = store.getState().selectedEdgeIds;
      const selected = new Set(currentSelection);
      for (const change of selection) change.selected ? selected.add(change.id) : selected.delete(change.id);
      const selectedEdgeIds = [...selected];
      if (
        selectedEdgeIds.length !== currentSelection.length ||
        selectedEdgeIds.some((id, index) => id !== currentSelection[index])
      ) store.setState({ selectedEdgeIds });
    }
    const durableChanges = changes.filter((change) => change.type !== "select");
    if (!durableChanges.length || !writable) return;
    publish({ nodes: graph.nodes, edges: applyEdgeChanges(durableChanges, graph.edges) }, "edges");
  }, [graph, publish, store, writable]);

  const onConnect = useCallback((connection: Connection) => {
    if (!writable || (isValidConnection && !isValidConnection(connection))) return;
    publish({
      nodes: graph.nodes,
      edges: addEdge({ ...connection, id: createId() }, graph.edges),
    }, "connect");
  }, [createId, graph, isValidConnection, publish, writable]);

  const openMenu = useCallback((screen: XYPosition, flow: XYPosition, pendingConnection: NodeBananaPendingConnection | null) => {
    store.setState({ menu: { open: true, screen, flow, pendingConnection, query: "" } });
  }, [store]);

  const openCenteredMenu = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    const screen = { x: Math.max(12, (rect?.width ?? 480) / 2 - 140), y: Math.max(12, (rect?.height ?? 320) / 2 - 120) };
    const client = { x: (rect?.left ?? 0) + screen.x, y: (rect?.top ?? 0) + screen.y };
    openMenu(screen, instanceRef.current?.screenToFlowPosition(client) ?? { x: 80, y: 80 }, null);
  }, [openMenu]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!writable || !state.fromNode || state.toNode) return;
    const pointer = pointerPosition(event);
    const rect = rootRef.current?.getBoundingClientRect();
    openMenu(
      { x: pointer.x - (rect?.left ?? 0), y: pointer.y - (rect?.top ?? 0) },
      instanceRef.current?.screenToFlowPosition(pointer) ?? state.to ?? { x: 80, y: 80 },
      { nodeId: state.fromNode.id, handleId: state.fromHandle?.id ?? null, handleType: state.fromHandle?.type ?? "source" },
    );
  }, [openMenu, writable]);

  useEffect(() => {
    const root=rootRef.current;
    const listener=(event: Event)=>{
      if(!writable) return;
      const detail=(event as CustomEvent).detail;
      if(!detail?.nodeId || !root || !graph.nodes.some(node=>node.id===detail.nodeId)) return;
      event.stopPropagation(); const rect=root.getBoundingClientRect();
      const flow=instanceRef.current?.screenToFlowPosition({x:detail.x,y:detail.y}) ?? {x:80,y:80};
      if(detail.handleType === "target") flow.x -= 360;
      const pendingConnection = {nodeId:detail.nodeId,handleId:detail.handleId,handleType:detail.handleType, ...(detail.replaceExisting === true ? {replaceExisting: true} : {})};
      if ((detail.action === "upload" || detail.action === "assets") && detail.handleType === "target" && (detail.mediaType === "image" || detail.mediaType === "video")) {
        const request = {mediaType: detail.mediaType, menu: {open: false, screen: {x: detail.x-rect.left, y: detail.y-rect.top}, flow, pendingConnection, query: ""}, picker: detail.action === "assets"};
        assetRequestRef.current = request;
        setAssetRequest(request);
        store.setState({menu: closedMenu});
        if (detail.action === "upload" && mediaFileRef.current) {
          mediaFileRef.current.accept = detail.mediaType + "/*";
          mediaFileRef.current.value = "";
          mediaFileRef.current.click();
        }
        return;
      }
      openMenu({x:detail.x-rect.left,y:detail.y-rect.top}, flow, pendingConnection);
    };
    root?.addEventListener("node-banana-port-menu",listener); return ()=>root?.removeEventListener("node-banana-port-menu",listener);
  },[writable,graph.nodes,openMenu,store]);
  const [assetRequest,setAssetRequest]=useState<{mediaType:"image"|"audio"|"video";menu:MenuState;picker:boolean}|null>(null);
  const assetController=useRef<AbortController|null>(null);
  const assetRequestRef=useRef(assetRequest); assetRequestRef.current=assetRequest;
  const mediaFileRef=useRef<HTMLInputElement>(null);
  const closeAssets=useCallback(()=>{const restoreFocus=assetRequestRef.current!==null;assetController.current?.abort(); assetRequestRef.current=null;setAssetRequest(null);if(restoreFocus)requestAnimationFrame(()=>rootRef.current?.focus());},[]);
  useEffect(()=>{closeAssets();return ()=>{assetController.current?.abort();assetRequestRef.current=null;};},[writable,contextId,closeAssets]);
  useEffect(()=>{const input=mediaFileRef.current;input?.addEventListener("cancel",closeAssets);return ()=>input?.removeEventListener("cancel",closeAssets);},[closeAssets]);
  const [mediaUpload, setMediaUpload] = useState<{nodeId: string; controller: AbortController} | null>(null);
  const selectConnectionMedia=async (source:File|{assetId:string})=>{
    const request=assetRequestRef.current; if(!request || !contentContext.current.writable) return;
    assetController.current?.abort(); const controller=new AbortController();assetController.current=controller;
    const original = contentContext.current.graph.nodes.find(node => node.id === request.menu.pendingConnection?.nodeId);
    const replaceInput = request.menu.pendingConnection?.handleType === "source" && original?.data.canonicalKind === "input." + request.mediaType;
    const originalConfig = JSON.stringify(original?.data.config);
    if (source instanceof File) setMediaUpload({nodeId: request.menu.pendingConnection?.nodeId ?? "", controller});
    try {
      const imported=await contentContext.current.onImportCanvasMedia?.(source,controller.signal);
      const current=contentContext.current;
      if(controller.signal.aborted || !contentMounted.current || !current.writable || assetRequestRef.current!==request || !imported) return;
      if(imported.mediaType!==request.mediaType) throw new Error("ASSET_MEDIA_TYPE_MISMATCH");
      const pending=request.menu.pendingConnection;
      if(!pending || !current.graph.nodes.some(node=>node.id===pending.nodeId)) return closeAssets();
      if (replaceInput) {
        const target = current.graph.nodes.find(node => node.id === original?.id);
        if (!target || target.data.canonicalKind !== original?.data.canonicalKind || JSON.stringify(target.data.config) !== originalConfig) throw new Error("INPUT_TARGET_CHANGED");
        current.publish({ ...current.graph, nodes: current.graph.nodes.map(node => node.id === target.id ? { ...node, data: { ...node.data, config: { ...(node.data.config as Record<string, unknown>), assetId: imported.assetId } } } : node) }, "nodes");
        closeAssets(); return;
      }
      const item=current.paletteItems.find(item=>item.kind===("input." + imported.mediaType));if(!item)return;
      const result=current.onCreateNode(item,request.menu.flow,pending);
      if(!result.edge) throw new Error("CONNECTION_NOT_AVAILABLE");
      result.node={...result.node,data:{...result.node.data,config:{assetId:imported.assetId}}};
      const retainedEdges = pending.replaceExisting ? current.graph.edges.filter(edge =>
        edge.target !== result.edge!.target || edge.targetHandle !== result.edge!.targetHandle) : current.graph.edges;
      current.publish({nodes:[...current.graph.nodes,result.node],edges:[...retainedEdges,result.edge]},"create");
      closeAssets();
    } catch(error) { if(!controller.signal.aborted) {onInputError?.(error instanceof Error?error:new Error("MEDIA_IMPORT_FAILED"));closeAssets();} }
    finally {setMediaUpload(current => current?.controller === controller ? null : current);}
  };
  const chooseNode = useCallback((item: NodeBananaRuntimePaletteItem) => {
    let result: CreateNodeResult;
    try { result = onCreateNode(item, interaction.menu.flow, interaction.menu.pendingConnection); } catch(error) { onInputError?.(error instanceof Error ? error : new Error("CONNECTION_NOT_AVAILABLE")); return; }
    publish({
      nodes: [...graph.nodes, result.node],
      edges: result.edge ? [...graph.edges, result.edge] : graph.edges,
    }, "create");
    store.setState({ menu: closedMenu, selectedNodeIds: [result.node.id], selectedEdgeIds: [] });
    rootRef.current?.focus();
  }, [graph, interaction.menu, onCreateNode, publish, store]);

  const addNodeAtCenter = useCallback((item: NodeBananaRuntimePaletteItem) => {
    if (!writable) return;
    const rect = rootRef.current?.getBoundingClientRect();
    const client = {
      x: (rect?.left ?? 0) + (rect?.width ?? 640) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 480) / 2,
    };
    const flow = instanceRef.current?.screenToFlowPosition(client) ?? { x: 80, y: 80 };
    const result = onCreateNode(item, flow, null);
    publish({
      nodes: [...graph.nodes, result.node],
      edges: result.edge ? [...graph.edges, result.edge] : graph.edges,
    }, "create");
    store.setState({ selectedNodeIds: [result.node.id], selectedEdgeIds: [] });
  }, [graph, onCreateNode, publish, store, writable]);

  const addModelAtCenter = useCallback((model: NodeBananaRuntimeModelItem) => {
    const item = paletteItems.find((candidate) => candidate.kind === `generate.${model.mediaType}`);
    if (!item) return;
    addNodeAtCenter({ ...item, initialModelKey: model.key });
    setModelBrowserOpen(false);
  }, [addNodeAtCenter, paletteItems]);

  const runSelectedNode = useCallback(() => {
    const selectedId = store.getState().selectedNodeIds[0];
    if (!selectedId || store.getState().selectedNodeIds.length !== 1) return;
    if (isNodeRunnable && !isNodeRunnable(selectedId)) return;
    onRunNode?.(selectedId);
  }, [isNodeRunnable, onRunNode, store]);

  const undo = useCallback(() => {
    if (!writable) return;
    const previous = interaction.undo.at(-1);
    if (!previous) return;
    store.setState({ undo: interaction.undo.slice(0, -1), redo: [...interaction.redo.slice(-49), cloneGraph(graph)] });
    onGraphChange(cloneGraph(previous), "undo");
  }, [graph, interaction.redo, interaction.undo, onGraphChange, store, writable]);

  const redo = useCallback(() => {
    if (!writable) return;
    const next = interaction.redo.at(-1);
    if (!next) return;
    store.setState({ redo: interaction.redo.slice(0, -1), undo: [...interaction.undo.slice(-49), cloneGraph(graph)] });
    onGraphChange(cloneGraph(next), "redo");
  }, [graph, interaction.redo, interaction.undo, onGraphChange, store, writable]);

  const copy = useCallback(() => {
    const ids = new Set(interaction.selectedNodeIds);
    if (!ids.size) return;
    store.setState({
      clipboard: {
        ...(graph.groups ? { groups: graph.groups.filter((group) => group.memberNodeIds.some((id) => ids.has(id)))
          .map((group) => ({ ...group, bounds: { ...group.bounds }, memberNodeIds: group.memberNodeIds.filter((id) => ids.has(id)) })) } : {}),
        nodes: graph.nodes.filter((node) => ids.has(node.id)).map((node) => ({ ...node, selected: false })),
        edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ ...edge, selected: false })),
      },
      pasteCount: 0,
    });
  }, [graph, interaction.selectedNodeIds, store]);

  const paste = useCallback(() => {
    if (!writable || !interaction.clipboard) return;
    const offset = 50 * (interaction.pasteCount + 1);
    const ids = new Map(interaction.clipboard.nodes.map((node) => [node.id, createId()]));
    if (graph.nodes.length + interaction.clipboard.nodes.length > 500
      || (graph.groups?.length ?? 0) + (interaction.clipboard.groups?.length ?? 0) > 500) return;
    const groupIds = Object.fromEntries((interaction.clipboard.groups ?? []).map((group) => [group.id, createId()]));
    const groups = interaction.clipboard.groups?.map((group) => ({ ...group, id: groupIds[group.id],
      bounds: { ...group.bounds, x: group.bounds.x + offset, y: group.bounds.y + offset },
      memberNodeIds: group.memberNodeIds.map((id) => ids.get(id)!).filter(Boolean),
    }));
    const copiedNodes = remapPastedNodes?.(interaction.clipboard.nodes, Object.fromEntries(ids), { x: offset, y: offset }, groupIds) ?? interaction.clipboard.nodes;
    const nodes = copiedNodes.map((node) => ({
      ...node,
      id: ids.get(node.id) as string,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      selected: false,
    }));
    const edges = interaction.clipboard.edges.map((edge) => ({
      ...edge,
      id: createId(),
      source: ids.get(edge.source) as string,
      target: ids.get(edge.target) as string,
      selected: false,
    }));
    store.setState({ clipboard: null, pasteCount: 0, selectedNodeIds: nodes.map((node) => node.id), selectedEdgeIds: [] });
    publish({ nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges],
      ...(graph.groups || groups ? { groups: [...(graph.groups ?? []), ...(groups ?? [])] } : {}),
    }, "paste");
  }, [createId, graph, interaction.clipboard, interaction.pasteCount, publish, remapPastedNodes, store, writable]);

  const removeSelection = useCallback(() => {
    if (!writable) return;
    const nodes = new Set(interaction.selectedNodeIds);
    const edges = new Set(interaction.selectedEdgeIds);
    if (!nodes.size && !edges.size) return;
    publish({
      nodes: graph.nodes.filter((node) => !nodes.has(node.id)),
      edges: graph.edges.filter((edge) => !edges.has(edge.id) && !nodes.has(edge.source) && !nodes.has(edge.target)),
    }, "delete");
    store.setState({ selectedNodeIds: [], selectedEdgeIds: [], edgeToolbarPosition: null });
  }, [graph, interaction.selectedEdgeIds, interaction.selectedNodeIds, publish, store, writable]);

  const applyToolbarNodeChanges = useCallback((changes: readonly { type: "position"; id: string; position: XYPosition }[]) => {
    if (!writable || changes.length === 0) return;
    const positions = new Map(changes.map((change) => [change.id, change.position]));
    const nodes = graph.nodes.map((node) => positions.has(node.id)
      ? { ...node, position: positions.get(node.id) as XYPosition }
      : node);
    if (nodes.every((node, index) => node.position.x === graph.nodes[index]?.position.x && node.position.y === graph.nodes[index]?.position.y)) return;
    publish({ nodes, edges: graph.edges }, "nodes");
  }, [graph, publish, writable]);

  const toggleSelectedEdgePause = useCallback((edgeId?: string) => {
    if (!writable) return;
    const selectedEdgeId = edgeId ?? store.getState().selectedEdgeIds[0];
    if (!selectedEdgeId || store.getState().selectedEdgeIds.length !== 1) return;
    publish({
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => edge.id === selectedEdgeId
        ? { ...edge, data: { ...edge.data, hasPause: !edge.data?.hasPause } }
        : edge),
    }, "edges");
  }, [graph, publish, store, writable]);

  const setSelectedEdgeLoopCount = useCallback((edgeId: string, delta: number) => {
    if (!writable) return;
    const selectedEdgeId = edgeId || store.getState().selectedEdgeIds[0];
    if (!selectedEdgeId || store.getState().selectedEdgeIds.length !== 1) return;
    const currentEdge = graph.edges.find((edge) => edge.id === selectedEdgeId);
    if (!currentEdge?.data?.isLoop) return;
    const currentCount = typeof currentEdge.data.loopCount === "number" ? currentEdge.data.loopCount : 3;
    const loopCount = Math.max(1, Math.min(100, currentCount + delta));
    if (loopCount === currentCount) return;
    publish({
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => edge.id === selectedEdgeId
        ? { ...edge, data: { ...edge.data, loopCount } }
        : edge),
    }, "edges");
  }, [graph, publish, store, writable]);

  // The upstream edge exposes its segment drag through a narrow data slot.
  // Keep that interaction ephemeral; canonical edge data only changes through
  // the host's pause/delete callbacks.
  const updateEdgeData = useCallback((edgeId: string, patch: Record<string, unknown>) => {
    const offsetX = typeof patch.offsetX === "number" ? patch.offsetX : 0;
    const offsetY = typeof patch.offsetY === "number" ? patch.offsetY : 0;
    const current = ownEntry(store.getState().edgeOffsets, edgeId);
    if (current?.offsetX === offsetX && current.offsetY === offsetY) return;
    store.setState({ edgeOffsets: { ...store.getState().edgeOffsets, [edgeId]: { offsetX, offsetY } } });
  }, [store]);

  // Event work reads the latest committed graph after asynchronous clipboard/storage
  // operations. A Space remount or read-only transition aborts the entire batch.
  const contentContext = useRef({ graph, writable, publish, onCreateNode, paletteItems, onImportCanvasMedia });
  useEffect(() => {
    contentContext.current = { graph, writable, publish, onCreateNode, paletteItems, onImportCanvasMedia };
  }, [graph, writable, publish, onCreateNode, paletteItems, onImportCanvasMedia]);
  const canvasBlocked = () => modalCount.current > 0 || Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'));
  const centerPosition = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return instanceRef.current?.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 640) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 480) / 2,
    }) ?? { x: 80, y: 80 };
  };
  const createAt = (kind: string, position: XYPosition, centered = false) => {
    if (!writable || graph.nodes.length >= 500) return;
    const item = paletteItems.find((entry) => entry.kind === kind);
    if (!item) return;
    const width = kind === "input.prompt" ? 320 : 300;
    const height = kind === "input.prompt" ? 220 : kind === "generate.image" || kind === "generate.video" ? 300 : 280;
    const result = onCreateNode(item, centered ? { x: position.x - width / 2, y: position.y - height / 2 } : position, null);
    publish({ ...graph, nodes: [...graph.nodes, result.node] }, "create");
    store.setState({ selectedNodeIds: [result.node.id], selectedEdgeIds: [], menu: closedMenu });
    rootRef.current?.focus();
  };
  const importContent = async (
    read: () => Promise<Array<File | string | { assetId: string }>>,
    position: XYPosition,
    replaceSelectedImage: boolean,
    centered: boolean,
  ) => {
    if (!writable || contentController.current || canvasBlocked()) return;
    const controller = new AbortController();
    contentController.current = controller;
    setContentBusy(true);
    const timeout = window.setTimeout(() => {
      onInputError?.(new Error("CANVAS_IMPORT_TIMEOUT"));
      controller.abort();
    }, 120_000);
    const replacement = replaceSelectedImage ? graph.nodes.find((node) =>
      store.getState().selectedNodeIds.includes(node.id) && node.data.canonicalKind === "input.image") : undefined;
    const originalConfig = replacement ? JSON.stringify(replacement.data.config) : null;
    // Native clipboard promises ignore AbortSignal. Race both that read and
    // external importers so timeout/unmount always releases this session.
    const withAbort = <T,>(pending: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Canvas import cancelled", "AbortError"));
      if (controller.signal.aborted) { abort(); return; }
      controller.signal.addEventListener("abort", abort, { once: true });
      pending.then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
    });
    try {
      const entries = await withAbort(read());
      controller.signal.throwIfAborted();
      if (entries.length > 500) throw new Error("SPACE_NODE_LIMIT");
      const prepared: Array<{ kind: string; config: Record<string, unknown> }> = [];
      for (const entry of entries) {
        controller.signal.throwIfAborted();
        if (typeof entry === "string") {
          if (!entry.trim()) continue;
          if (entry.length > 20_000) throw new Error("PROMPT_TOO_LONG");
          prepared.push({ kind: "input.prompt", config: { text: entry } });
        } else {
          const importer = contentContext.current.onImportCanvasMedia;
          if (!importer) throw new Error("MEDIA_UPLOAD_UNAVAILABLE");
          const asset = await withAbort(importer(entry, controller.signal));
          controller.signal.throwIfAborted();
          prepared.push({ kind: `input.${asset.mediaType}`, config: { assetId: asset.assetId } });
        }
      }
      const current = contentContext.current;
      if (!current.writable || controller.signal.aborted || !prepared.length) return;
      const replace = replacement && prepared.length === 1 && prepared[0].kind === "input.image";
      if (replace && !current.graph.nodes.some((node) => node.id === replacement.id
        && node.data.canonicalKind === "input.image" && JSON.stringify(node.data.config) === originalConfig)) {
        throw new Error("PASTE_TARGET_CHANGED");
      }
      if (current.graph.nodes.length + prepared.length - (replace ? 1 : 0) > 500) throw new Error("SPACE_NODE_LIMIT");
      let nodes = [...current.graph.nodes];
      const insertedIds: string[] = [];
      for (const [index, entry] of prepared.entries()) {
        if (replace) {
          nodes = nodes.map((node) => node.id === replacement.id ? {
            ...node, data: { ...node.data, config: {
              ...entry.config,
              ...((node.data.config as Record<string, unknown> | undefined)?.presentation
                ? { presentation: (node.data.config as Record<string, unknown>).presentation } : {}),
            } },
          } : node);
          insertedIds.push(replacement.id);
          continue;
        }
        const item = current.paletteItems.find((candidate) => candidate.kind === entry.kind);
        if (!item) throw new Error("NODE_TYPE_UNAVAILABLE");
        const width = entry.kind === "input.prompt" ? 320 : 300;
        const height = entry.kind === "input.prompt" ? 220 : 280;
        const result = current.onCreateNode(item, {
          x: position.x + index * 240 - (centered ? width / 2 : 0),
          y: position.y - (centered ? height / 2 : 0),
        }, null);
        nodes.push({ ...result.node, data: { ...result.node.data, config: entry.config } });
        insertedIds.push(result.node.id);
      }
      current.publish({ ...current.graph, nodes }, "paste");
      store.setState({ selectedNodeIds: insertedIds, selectedEdgeIds: [] });
    } catch (error) {
      if (!controller.signal.aborted) onInputError?.(error instanceof Error ? error : error instanceof DOMException ? Object.assign(new Error(error.message), { name: error.name }) : new Error("CANVAS_IMPORT_FAILED"));
    } finally {
      window.clearTimeout(timeout);
      if (contentController.current === controller) {
        contentController.current = null;
        if (contentMounted.current) setContentBusy(false);
      }
    }
  };
  const readSystemClipboard = async (): Promise<Array<File | string>> => {
    if (!navigator.clipboard?.read) {
      if (!navigator.clipboard?.readText) throw new Error("CLIPBOARD_UNAVAILABLE");
      return [await navigator.clipboard.readText()];
    }
    const items = await navigator.clipboard.read();
    // Search all items for an image before accepting any text.
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"));
      if (type) {
        const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" } as Record<string, string>)[type];
        if (!extension) throw new Error("CLIPBOARD_IMAGE_TYPE_UNSUPPORTED");
        return [new File([await item.getType(type)], `leesfield-pasted-image.${extension}`, { type })];
      }
    }
    for (const item of items) if (item.types.includes("text/plain")) return [await (await item.getType("text/plain")).text()];
    return [];
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229
      || isFormTarget(event.target) || canvasBlocked() || event.altKey) return;
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (!command && key === "?") { event.preventDefault(); setShortcutsOpen(true); return; }
    if (command && key === "k") { event.preventDefault(); openCenteredMenu(); return; }
    if (command && key === "c") { event.preventDefault(); copy(); return; }
    if (command && key === "v") {
      event.preventDefault();
      if (interaction.clipboard?.nodes.length) paste();
      else void importContent(readSystemClipboard, centerPosition(), true, true);
      return;
    }
    if (command && key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (command) return;
    if (event.shiftKey) {
      const kind = ({ p: "input.prompt", i: "input.image", g: "generate.image", v: "generate.video",
        a: "edit.image.annotation", t: "generate.audio", y: "input.video" } as Record<string, string>)[key];
      if (kind) { event.preventDefault(); createAt(kind, centerPosition(), true); return; }
    }
    if (!event.shiftKey && ["v", "h", "g"].includes(key)) {
      const selected = graph.nodes.filter((node) => store.getState().selectedNodeIds.includes(node.id)).map((node) => ({
        ...node, measured: ownEntry(store.getState().nodeLayout, node.id)?.measured ?? node.measured,
      }));
      if (selected.length < 2 || !writable) return;
      event.preventDefault();
      const sorted = [...selected].sort((a, b) => key === "v" ? a.position.y - b.position.y
        : key === "h" ? a.position.x - b.position.x
        : Math.floor(a.position.y / 100) - Math.floor(b.position.y / 100) || a.position.x - b.position.x);
      const startX = Math.min(...selected.map((node) => node.position.x));
      const startY = Math.min(...selected.map((node) => node.position.y));
      const width = (node: NodeBananaRuntimeNode) => Number(node.style?.width) || node.measured?.width || 220;
      const height = (node: NodeBananaRuntimeNode) => Number(node.style?.height) || node.measured?.height || 200;
      const maxWidth = Math.max(...selected.map(width)), maxHeight = Math.max(...selected.map(height));
      const cols = Math.ceil(Math.sqrt(selected.length));
      let x = startX, y = startY;
      applyToolbarNodeChanges(sorted.map((node, index) => {
        const position = key === "g" ? { x: startX + index % cols * (maxWidth + 20), y: startY + Math.floor(index / cols) * (maxHeight + 20) } : { x, y };
        if (key === "h") x += width(node) + 20;
        if (key === "v") y += height(node) + 20;
        return { type: "position" as const, id: node.id, position };
      }));
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); removeSelection(); }
    if (event.key === "Escape") store.setState({ menu: closedMenu });
  };

  const availableItems = useMemo(() => {
    return filterPaletteItems ? filterPaletteItems(paletteItems, interaction.menu.pendingConnection) : paletteItems;
  }, [filterPaletteItems, interaction.menu.pendingConnection, paletteItems]);

  const visibleNodes = useMemo(() => {
    const selected = new Set(interaction.selectedNodeIds);
    return graph.nodes.map((node) => ({
      ...node,
      ...ownEntry(interaction.nodeLayout, node.id),
      ...(ownEntry(interaction.nodeGeometry, node.id) ? {
        width: ownEntry(interaction.nodeGeometry, node.id).width,
        height: ownEntry(interaction.nodeGeometry, node.id).height,
        style: { ...node.style, width: ownEntry(interaction.nodeGeometry, node.id).width, height: ownEntry(interaction.nodeGeometry, node.id).height },
        data: { ...node.data, _settingsPanelHeight: ownEntry(interaction.nodeGeometry, node.id).settingsPanelHeight },
      } : {}),
      data: { ...node.data, ...(ownEntry(interaction.nodeGeometry, node.id) ? {_settingsPanelHeight: ownEntry(interaction.nodeGeometry, node.id).settingsPanelHeight} : {}), ...(mediaUpload?.nodeId === node.id ? {mediaUploading: true} : {}) },
      position: ownEntry(interaction.nodePositions, node.id) ?? node.position,
      groupId: graph.groups?.find((group) => group.memberNodeIds.includes(node.id))?.id,
      selected: selected.has(node.id),
    }));
  }, [mediaUpload, graph.nodes, graph.groups, interaction.nodeGeometry, interaction.nodeLayout, interaction.nodePositions, interaction.selectedNodeIds]);
  const visibleEdges = useMemo(() => {
    const selected = new Set(interaction.selectedEdgeIds);
    return graph.edges.map((edge) => ({
      ...edge,
      type: edge.type ?? "editable",
      selected: selected.has(edge.id),
      data: {
        ...edge.data,
        ...ownEntry(interaction.edgeOffsets, edge.id),
        edgeStyle: interaction.edgeStyle,
        isConnectedToSelection: Boolean(selected.has(edge.id) || interaction.selectedNodeIds.some((id) => id === edge.source || id === edge.target)),
        isTargetLoading: graph.nodes.find((node) => node.id === edge.target)?.data?.executionStatus === "processing",
        onEdgeDataChange: updateEdgeData,
      },
      style: edge.data?.hasPause ? { ...edge.style, stroke: "#ea580c" } : edge.style,
    }));
  }, [graph.edges, graph.nodes, interaction.edgeOffsets, interaction.edgeStyle, interaction.selectedEdgeIds, interaction.selectedNodeIds, updateEdgeData]);
  const selectedEdge = useMemo(
    () => graph.edges.find((edge) => interaction.selectedEdgeIds.includes(edge.id)) ?? null,
    [graph.edges, interaction.selectedEdgeIds],
  );
  const upstreamHostValue = useMemo(() => ({
    ...host,
    incrementModalCount, decrementModalCount,
    writable,
    nodes: visibleNodes as unknown as Record<string, unknown>[],
    edges: visibleEdges as unknown as Record<string, unknown>[],
    edgeStyle: interaction.edgeStyle,
    setEdgeStyle: (style: "angular" | "curved") => store.setState({ edgeStyle: style }),
    onNodesChange: applyToolbarNodeChanges,
    toggleEdgePause: toggleSelectedEdgePause,
    setLoopCount: setSelectedEdgeLoopCount,
  }), [host, incrementModalCount, decrementModalCount, applyToolbarNodeChanges, interaction.edgeStyle, setSelectedEdgeLoopCount, store, toggleSelectedEdgePause, visibleEdges, visibleNodes, writable]);
  const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    const current = store.getState().viewport;
    if (current.x === viewport.x && current.y === viewport.y && current.zoom === viewport.zoom) return;
    store.setState({ viewport });
  }, [store]);
  const fitViewOptions = useMemo(() => ({
    minZoom: graph.nodes.length <= 1
      ? 0.65
      : typeof window !== "undefined" && window.innerWidth <= 640
        ? 0.1
        : 0.2,
    maxZoom: 1,
    padding: graph.nodes.length <= 1
      ? 0.08
      : typeof window !== "undefined" && window.innerWidth <= 640
        ? { top: "24px" as const, right: "24px" as const, bottom: "144px" as const, left: "24px" as const }
        : 0.2,
  }), [graph.nodes.length]);

  return (
    <NodeBananaUpstreamHostProvider value={upstreamHostValue}>
      <ReactFlowProvider>
        <div ref={rootRef} className={`node-banana-runtime ${className ?? ""}`} role="application" aria-label={labels.application} tabIndex={0} onKeyDown={onKeyDown} data-node-banana-component="WorkflowCanvas"
          aria-busy={contentBusy}
          onPaste={(event) => {
            if (event.defaultPrevented || isFormTarget(event.target) || canvasBlocked()) return;
            event.preventDefault();
            if (interaction.clipboard?.nodes.length) { paste(); return; }
            const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            const text = event.clipboardData.getData("text/plain");
            void importContent(async () => files.length ? [files[0]] : [text], centerPosition(), true, true);
          }}
          onDragOver={(event) => {
            if (event.defaultPrevented || isFormTarget(event.target) || !writable || canvasBlocked()) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            if (event.defaultPrevented || isFormTarget(event.target) || !writable || canvasBlocked()) return;
            event.preventDefault();
            event.stopPropagation();
            const position = instanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 80, y: 80 };
            const kind = event.dataTransfer.getData("application/node-type");
            if (kind) { createAt(kind, position); return; }
            const history = event.dataTransfer.getData("application/history-image");
            if (history) {
              try {
                const parsed = JSON.parse(history) as { assetId?: unknown };
                if (typeof parsed.assetId !== "string" || !parsed.assetId) throw new Error("HISTORY_ASSET_REQUIRED");
                void importContent(async () => [{ assetId: parsed.assetId as string }], position, false, false);
              } catch (error) { onInputError?.(error instanceof Error ? error : new Error("HISTORY_ASSET_REQUIRED")); }
              return;
            }
            const files = Array.from(event.dataTransfer.files).filter((file) => /^(image|audio|video)\//.test(file.type));
            if (files.length) void importContent(async () => files, position, false, false);
          }}>
          <input ref={mediaFileRef} type="file" hidden onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void selectConnectionMedia(file);else closeAssets();}}/>
          {assetRequest?.picker && renderAssetPicker?.(assetRequest.mediaType,assetId=>void selectConnectionMedia({assetId}),closeAssets)}
          <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} hosted />
      <ReactFlow<NodeBananaRuntimeNode, NodeBananaRuntimeEdge>
        ariaLabelConfig={{ "controls.zoomIn.ariaLabel": tc("Zoom In"), "controls.zoomOut.ariaLabel": tc("Zoom Out"), "controls.fitView.ariaLabel": tc("Fit View") }}
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={runtimeEdgeTypes}
        onInit={(instance) => {
          instanceRef.current = instance;
          window.setTimeout(() => {
            const onlyNode = graph.nodes.length === 1 ? graph.nodes[0] : null;
            if (onlyNode) {
              void instance.setCenter(
                onlyNode.position.x + ((onlyNode.measured?.width ?? onlyNode.width ?? 300) / 2),
                onlyNode.position.y + ((onlyNode.measured?.height ?? onlyNode.height ?? 240) / 2),
                { zoom: 0.8 },
              );
            } else {
              void instance.fitView({
                minZoom: 0.1,
                maxZoom: 1,
                padding: typeof window !== "undefined" && window.innerWidth <= 640 ? 0.4 : 0.2,
              });
            }
          }, 120);
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeDragStart={() => {
          const positions = store.getState().nodePositions;
          dragStartRef.current = cloneGraph({
            ...graph,
            nodes: graph.nodes.map((node) => ownEntry(positions, node.id)
              ? { ...node, position: ownEntry(positions, node.id) }
              : node),
            edges: graph.edges,
          });
        }}
        onNodeDragStop={commitNodeDrag}
        onEdgeClick={(event, edge) => {
          store.setState({
            selectedNodeIds: [],
            selectedEdgeIds: [edge.id],
            edgeToolbarPosition: { x: event.clientX, y: event.clientY - 40 },
          });
        }}
        onMoveEnd={onMoveEnd}
        nodesDraggable={writable}
        nodesConnectable={writable}
        elementsSelectable
        selectionOnDrag={
          canvasSettings.selectionMode === "altDrag" || canvasSettings.selectionMode === "shiftDrag" ? false : canvasSettings.panMode === "always" ? false : typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
        }
        selectionKeyCode={canvasSettings.selectionMode === "altDrag" ? "Alt" : "Shift"}
        panOnDrag={
          canvasSettings.panMode === "always" ? true : canvasSettings.panMode === "middleMouse" ? [1] : !(typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform))
        }
        panActivationKeyCode={canvasSettings.panMode === "space" ? "Space" : null}
        zoomOnScroll
        zoomActivationKeyCode={canvasSettings.zoomMode === "altScroll" ? "Alt" : canvasSettings.zoomMode === "ctrlScroll" ? ["Control", "Meta"] : null}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        fitViewOptions={fitViewOptions}
        proOptions={{ hideAttribution: true }}
        minZoom={graph.nodes.length <= 1 ? 0.65 : 0.1}
        maxZoom={4}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).classList.contains("react-flow__pane")) {
            const rect = rootRef.current?.getBoundingClientRect();
            const screen = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
            openMenu(screen, instanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 80, y: 80 }, null);
          }
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          const rect = rootRef.current?.getBoundingClientRect();
          const screen = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
          openMenu(screen, instanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 80, y: 80 }, null);
        }}
        defaultEdgeOptions={{ type: "editable" }}
      >
        <UpstreamSharedEdgeGradients />
        {canvasOverlay}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--node-banana-grid, #404040)" />
        <MiniMap pannable zoomable ariaLabel={labels.fitView} nodeStrokeWidth={2} maskColor="rgba(0,0,0,0.6)" style={{ width: 200, height: 150, margin: 15 }} />
        <Controls showInteractive={false} fitViewOptions={fitViewOptions} />
        {renderNodeHeader ? (
          <ViewportPortal>
            {visibleNodes.map((node) => (
              <Fragment key={`header-${node.id}`}>
                {renderNodeHeader(node)}
              </Fragment>
            ))}
          </ViewportPortal>
        ) : null}
        <Panel position="bottom-center">
          <HostedFloatingActionBar
            labels={labels}
            writable={writable}
            items={paletteItems}
            selectedNodeCount={interaction.selectedNodeIds.length}
            runEnabled={
              interaction.selectedNodeIds.length === 1 &&
              (isNodeRunnable?.(interaction.selectedNodeIds[0]) ?? true) &&
              Boolean(onRunNode)
            }
            onAddItem={addNodeAtCenter}
            onBrowseModels={() => setModelBrowserOpen(true)}
            onRunSelected={runSelectedNode}
            edgeStyle={interaction.edgeStyle}
            onToggleEdgeStyle={() => store.setState({ edgeStyle: interaction.edgeStyle === "angular" ? "curved" : "angular" })}
          />
        </Panel>
      </ReactFlow>
      <HostedModelBrowserDialog open={modelBrowserOpen} models={modelItems} onChoose={addModelAtCenter} onClose={() => setModelBrowserOpen(false)} />
      <UpstreamMultiSelectToolbar
        hosted={{
          nodes: visibleNodes as unknown as MultiSelectToolbarHostedProps["nodes"],
          viewport: interaction.viewport,
          writable,
          ariaLabel: "Selected nodes",
          onNodesChange: applyToolbarNodeChanges,
          onCopy: copy,
          onDelete: () => removeSelection(),
          onCreateGroup: onCreateGroup ? (ids) => onCreateGroup(ids, visibleNodes) : undefined,
          onUngroup,
          onDownloadSelected: onDownloadSelectedImages,
          downloadingImages,
        }}
      />
      <UpstreamEdgeToolbar
        hosted={{
          edge: selectedEdge as EdgeToolbarHostedProps["edge"],
          position: selectedEdge && interaction.edgeToolbarPosition ? interaction.edgeToolbarPosition : null,
          writable,
          ariaLabel: "Selected edge",
          onTogglePause: toggleSelectedEdgePause,
          onDelete: () => removeSelection(),
          onLoopCountChange: setSelectedEdgeLoopCount,
        }}
      />
      {!writable ? <p className="node-banana-runtime__readonly" role="status">{labels.readOnly}</p> : null}
      {interaction.menu.pendingConnection ? (
        <HostedConnectionDropMenu
          inputMedia={interaction.menu.pendingConnection.handleType === "source" && graph.nodes.some(node => node.id === interaction.menu.pendingConnection?.nodeId && node.data.canonicalKind === "input." + pendingHandleType(interaction.menu.pendingConnection))}
          root={rootRef.current}
          labels={labels}
          menu={interaction.menu}
          items={availableItems}
          onMedia={(action,mediaType)=>{const request={mediaType,menu:interaction.menu,picker:action==="assets"};assetRequestRef.current=request;setAssetRequest(request);store.setState({menu:closedMenu});if(action==="upload"){const input=mediaFileRef.current;if(input){input.accept=(mediaType + "/*");input.value="";input.click();}}}}
          onChoose={chooseNode}
          onClose={() => {
            store.setState({ menu: closedMenu });
            rootRef.current?.focus();
          }}
        />
      ) : (
        <HostedNodeSearchMenu
          root={rootRef.current}
          labels={labels}
          menu={interaction.menu}
          items={availableItems}
          onChoose={chooseNode}
          onClose={() => {
            store.setState({ menu: closedMenu });
            rootRef.current?.focus();
          }}
        />
      )}
        </div>
      </ReactFlowProvider>
    </NodeBananaUpstreamHostProvider>
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = { failed: boolean };

export class NodeBananaCanvasErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
