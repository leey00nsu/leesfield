import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent } from "storybook/test";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NodeBananaHostedHeader } from "@node-banana-runtime/runtime-entry";

import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import {
  authoringValuesToImageConfig,
  resolveImageAuthoringDefaults,
} from "@/shared/generation/image-authoring";
import type { RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import {
  runtimeImageModelsFixture,
  runtimeVideoModelsFixture,
} from "@/test-utils/fixtures/runtime-model-catalog";

import type { GraphAutosaveStatus } from "../hook/use-graph-autosave";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import type { NodeExecutionStatus } from "../model/node-execution-types";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { NodeStudio } from "./node-studio";

const emptyGraph: GenerationGraphSnapshotDto = {
  id: "storybook-graph",
  title: "Campaign concept",
  version: 4,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  writable: true,
  readOnlyReason: null,
  nodes: [],
  edges: [],
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

const storyModel = runtimeImageModelsFixture[0]!;
const storyConfig = authoringValuesToImageConfig(
  resolveImageAuthoringDefaults(
    storyModel,
    "Editorial product photograph of a translucent lime glass sculpture",
  ),
  storyModel,
);

const populatedGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  nodes: [
    {
      id: "hero-image",
      kind: "generate.image",
      position: { x: 80, y: 140 },
      configVersion: 1,
      config: storyConfig,
      selectedOutputAssetId: null,
    },
    {
      id: "variation",
      kind: "generate.image",
      position: { x: 460, y: 260 },
      configVersion: 1,
      config: {
        prompt: "A cinematic variation using the selected output",
        modelKey: "retired/image-model",
        parameters: { width: 1024, height: 1024 },
      },
      selectedOutputAssetId: null,
    },
  ],
  edges: [
    {
      id: "primary-edge",
      sourceNodeId: "hero-image",
      targetNodeId: "variation",
      sourcePortId: "image",
      targetPortId: "primary",
      sortOrder: 0,
    },
  ],
};

const readyInputGraph: GenerationGraphSnapshotDto = {
  ...populatedGraph,
  nodes: populatedGraph.nodes.map((node) =>
    node.id === "hero-image"
      ? { ...node, selectedOutputAssetId: "storybook-image" }
      : node,
  ),
};

const unsupportedGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  writable: false,
  readOnlyReason: "UNKNOWN_NODE_KIND",
  nodes: [
    {
      id: "future-node",
      kind: "future.media.magic",
      position: { x: 180, y: 180 },
      configVersion: 1,
      config: { raw: "preserved" },
      selectedOutputAssetId: null,
    },
  ],
  edges: [],
};

const storyAudioModel: RuntimeAudioModel = {
  type: "audio",
  key: "storybook-audio",
  label: "Studio Voice",
  vendor: "Leesfield",
  provider: "hf_space",
  parameters: {
    voice: { ui: "select", label: "Voice", options: ["alloy", "verse"], default: "alloy" },
    speed: { ui: "range", label: "Speed", min: 0.5, max: 2, step: 0.05, default: 1 },
    seed: { ui: "input", label: "Seed", default: "" },
  },
  meta: { default_speed: 1, supports_input_audio: false },
  isActive: true,
  isDefault: true,
};

const storyVideoModel = runtimeVideoModelsFixture[0]!;
const multiMediaGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  id: "storybook-multi-media-graph",
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  writable: true,
  readOnlyReason: null,
  nodes: [
    {
      id: "image-generation",
      kind: "generate.image",
      position: { x: 60, y: 150 },
      configVersion: 1,
      config: storyConfig,
      selectedOutputAssetId: null,
    },
    {
      id: "audio-generation",
      kind: "generate.audio",
      position: { x: 430, y: 150 },
      configVersion: 1,
      config: {
        prompt: "Warm narration for an evening campaign",
        modelKey: storyAudioModel.key,
        parameters: { voice: "alloy", speed: 1, seed: "" },
      },
      selectedOutputAssetId: null,
    },
    {
      id: "video-generation",
      kind: "generate.video",
      position: { x: 800, y: 150 },
      configVersion: 1,
      config: {
        prompt: "Slow orbit around a translucent lime sculpture",
        modelKey: storyVideoModel.key,
        parameters: {
          aspectRatio: "16:9",
          resolution: 720,
          durationSec: 3,
          fps: 16,
          steps: 6,
          guidanceScale: 1,
          seed: "",
        },
      },
      selectedOutputAssetId: null,
    },
  ],
  edges: [],
};
const multiMediaNarrowGraph: GenerationGraphSnapshotDto = {
  ...multiMediaGraph,
  nodes: multiMediaGraph.nodes.map((node, index) => ({
    ...node,
    position: { x: 70, y: 90 + index * 470 },
  })),
};

const promptParityGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  id: "storybook-prompt-parity-graph",
  nodes: [
    {
      id: "prompt-input",
      kind: "input.prompt",
      position: { x: 100, y: 210 },
      configVersion: 1,
      config: { text: "Prompt supplied by the connected Prompt node" },
      selectedOutputAssetId: null,
    },
    {
      id: "prompt-generation",
      kind: "generate.image",
      position: { x: 540, y: 120 },
      configVersion: 1,
      config: { ...storyConfig, prompt: "Preserved internal prompt" },
      selectedOutputAssetId: null,
    },
  ],
  edges: [{
    id: "paused-prompt-edge",
    sourceNodeId: "prompt-input",
    sourcePortId: "text",
    targetNodeId: "prompt-generation",
    targetPortId: "prompt",
    sortOrder: 0,
    hasPause: true,
  }],
};

const storyImageAsset: MediaAssetDto = {
  id: "storybook-image-asset",
  version: 1,
  type: "image",
  status: "completed",
  origin: "generation",
  mimeType: "image/png",
  bytes: "24000",
  width: 1024,
  height: 1024,
  durationMs: null,
  sourceOperationId: null,
  url: "/sample-image.png",
  createdAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:00.000Z",
};
const storyAltImageAsset: MediaAssetDto = {
  ...storyImageAsset,
  id: "storybook-alt-image-asset",
  origin: "media_operation",
  url: "/assets/creative-studio/blue-mosaic.jpg",
};
const storyAudioAsset: MediaAssetDto = {
  ...storyImageAsset,
  id: "storybook-audio-asset",
  type: "audio",
  origin: "generation",
  mimeType: "audio/wav",
  width: null,
  height: null,
  durationMs: 12_000,
  url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
};
const mediaAssetGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  id: "storybook-media-assets-graph",
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  writable: true,
  readOnlyReason: null,
  nodes: [
    { id: "image-input-a", kind: "input.image", position: { x: 70, y: 100 }, configVersion: 1, config: { assetId: storyImageAsset.id }, selectedOutputAssetId: null },
    { id: "image-output", kind: "output.single", position: { x: 450, y: 100 }, configVersion: 1, config: { mediaType: "image" }, selectedOutputAssetId: null },
    { id: "image-input-b", kind: "input.image", position: { x: 70, y: 430 }, configVersion: 1, config: { assetId: storyAltImageAsset.id }, selectedOutputAssetId: null },
    { id: "image-compare", kind: "inspect.imageCompare", position: { x: 450, y: 430 }, configVersion: 1, config: {}, selectedOutputAssetId: null },
    { id: "audio-input", kind: "input.audio", position: { x: 830, y: 100 }, configVersion: 1, config: { assetId: storyAudioAsset.id }, selectedOutputAssetId: null },
    { id: "audio-gallery", kind: "output.gallery", position: { x: 1210, y: 100 }, configVersion: 1, config: { mediaType: "audio" }, selectedOutputAssetId: null },
  ],
  edges: [
    { id: "edge-output", sourceNodeId: "image-input-a", targetNodeId: "image-output", sourcePortId: "image", targetPortId: "image", sortOrder: 0 },
    { id: "edge-before", sourceNodeId: "image-input-a", targetNodeId: "image-compare", sourcePortId: "image", targetPortId: "before", sortOrder: 0 },
    { id: "edge-after", sourceNodeId: "image-input-b", targetNodeId: "image-compare", sourcePortId: "image", targetPortId: "after", sortOrder: 0 },
    { id: "edge-gallery", sourceNodeId: "audio-input", targetNodeId: "audio-gallery", sourcePortId: "audio", targetPortId: "audio", sortOrder: 0 },
  ],
};
const mediaAssetNarrowGraph: GenerationGraphSnapshotDto = {
  ...mediaAssetGraph,
  nodes: mediaAssetGraph.nodes
    .filter((node) => node.id === "audio-input" || node.id === "audio-gallery")
    .map((node, index) => ({ ...node, position: { x: 70, y: 100 + index * 390 } })),
  edges: mediaAssetGraph.edges.filter((edge) => edge.id === "edge-gallery"),
};
const imageEditGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  id: "storybook-image-edit-graph",
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  writable: true,
  readOnlyReason: null,
  nodes: [
    { id: "edit-input", kind: "input.image", position: { x: 60, y: 220 }, configVersion: 1, config: { assetId: storyImageAsset.id }, selectedOutputAssetId: null },
    { id: "annotation", kind: "edit.image.annotation", position: { x: 430, y: 20 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null },
    { id: "resize", kind: "edit.image.resize", position: { x: 780, y: 20 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null },
    { id: "remove-bg", kind: "edit.image.removeBackground", position: { x: 430, y: 390 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null },
    { id: "split-grid", kind: "edit.image.splitGrid", position: { x: 780, y: 390 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null },
    { id: "gif", kind: "edit.image.gif", position: { x: 1130, y: 220 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null },
  ],
  edges: ["annotation", "resize", "remove-bg", "split-grid", "gif"].map((target) => ({
    id: `edit-edge-${target}`,
    sourceNodeId: "edit-input",
    targetNodeId: target,
    sourcePortId: "image",
    targetPortId: target === "gif" ? "frames" : "image",
    sortOrder: 0,
  })),
};
const imageEditNarrowGraph: GenerationGraphSnapshotDto = {
  ...imageEditGraph,
  nodes: imageEditGraph.nodes
    .filter((node) => ["edit-input", "resize", "split-grid"].includes(node.id))
    .map((node, index) => ({ ...node, position: { x: 45, y: 70 + index * 360 } })),
  edges: imageEditGraph.edges.filter((edge) => ["resize", "split-grid"].includes(edge.targetNodeId)),
};

type NodeStudioShowcaseProps = {
  populated: boolean;
  status: GraphAutosaveStatus;
  narrow?: boolean;
  catalogError?: boolean;
  executionStatus?: NodeExecutionStatus;
  inputReady?: boolean;
  nodeBanana?: boolean;
  readOnly?: boolean;
  unsupported?: boolean;
  multiMedia?: boolean;
  mediaAssets?: boolean;
  imageEdits?: boolean;
  promptParity?: boolean;
};

function NodeStudioShowcase({
  populated,
  status,
  narrow,
  catalogError,
  executionStatus,
  inputReady,
  readOnly,
  unsupported,
  multiMedia,
  mediaAssets,
  imageEdits,
  promptParity,
}: NodeStudioShowcaseProps) {
  const queryClient = useQueryClient();
  if (multiMedia) {
    for (const nodeId of ["image-generation", "audio-generation", "video-generation"]) {
      const key = nodeExecutionKeys.list(multiMediaGraph.id, nodeId);
      queryClient.setQueryDefaults(key, { staleTime: Infinity });
      queryClient.setQueryData(key, []);
    }
  }
  if (mediaAssets) {
    for (const asset of [storyImageAsset, storyAltImageAsset, storyAudioAsset]) {
      queryClient.setQueryDefaults(mediaAssetKeys.detail(asset.id), { staleTime: Infinity });
      queryClient.setQueryData(mediaAssetKeys.detail(asset.id), asset);
    }
    for (const [type, items] of [
      ["image", [storyImageAsset, storyAltImageAsset]],
      ["audio", [storyAudioAsset]],
      ["video", []],
    ] as const) {
      queryClient.setQueryDefaults(mediaAssetKeys.list(type), { staleTime: Infinity });
      queryClient.setQueryData(mediaAssetKeys.list(type), {
        pages: [{ items, nextCursor: null }],
        pageParams: [null],
      });
    }
    const outputFixtures = {
      "image-output": { nodeId: "image-output", kind: "output.single", mediaType: "image", groups: [{ portId: "media", assets: [storyImageAsset] }] },
      "image-compare": { nodeId: "image-compare", kind: "inspect.imageCompare", mediaType: "image", groups: [{ portId: "before", assets: [storyImageAsset] }, { portId: "after", assets: [storyAltImageAsset] }] },
      "audio-gallery": { nodeId: "audio-gallery", kind: "output.gallery", mediaType: "audio", groups: [{ portId: "media", assets: [storyAudioAsset] }] },
    } as const;
    for (const [nodeId, value] of Object.entries(outputFixtures)) {
      const key = mediaAssetKeys.nodeOutput(mediaAssetGraph.id, nodeId);
      queryClient.setQueryDefaults(key, { staleTime: Infinity });
      queryClient.setQueryData(key, value);
    }
  }
  if (imageEdits) {
    queryClient.setQueryDefaults(mediaAssetKeys.detail(storyImageAsset.id), { staleTime: Infinity });
    queryClient.setQueryData(mediaAssetKeys.detail(storyImageAsset.id), storyImageAsset);
    queryClient.setQueryDefaults(mediaAssetKeys.list("image"), { staleTime: Infinity });
    queryClient.setQueryData(mediaAssetKeys.list("image"), {
      pages: [{ items: [storyImageAsset], nextCursor: null }],
      pageParams: [null],
    });
    for (const node of imageEditGraph.nodes.filter((candidate) => candidate.kind?.startsWith("edit.image."))) {
      const key = nodeExecutionKeys.list(imageEditGraph.id, node.id);
      queryClient.setQueryDefaults(key, { staleTime: Infinity });
      queryClient.setQueryData(key, []);
    }
  }
  if (promptParity) {
    const key = nodeExecutionKeys.list(promptParityGraph.id, "prompt-generation");
    queryClient.setQueryDefaults(key, { staleTime: Infinity });
    queryClient.setQueryData(key, []);
  }
  useEffect(() => {
    if (!executionStatus) return;
    queryClient.setQueryData(mediaAssetKeys.detail(storyImageAsset.id), storyImageAsset);
    queryClient.setQueryData(
      nodeExecutionKeys.list(populatedGraph.id, "hero-image"),
      [
        {
          executionId: `storybook-${executionStatus}`,
          executionKind: "generation",
          mediaType: "image",
          graphNodeId: "hero-image",
          status: executionStatus,
          progress: executionStatus === "processing" ? 48 : executionStatus === "completed" ? 100 : 0,
          errorCode: executionStatus === "failed" ? "GENERATION_FAILED" : null,
          createdAt: "2026-08-24T00:00:00.000Z",
          modelKey: storyModel.key,
          outputAssetIds: executionStatus === "completed" ? [storyImageAsset.id] : [],
        },
      ],
    );
  }, [executionStatus, queryClient]);
  const selectedGraph = promptParity
    ? promptParityGraph
    : imageEdits
    ? (narrow ? imageEditNarrowGraph : imageEditGraph)
    : mediaAssets
      ? (narrow ? mediaAssetNarrowGraph : mediaAssetGraph)
      : multiMedia
        ? (narrow ? multiMediaNarrowGraph : multiMediaGraph)
        : unsupported
          ? unsupportedGraph
          : populated
            ? (inputReady ? readyInputGraph : populatedGraph)
            : emptyGraph;
  const displayedGraph: GenerationGraphSnapshotDto = readOnly
    ? { ...selectedGraph, writable: false, readOnlyReason: "STORYBOOK_READ_ONLY" }
    : selectedGraph;
  const saveLabel = {
    saved: "Saved",
    dirty: "Unsaved changes",
    saving: "Saving...",
    error: "Save failed",
    conflict: "Newer version available",
  }[status];

  return (
    <main className={`flex h-screen flex-col overflow-hidden bg-neutral-900 text-white ${narrow ? "w-[390px]" : "min-w-[960px]"}`}>
      <NodeBananaHostedHeader
        title={displayedGraph.title}
        graphs={[{ id: displayedGraph.id, title: displayedGraph.title }]}
        activeGraphId={displayedGraph.id}
        saveLabel={saveLabel}
        saving={status === "saving"}
        writable={!readOnly}
        onTitleChange={() => undefined}
        onSelectGraph={() => undefined}
        onCreateGraph={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
      <NodeStudio
        graph={displayedGraph}
        onDraftChange={() => undefined}
        catalog={{
          imageModels: catalogError ? [] : runtimeImageModelsFixture,
          videoModels: catalogError ? [] : runtimeVideoModelsFixture,
          audioModels: catalogError ? [] : [storyAudioModel],
          isLoading: false,
          error: catalogError ? "MODEL_CATALOG_FETCH_FAILED" : null,
          retry: () => undefined,
          backgroundRemovalAvailable: imageEdits,
        }}
      />
    </main>
  );
}

const meta = {
  title: "Features/Node Studio/Canvas",
  component: NodeStudioShowcase,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NodeStudioShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { populated: false, status: "saved" },
};

export const Populated: Story = {
  args: { populated: true, status: "saved" },
};

async function selectFirstNode(canvasElement: HTMLElement) {
  const node = canvasElement.querySelector<HTMLElement>(".react-flow__node");
  if (node) await userEvent.click(node);
  return node;
}

export const SelectedAuthoring: Story = {
  args: { populated: true, status: "saved" },
  play: async ({ canvasElement }) => {
    await selectFirstNode(canvasElement);
  },
};

export const InputReadiness: Story = {
  args: { populated: true, status: "saved", inputReady: true },
  play: async ({ canvasElement }) => {
    const nodes = canvasElement.querySelectorAll<HTMLElement>(".react-flow__node");
    if (nodes[1]) await userEvent.click(nodes[1]);
  },
};

export const ModelPickerOpen: Story = {
  args: { populated: true, status: "saved" },
  play: async ({ canvasElement }) => {
    const node = await selectFirstNode(canvasElement);
    const modelPicker = node?.querySelector<HTMLElement>("button[aria-haspopup='dialog']");
    if (modelPicker) await userEvent.click(modelPicker);
  },
};

export const ParameterSettingsOpen: Story = {
  args: { populated: true, status: "saved" },
  play: async ({ canvasElement }) => {
    const node = await selectFirstNode(canvasElement);
    const settings = node?.querySelectorAll<HTMLElement>("button[aria-haspopup='dialog']");
    const last = settings?.[settings.length - 1];
    if (last) await userEvent.click(last);
  },
};

export const CatalogError: Story = {
  args: { populated: true, status: "error", catalogError: true },
  play: async ({ canvasElement }) => {
    await selectFirstNode(canvasElement);
  },
};

export const UnavailableModelNarrow: Story = {
  args: { populated: true, status: "saved", narrow: true },
  play: async ({ canvasElement }) => {
    const nodes = canvasElement.querySelectorAll<HTMLElement>(".react-flow__node");
    if (nodes[1]) await userEvent.click(nodes[1]);
  },
};

export const SaveError: Story = {
  args: { populated: true, status: "error" },
};

export const ConflictNarrow: Story = {
  args: { populated: true, status: "conflict", narrow: true },
};

export const NodeBananaEmpty: Story = {
  args: { populated: false, status: "saved", nodeBanana: true },
};

export const NodeBananaDesktop: Story = {
  args: { populated: true, status: "saved", nodeBanana: true },
};

export const NodeBananaNodeMenu: Story = {
  args: { populated: true, status: "saved", nodeBanana: true },
  play: async ({ canvasElement }) => {
    const add = canvasElement.querySelector<HTMLElement>(
      ".node-banana-runtime__toolbar button:first-child",
    );
    if (add) await userEvent.click(add);
  },
};

export const NodeBananaReadOnly: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    readOnly: true,
  },
};

export const NodeBananaUnsupportedNode: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    unsupported: true,
  },
};

export const NodeBananaNarrow390: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    narrow: true,
  },
};

