import { useEffect, type ReactNode } from "react";
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
    ReactFlow: ({ children, onInit, onConnect }: {
      children: ReactNode;
      onInit?: (instance: { screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number }; fitView: () => Promise<boolean> }) => void;
      onConnect?: (connection: {
        source: string;
        target: string;
        sourceHandle: string;
        targetHandle: string;
      }) => void;
    }) => {
      useEffect(() => {
        onInit?.({ screenToFlowPosition: (point) => point, fitView: async () => true });
      }, [onInit]);
      return (
        <div>
          {children}
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
        </div>
      );
    },
  };
});

import type { GenerationGraphSnapshotDto } from "../model/graph-types";
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
});
