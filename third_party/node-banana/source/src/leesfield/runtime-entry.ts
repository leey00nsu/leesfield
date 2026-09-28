export { buildCellInstances } from "../store/utils/splitGridTemplate";
export { ModelSearchDialog } from "../components/modals/ModelSearchDialog";
export type { ModelSearchDialogHostedProps } from "../components/modals/ModelSearchDialog";
export { GroupBackgroundsPortal, GroupControlsOverlay } from "../components/GroupsOverlay";
export {
  NodeBananaCanvasErrorBoundary,
  NodeBananaCanvasRuntime,
} from "./canvas-runtime";
export type {
  NodeBananaCanvasLabels,
  NodeBananaCanvasProps,
  NodeBananaCanvasReason,
  NodeBananaCanvasSettings,
  NodeBananaPendingConnection,
  NodeBananaRuntimeEdge,
  NodeBananaRuntimeGraph,
  NodeBananaRuntimeModelItem,
  NodeBananaRuntimeNode,
  NodeBananaRuntimePaletteItem,
} from "./canvas-runtime";
export { NodeBananaHostedHeader, CommentsNavigationIcon } from "./hosted-header";
export { clearThumbnailCache } from "./upstream-node-host";
export type { HostedNodeDefaults, HostedDefaultKind } from "./hosted-project-setup";
export type {
  NodeBananaHeaderGraph,
  NodeBananaHostedHeaderProps,
} from "./hosted-header";

export { processImageOperation } from "./image-operation-processors";
export type {
  AnnotationShape,
  ImageOperationKind,
  ImageOperationParameters,
  ImageOperationRequest,
  ImageOperationResult,
  ImageOperationResultItem,
  ResizeOperationParameters,
  SplitGridOperationParameters,
  GifOperationParameters,
} from "./image-operation-processors";

export { processVideoOperation } from "./video-operation-processors";
export type {
  EaseCurveParameters,
  FrameGrabParameters,
  StitchVideoParameters,
  TrimVideoParameters,
  VideoOperationInput,
  VideoOperationKind,
  VideoOperationParameters,
  VideoOperationRequest,
  VideoOperationResult,
  VideoOperationResultItem,
} from "./video-operation-processors";

/**
 * Node Banana v1.9.0's actual node presenters, exposed through the host
 * facade. The facade removes upstream stores/provider clients while keeping
 * the component implementation and component identity intact.
 */
export {
  NodeBananaUpstreamNode,
  NodeBananaUpstreamHeader,
  canonicalPatchForNode,
  upstreamDataForNode,
  nodeBananaUpstreamComponents,
  nodeBananaUpstreamComponentNames,
} from "./upstream-node-components";
export type {
  NodeBananaUpstreamCanonicalKind,
  NodeBananaUpstreamHeaderProps,
  NodeBananaUpstreamNodeProps,
} from "./upstream-node-components";
export { AnnotationModal } from "../components/AnnotationModal";
export { FloatingNodeHeader } from "../components/nodes/FloatingNodeHeader";
export type { ProviderModel as NodeBananaProviderModel } from "./upstream-node-host";

/**
 * Node Banana v1.9.0 canvas presenters. These exports intentionally point at
 * the vendored implementations; `canvas-runtime` only supplies the hosted
 * props/data slots needed to bridge Leesfield's canonical graph.
 */
export { EditableEdge } from "../components/edges/EditableEdge";
export type { EditableEdgeHostedProps, EditableEdgeProps } from "../components/edges/EditableEdge";
export { EdgeToolbar } from "../components/EdgeToolbar";
export type { EdgeToolbarHostedEdge, EdgeToolbarHostedProps, EdgeToolbarProps } from "../components/EdgeToolbar";
export { MultiSelectToolbar } from "../components/MultiSelectToolbar";
export type {
  MultiSelectToolbarHostedNode,
  MultiSelectToolbarHostedProps,
  MultiSelectToolbarProps,
} from "../components/MultiSelectToolbar";

export const NODE_BANANA_UPSTREAM_VERSION = "1.9.0" as const;

export const LEESFIELD_RUNTIME_FEATURES = [
  "canvas",
  "typed-nodes",
  "media-processing",
] as const;

export type LeesfieldRuntimeFeature =
  (typeof LEESFIELD_RUNTIME_FEATURES)[number];

export { NodeBananaUpstreamHostProvider } from "./upstream-node-host";

export { HostedQuickstart } from "./hosted-quickstart";
export type { HostedPresetWorkflow } from "./hosted-preset-types";

export { TutorialOverlay as HostedTutorial } from "../components/onboarding/TutorialOverlay";

export { NodeBananaUpstreamControlPanel } from "./upstream-node-components";
