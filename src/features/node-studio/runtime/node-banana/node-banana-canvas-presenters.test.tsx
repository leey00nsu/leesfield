import { fireEvent, render, screen } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import {
  EditableEdge,
  EdgeToolbar,
  MultiSelectToolbar,
} from "@node-banana-runtime/runtime-entry";

describe("Node Banana canvas presenters", () => {
  it("renders the vendored EditableEdge pause indicator", () => {
    render(
      <svg>
        <EditableEdge
          id="edge-1"
          source="source"
          target="target"
          sourceX={0}
          sourceY={50}
          targetX={200}
          targetY={50}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          data={{ hasPause: true, edgeStyle: "angular" }}
        />
      </svg>,
    );

    expect(screen.getByRole("img", { name: "Paused edge" })).toHaveAttribute(
      "data-node-banana-component",
      "PauseIndicator",
    );
  });

  it("routes the vendored EdgeToolbar actions through hosted callbacks", () => {
    const onTogglePause = vi.fn();
    const onDelete = vi.fn();

    render(
      <EdgeToolbar
        hosted={{
          edge: { id: "edge-1", data: {} },
          position: { x: 120, y: 80 },
          onTogglePause,
          onDelete,
        }}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Selected edge" })).toHaveAttribute(
      "data-node-banana-component",
      "EdgeToolbar",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete edge" }));
    expect(onTogglePause).toHaveBeenCalledWith("edge-1");
    expect(onDelete).toHaveBeenCalledWith("edge-1");
  });

  it("routes the vendored MultiSelectToolbar arrangement and host commands", () => {
    const onNodesChange = vi.fn();
    const onCopy = vi.fn();
    const onDelete = vi.fn();

    render(
      <MultiSelectToolbar
        hosted={{
          nodes: [
            { id: "node-1", selected: true, position: { x: 0, y: 0 } },
            { id: "node-2", selected: true, position: { x: 260, y: 50 } },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
          onNodesChange,
          onCopy,
          onDelete,
        }}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Selected nodes" })).toHaveAttribute(
      "data-node-banana-component",
      "MultiSelectToolbar",
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stack horizontally (H)" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onNodesChange).toHaveBeenCalledWith([
      { type: "position", id: "node-1", position: { x: 0, y: 0 } },
      { type: "position", id: "node-2", position: { x: 240, y: 0 } },
    ]);
    expect(onCopy).toHaveBeenCalledWith(["node-1", "node-2"]);
    expect(onDelete).toHaveBeenCalledWith(["node-1", "node-2"]);
  });
});
