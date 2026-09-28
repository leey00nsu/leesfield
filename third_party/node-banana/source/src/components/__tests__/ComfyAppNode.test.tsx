import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";

import { ComfyAppNode } from "@/components/nodes/ComfyAppNode";
import type { ComfyAppDefinition } from "@/lib/comfy/types";
import type { ComfyAppNodeData } from "@/types";

const mockUpdateNodeData = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector?: (state: unknown) => unknown) =>
    selector ? mockUseWorkflowStore(selector) : mockUseWorkflowStore((s: unknown) => s),
}));

const mockUpdateNodeInternals = vi.fn();

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    useUpdateNodeInternals: () => mockUpdateNodeInternals,
    useReactFlow: () => ({
      getNodes: vi.fn(() => []),
      setNodes: vi.fn(),
      screenToFlowPosition: vi.fn((pos: unknown) => pos),
    }),
  };
});

const app = (overrides: Partial<ComfyAppDefinition> = {}): ComfyAppDefinition => ({
  id: "app-1",
  name: "Upscale Pass",
  description: "",
  source: "upload",
  graph: { "1": { class_type: "LoadImage", inputs: { image: "example.png" } } },
  inputs: [
    {
      id: "1:image",
      name: "image",
      label: "Image",
      type: "image",
      nodeId: "1",
      inputKey: "image",
      required: false,
    },
  ],
  params: [],
  outputs: [{ id: "9", label: "Result", type: "image", nodeId: "9", classType: "SaveImage" }],
  classTypes: ["LoadImage", "SaveImage"],
  nodeCount: 2,
  createdAt: 0,
  ...overrides,
});

const nodeData = (overrides: Partial<ComfyAppNodeData> = {}): ComfyAppNodeData => ({
  app: null,
  paramValues: {},
  outputs: {},
  outputImage: null,
  outputVideo: null,
  outputAudio: null,
  outputText: null,
  output3dUrl: null,
  status: "idle",
  error: null,
  ...overrides,
});

const tree = (data: ComfyAppNodeData) => (
  <ReactFlowProvider>
    <ComfyAppNode
      id="comfyApp-1"
      type="comfyApp"
      data={data}
      selected={false}
      dragging={false}
      draggable
      selectable
      deletable
      zIndex={0}
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />
  </ReactFlowProvider>
);

describe("ComfyAppNode handles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkflowStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        updateNodeData: mockUpdateNodeData,
        edges: [],
        removeEdge: vi.fn(),
        currentNodeIds: [],
        setHoveredNodeId: vi.fn(),
      })
    );
  });

  it("registers its handles once a workflow is attached", () => {
    // React Flow caches where a node's handles are when it measures the node.
    // This one starts with none at all, so without re-registering them the
    // handles a workflow brings are unreachable — a wire dropped on them lands
    // nowhere — until something else forces a re-measure, such as a resize.
    const { rerender } = render(tree(nodeData()));
    mockUpdateNodeInternals.mockClear();

    rerender(tree(nodeData({ app: app() })));

    expect(mockUpdateNodeInternals).toHaveBeenCalledWith("comfyApp-1");
  });

  it("re-registers when the picks change the handles", () => {
    const { rerender } = render(tree(nodeData({ app: app() })));
    mockUpdateNodeInternals.mockClear();

    const withPrompt = app({
      inputs: [
        ...app().inputs,
        {
          id: "2:text",
          name: "prompt",
          label: "Prompt",
          type: "text",
          nodeId: "2",
          inputKey: "text",
          required: false,
        },
      ],
    });
    rerender(tree(nodeData({ app: withPrompt })));

    expect(mockUpdateNodeInternals).toHaveBeenCalledWith("comfyApp-1");
  });

  it("does not re-register on a render that leaves the handles alone", () => {
    const attached = app();
    const { rerender } = render(tree(nodeData({ app: attached })));
    mockUpdateNodeInternals.mockClear();

    // A result arriving is the common case: it re-renders the node repeatedly,
    // and each needless re-measure costs a layout pass.
    rerender(tree(nodeData({ app: attached, outputs: { "9": "data:image/png;base64,AAA" } })));

    expect(mockUpdateNodeInternals).not.toHaveBeenCalled();
  });
});
