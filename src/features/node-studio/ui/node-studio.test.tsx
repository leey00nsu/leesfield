import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }: { children: ReactNode }) => <>{children}</>,
    ReactFlow: ({ children, onInit, onConnect, onNodesChange, onEdgesChange, nodesDraggable, panOnDrag, selectionOnDrag }: {
      children: ReactNode;
      onInit?: (instance: { screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number }; fitView: () => Promise<boolean> }) => void;
      onConnect?: (connection: {
        source: string;
        target: string;
        sourceHandle: string;
        targetHandle: string;
      }) => void;
      onNodesChange?: (changes: Array<{
        id: string;
        type: "position";
        position: { x: number; y: number };
        dragging: boolean;
      }>) => void;
      onEdgesChange?: (changes: Array<{
        type: "add";
        item: {
          id: string;
          source: string;
          target: string;
          sourceHandle: string;
          targetHandle: string;
          data: { kind: "reference" };
        };
      }>) => void;
      nodesDraggable?: boolean;
      panOnDrag?: boolean;
      selectionOnDrag?: boolean;
    }) => {
      useEffect(() => {
        onInit?.({ screenToFlowPosition: (point) => point, fitView: async () => true });
      }, [onInit]);
      return (
        <div>
          {children}
          <span data-testid="flow-mode">{`${nodesDraggable}:${panOnDrag}:${selectionOnDrag}`}</span>
          <button
            type="button"
            onClick={() =>
              onConnect?.({
                source: "node_a",
                target: "node_b",
                sourceHandle: "output",
                targetHandle: "reference",
              })
            }
          >
            connect-test
          </button>
          <button
            type="button"
            onClick={() =>
              onNodesChange?.([
                {
                  id: "node_a",
                  type: "position",
                  position: { x: 64, y: 32 },
                  dragging: false,
                },
              ])
            }
          >
            move-node-test
          </button>
          <button
            type="button"
            onClick={() =>
              onEdgesChange?.([
                {
                  type: "add",
                  item: {
                    id: "edge-change-test",
                    source: "node_a",
                    target: "node_b",
                    sourceHandle: "output",
                    targetHandle: "reference",
                    data: { kind: "reference" },
                  },
                },
              ])
            }
          >
            edge-change-test
          </button>
        </div>
      );
    },
  };
});

vi.mock("../model/node-authoring-context", () => ({
  NodeAuthoringProvider: ({
    children,
    value,
  }: {
    children: ReactNode;
    value: {
      updateImageNodeConfig: (nodeId: string, config: unknown) => void;
      duplicateImageNode: (nodeId: string) => void;
      deleteImageNode: (nodeId: string) => void;
    };
  }) => (
    <>
      {children}
      <button
        type="button"
        onClick={() =>
          value.updateImageNodeConfig("node_a", {
            prompt: "updated prompt",
            modelKey: "model/a",
            parameters: { steps: 8 },
          })
        }
      >
        update-config-test
      </button>
      <button
        type="button"
        onClick={() => value.duplicateImageNode("node_a")}
      >
        duplicate-node-test
      </button>
      <button type="button" onClick={() => value.deleteImageNode("node_a")}>
        delete-node-test
      </button>
    </>
  ),
}));

import type {
  GenerationGraphSnapshotDto,
  UpdateGenerationGraphDto,
} from "../model/graph-types";
import { NodeStudio } from "./node-studio";

const node = (id: string, x: number) => ({
  id,
  type: "imageGeneration" as const,
  position: { x, y: 0 },
  configVersion: 1 as const,
  config: { prompt: "", modelKey: null, parameters: {} },
  selectedOutputImageId: null,
});

const graph: GenerationGraphSnapshotDto = {
  id: "graph_1",
  title: "Graph",
  version: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  nodes: [node("node_a", 0), node("node_b", 200)],
  edges: [],
};

function StatefulDraftHarness() {
  const [draft, setDraft] = useState<UpdateGenerationGraphDto | null>(null);

  return (
    <>
      <output data-testid="published-draft">
        {draft ? JSON.stringify(draft) : "no draft"}
      </output>
      <NodeStudio graph={graph} onDraftChange={setDraft} />
    </>
  );
}

describe("NodeStudio", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("adds an image generation node with a persistent draft", () => {
    const onDraftChange = vi.fn();
    render(<NodeStudio graph={graph} onDraftChange={onDraftChange} />);

    fireEvent.click(screen.getByRole("button", { name: "actions.addImageNode" }));

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "00000000-0000-4000-8000-000000000001",
            type: "imageGeneration",
          }),
        ]),
      }),
    );
  });

  it("adds a validated reference edge", () => {
    const onDraftChange = vi.fn();
    render(<NodeStudio graph={graph} onDraftChange={onDraftChange} />);

    fireEvent.click(screen.getByRole("button", { name: "connect-test" }));

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        edges: [
          expect.objectContaining({
            sourceNodeId: "node_a",
            targetNodeId: "node_b",
            kind: "reference",
          }),
        ],
      }),
    );
  });

  it("publishes config, duplicate, and delete mutations through one draft path", () => {
    const onDraftChange = vi.fn();
    render(<NodeStudio graph={graph} onDraftChange={onDraftChange} />);

    fireEvent.click(screen.getByRole("button", { name: "update-config-test" }));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "node_a",
            config: expect.objectContaining({ prompt: "updated prompt" }),
          }),
        ]),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "duplicate-node-test" }));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "00000000-0000-4000-8000-000000000001",
            selectedOutputImageId: null,
          }),
        ]),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "delete-node-test" }));
    const latestDraft = onDraftChange.mock.calls.at(-1)?.[0];
    expect(latestDraft.nodes.map((item: { id: string }) => item.id)).not.toContain(
      "node_a",
    );
  });

  it("publishes node and edge changes outside React state updaters", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <StrictMode>
        <StatefulDraftHarness />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: "move-node-test" }));
    expect(screen.getByTestId("published-draft")).toHaveTextContent(
      '"position":{"x":64,"y":32}',
    );

    fireEvent.click(screen.getByRole("button", { name: "edge-change-test" }));
    expect(screen.getByTestId("published-draft")).toHaveTextContent(
      '"id":"edge-change-test"',
    );
    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === "string" &&
            value.includes("Cannot update a component") &&
            value.includes("while rendering a different component"),
        ),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("switches React Flow between select and pan interaction modes", () => {
    render(<NodeStudio graph={graph} onDraftChange={vi.fn()} />);

    expect(screen.getByTestId("flow-mode")).toHaveTextContent("true:false:true");
    expect(screen.getByRole("button", { name: "actions.selectTool" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "actions.panTool" }));

    expect(screen.getByTestId("flow-mode")).toHaveTextContent("false:true:false");
    expect(screen.getByRole("button", { name: "actions.panTool" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
