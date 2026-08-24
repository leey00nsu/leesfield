import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent } from "storybook/test";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  authoringValuesToImageConfig,
  resolveImageAuthoringDefaults,
} from "@/shared/generation/image-authoring";
import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

import type { GraphAutosaveStatus } from "../hook/use-graph-autosave";
import { nodeGenerationKeys } from "../hook/use-node-generations";
import type { NodeGenerationStatus } from "../model/node-generation-types";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { GraphSaveStatus } from "./graph-save-status";
import { NodeStudio } from "./node-studio";

const emptyGraph: GenerationGraphSnapshotDto = {
  id: "storybook-graph",
  title: "Campaign concept",
  version: 4,
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
      type: "imageGeneration",
      position: { x: 80, y: 140 },
      configVersion: 1,
      config: storyConfig,
      selectedOutputImageId: null,
    },
    {
      id: "variation",
      type: "imageGeneration",
      position: { x: 460, y: 260 },
      configVersion: 1,
      config: {
        prompt: "A cinematic variation using the selected output",
        modelKey: "retired/image-model",
        parameters: { width: 1024, height: 1024 },
      },
      selectedOutputImageId: null,
    },
  ],
  edges: [
    {
      id: "primary-edge",
      sourceNodeId: "hero-image",
      targetNodeId: "variation",
      kind: "primary",
      sourceHandle: "output",
      targetHandle: "primary",
    },
  ],
};

type NodeStudioShowcaseProps = {
  populated: boolean;
  status: GraphAutosaveStatus;
  narrow?: boolean;
  catalogError?: boolean;
  executionStatus?: NodeGenerationStatus;
};

function NodeStudioShowcase({
  populated,
  status,
  narrow,
  catalogError,
  executionStatus,
}: NodeStudioShowcaseProps) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!executionStatus) return;
    queryClient.setQueryData(
      nodeGenerationKeys.list(populatedGraph.id, "hero-image"),
      [
        {
          requestId: `storybook-${executionStatus}`,
          status: executionStatus,
          progress: executionStatus === "processing" ? 48 : executionStatus === "completed" ? 100 : 0,
          errorMessage: executionStatus === "failed" ? "Provider가 요청을 완료하지 못했습니다." : null,
          createdAt: "2026-08-24T00:00:00.000Z",
          modelKey: storyModel.key,
          images:
            executionStatus === "completed"
              ? [
                  {
                    id: "storybook-image",
                    url: "/sample-image.png",
                    width: 1024,
                    height: 1024,
                  },
                ]
              : [],
        },
      ],
    );
  }, [executionStatus, queryClient]);
  return (
    <main className={`bg-background-dark p-4 text-white sm:p-6 ${narrow ? "max-w-[390px]" : "min-w-[960px]"}`}>
      <div className="mb-3 flex justify-end">
        <GraphSaveStatus
          status={status}
          version={4}
          onRetry={() => undefined}
          onReloadLatest={() => undefined}
        />
      </div>
      <NodeStudio
        graph={populated ? populatedGraph : emptyGraph}
        onDraftChange={() => undefined}
        catalog={{
          imageModels: catalogError ? [] : runtimeImageModelsFixture,
          isLoading: false,
          error: catalogError ? "MODEL_CATALOG_FETCH_FAILED" : null,
          retry: () => undefined,
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
