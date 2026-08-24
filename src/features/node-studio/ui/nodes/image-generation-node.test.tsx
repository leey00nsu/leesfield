import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({ duplicate: vi.fn(), remove: vi.fn() }));

const inputReadiness = {
  primary: { connectedCount: 1, readyCount: 1, missingCount: 0 },
  reference: { connectedCount: 1, readyCount: 0, missingCount: 1 },
  connectedCount: 2,
  readyCount: 1,
  missingCount: 1,
  resolvedCount: 1,
};

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    duplicateImageNode: commands.duplicate,
    deleteImageNode: commands.remove,
    getImageNodeInputReadiness: () => inputReadiness,
  }),
}));
vi.mock("./image-node-authoring-form", () => ({
  ImageNodeAuthoringForm: () => <div>node-authoring-form</div>,
}));
vi.mock("./image-node-execution", () => ({
  ImageNodeExecution: ({ expanded }: { expanded?: boolean }) => (
    <div>{expanded ? "node-execution-expanded" : "node-execution-compact"}</div>
  ),
}));
vi.mock("@xyflow/react", () => ({
  Handle: ({ id }: { id: string }) => <span data-testid={`handle-${id}`} />,
  NodeToolbar: ({ children, isVisible }: { children: React.ReactNode; isVisible: boolean }) =>
    isVisible ? <div data-testid="node-toolbar">{children}</div> : null,
  Position: { Left: "left", Right: "right", Top: "top" },
}));

import { ImageGenerationNode } from "./image-generation-node";

const nodeProps = {
  id: "node_a",
  type: "imageGeneration" as const,
  data: {
    configVersion: 1 as const,
    config: { prompt: "a quiet lake", modelKey: "model/a", parameters: {} },
    selectedOutputImageId: null,
  },
  dragging: false,
  selectable: true,
  deletable: true,
  draggable: true,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
};

describe("ImageGenerationNode", () => {
  it("shows a compact summary when unselected", () => {
    render(<ImageGenerationNode {...nodeProps} selected={false} />);

    expect(screen.queryByTestId("node-toolbar")).not.toBeInTheDocument();
    expect(screen.getByText("a quiet lake")).toBeInTheDocument();
    expect(screen.getByText("node-execution-compact")).toBeInTheDocument();
    expect(screen.getByLabelText("input.summary")).toBeInTheDocument();
    expect(screen.getByTestId("handle-primary")).toBeInTheDocument();
  });

  it("shows contextual actions and expanded authoring shell when selected", () => {
    render(<ImageGenerationNode {...nodeProps} selected />);

    expect(screen.getByTestId("node-toolbar")).toBeInTheDocument();
    expect(screen.getByText("node-authoring-form")).toBeInTheDocument();
    expect(screen.getByText("node-execution-expanded")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "input.title" })).toHaveAttribute(
      "aria-describedby",
      "node-input-summary",
    );
    expect(screen.getByText("input.selectionRequired")).toBeInTheDocument();
    expect(screen.getByText("input.summary")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    fireEvent.click(screen.getByRole("button", { name: "actions.duplicateNode" }));
    fireEvent.click(screen.getByRole("button", { name: "actions.deleteNode" }));

    expect(commands.duplicate).toHaveBeenCalledWith("node_a");
    expect(commands.remove).toHaveBeenCalledWith("node_a");
  });
});
