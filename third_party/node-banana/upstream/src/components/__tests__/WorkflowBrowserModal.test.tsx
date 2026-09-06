import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowBrowserModal } from "@/components/WorkflowBrowserModal";

// Mock WorkflowBrowserView to isolate the modal wrapper
vi.mock("@/components/quickstart/WorkflowBrowserView", () => ({
  WorkflowBrowserView: ({
    onWorkflowLoaded,
    onClose,
  }: {
    onWorkflowLoaded: (w: unknown, p: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="workflow-browser-view">
      <button data-testid="load-btn" onClick={() => onWorkflowLoaded({ nodes: [], edges: [] }, "/test/path")}>
        Load
      </button>
      <button data-testid="close-btn" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

describe("WorkflowBrowserModal", () => {
  it("should not render when isOpen is false", () => {
    render(
      <WorkflowBrowserModal
        isOpen={false}
        onClose={vi.fn()}
        onWorkflowLoaded={vi.fn()}
      />
    );

    expect(screen.queryByTestId("workflow-browser-view")).not.toBeInTheDocument();
  });

  it("should render WorkflowBrowserView when isOpen is true", () => {
    render(
      <WorkflowBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        onWorkflowLoaded={vi.fn()}
      />
    );

    expect(screen.getByTestId("workflow-browser-view")).toBeInTheDocument();
  });

  it("should call onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <WorkflowBrowserModal
        isOpen={true}
        onClose={onClose}
        onWorkflowLoaded={vi.fn()}
      />
    );

    // Click the backdrop (outermost fixed div)
    const backdrop = container.querySelector(".fixed.inset-0");
    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalled();
  });

  it("should not call onClose when modal content is clicked", () => {
    const onClose = vi.fn();
    render(
      <WorkflowBrowserModal
        isOpen={true}
        onClose={onClose}
        onWorkflowLoaded={vi.fn()}
      />
    );

    // Click the inner content area (via the view)
    fireEvent.click(screen.getByTestId("workflow-browser-view"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should forward onWorkflowLoaded callback", () => {
    const onWorkflowLoaded = vi.fn();
    render(
      <WorkflowBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        onWorkflowLoaded={onWorkflowLoaded}
      />
    );

    fireEvent.click(screen.getByTestId("load-btn"));

    expect(onWorkflowLoaded).toHaveBeenCalledWith(
      { nodes: [], edges: [] },
      "/test/path"
    );
  });

  it("should forward onClose callback to WorkflowBrowserView", () => {
    const onClose = vi.fn();
    render(
      <WorkflowBrowserModal
        isOpen={true}
        onClose={onClose}
        onWorkflowLoaded={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("close-btn"));

    expect(onClose).toHaveBeenCalled();
  });
});