export const NodeBananaGenerationNodes: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    multiMedia: true,
  },
  play: async ({ canvasElement }) => {
    const expanders = canvasElement.querySelectorAll<HTMLElement>(
      "button[aria-label='Expand editor']",
    );
    for (const expander of expanders) await userEvent.click(expander);
  },
};

export const NodeBananaGenerationNodesNarrow390: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    multiMedia: true,
    narrow: true,
  },
  play: async ({ canvasElement }) => {
    const expanders = canvasElement.querySelectorAll<HTMLElement>(
      "button[aria-label='Expand editor']",
    );
    for (const expander of expanders) await userEvent.click(expander);
  },
};

export const NodeBananaMediaAssets: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    mediaAssets: true,
  },
};

export const NodeBananaAudioGalleryNarrow390: Story = {
  args: {
    populated: true,
    status: "saved",
    nodeBanana: true,
    mediaAssets: true,
    narrow: true,
  },
};

export const NodeBananaImageOperations: Story = {
  args: {
    populated: false,
    status: "saved",
    nodeBanana: true,
    imageEdits: true,
  },
};

export const NodeBananaImageOperationsNarrow390: Story = {
  args: {
    populated: false,
    status: "saved",
    nodeBanana: true,
    imageEdits: true,
    narrow: true,
  },
};

export const NodeBananaPromptAndPausedEdge: Story = {
  args: {
    populated: false,
    status: "saved",
    nodeBanana: true,
    promptParity: true,
  },
  play: async ({ canvasElement }) => {
    const expander = canvasElement.querySelector<HTMLElement>("button[aria-label='Expand editor']");
    if (expander) await userEvent.click(expander);
  },
};

export const NodeBananaPromptAndPausedEdgeNarrow390: Story = {
  ...NodeBananaPromptAndPausedEdge,
  args: {
    ...NodeBananaPromptAndPausedEdge.args,
    narrow: true,
  },
};

export const ExecutionProcessing: Story = {
  args: { populated: true, status: "saved", executionStatus: "processing" },
  play: async ({ canvasElement }) => {
    await selectFirstNode(canvasElement);
  },
};

export const ExecutionCompleted: Story = {
  args: { populated: true, status: "saved", executionStatus: "completed" },
  play: async ({ canvasElement }) => {
    await selectFirstNode(canvasElement);
  },
};

export const ExecutionFailedNarrow: Story = {
  args: {
    populated: true,
    status: "saved",
    executionStatus: "failed",
    narrow: true,
  },
  play: async ({ canvasElement }) => {
    await selectFirstNode(canvasElement);
  },
};
