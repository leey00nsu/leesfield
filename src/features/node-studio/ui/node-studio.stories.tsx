import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { GraphAutosaveStatus } from "../hook/use-graph-autosave";
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

const populatedGraph: GenerationGraphSnapshotDto = {
  ...emptyGraph,
  nodes: [
    {
      id: "hero-image",
      type: "imageGeneration",
      position: { x: 80, y: 140 },
      configVersion: 1,
      config: { prompt: "", modelKey: null, parameters: {} },
      selectedOutputImageId: null,
    },
    {
      id: "variation",
      type: "imageGeneration",
      position: { x: 460, y: 260 },
      configVersion: 1,
      config: { prompt: "", modelKey: null, parameters: {} },
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
};

function NodeStudioShowcase({ populated, status, narrow }: NodeStudioShowcaseProps) {
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

export const SaveError: Story = {
  args: { populated: true, status: "error" },
};

export const ConflictNarrow: Story = {
  args: { populated: true, status: "conflict", narrow: true },
};
