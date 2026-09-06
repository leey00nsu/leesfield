import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BaseNode } from "@/components/nodes/BaseNode";
import { ReactFlowProvider } from "@xyflow/react";

// Mock the workflow store
const mockSetHoveredNodeId = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => mockUseWorkflowStore(selector),
}));

// Mock isPanningRef
vi.mock("@/components/WorkflowCanvas", () => ({
  isPanningRef: { current: false },
}));

// Mock useReactFlow
const mockGetNodes = vi.fn(() => []);
const mockSetNodes = vi.fn();

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    useReactFlow: () => ({
      getNodes: mockGetNodes,
      setNodes: mockSetNodes,
    }),
  };
});

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe("BaseNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkflowStore.mockImplementation((selector) => {
      const state = {
        currentNodeIds: [] as string[],
        hoveredNodeId: null,
        setHoveredNodeId: mockSetHoveredNodeId,
      };
      return selector(state);
    });
  });

  const defaultProps = {
    id: "test-node-1",
    children: <div data-testid="test-children">Test Content</div>,
  };

  describe("Basic Rendering", () => {
    it("should render children content", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId("test-children")).toBeInTheDocument();
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} className="custom-class" />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".custom-class");
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe("Visual States", () => {
    it("should apply selected styling when selected is true", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} selected={true} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".ring-2.ring-blue-500\\/40");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should apply executing styling when isExecuting is true", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} isExecuting={true} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".border-blue-500.ring-1");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should apply executing styling when currentNodeIds includes the node", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: ["test-node-1"],
          hoveredNodeId: null,
          setHoveredNodeId: mockSetHoveredNodeId,
        };
        return selector(state);
      });

      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".border-blue-500.ring-1");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should apply error styling when hasError is true", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} hasError={true} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".border-red-500");
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe("Settings Panel", () => {
    it("should render settings panel when provided", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} settingsExpanded={true} settingsPanel={<div data-testid="settings">Settings</div>} />
        </TestWrapper>
      );

      expect(screen.getByTestId("settings")).toBeInTheDocument();
    });

    it("should not render settings panel when settingsExpanded is false", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} settingsExpanded={false} settingsPanel={<div data-testid="settings">Settings</div>} />
        </TestWrapper>
      );

      // Settings panel div is always rendered (for ref tracking), but settingsExpanded controls layout
      expect(screen.getByTestId("settings")).toBeInTheDocument();
    });
  });

  describe("Node Resizer", () => {
    it("should render without error when selected", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} selected={true} />
        </TestWrapper>
      );

      expect(container.firstChild).toBeTruthy();
    });

    it("should accept custom minWidth and minHeight", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} minWidth={200} minHeight={150} selected={true} />
        </TestWrapper>
      );

      expect(screen.getByTestId("test-children")).toBeInTheDocument();
    });
  });

  describe("the highlight around a node with an open settings panel", () => {
    const settingsPanel = <div data-testid="settings-panel">Settings</div>;

    /**
     * The element whose ring encloses the settings panel.
     *
     * Weight is part of the assertion, not decoration: the first fix put a
     * `ring-1 ring-blue-500/20` here, which satisfies "a ring encloses the
     * panel" and yet is invisible on the canvas — 1px at 20% opacity over a
     * near-black background. The bug survived a passing test, so the test now
     * describes an outline you can actually see.
     */
    const enclosingRing = (container: HTMLElement): HTMLElement | undefined => {
      const panel = screen.getByTestId("settings-panel");
      return [...container.querySelectorAll<HTMLElement>("*")].find(
        (el) => /(^|\s)ring-\d/.test(el.className.toString()) && el.contains(panel)
      );
    };

    it("encloses the settings panel while the node is running", () => {
      // It used to hug the body only, so a running node and a selected node
      // were drawn as two different shapes. Reported from a Comfy app node,
      // but BaseNode is shared, so every node with settings was affected.
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} isExecuting settingsExpanded settingsPanel={settingsPanel} />
        </TestWrapper>
      );

      const ring = enclosingRing(container);
      expect(ring).toBeDefined();
      expect(ring).toHaveClass("ring-1", "ring-blue-500");
    });

    it("draws that outline once, not once per section", () => {
      // The body used to keep its own blue border under the wrapper's ring, so
      // the node wore two lines down its sides and one down the settings.
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} isExecuting settingsExpanded settingsPanel={settingsPanel} />
        </TestWrapper>
      );

      const ring = enclosingRing(container)!;
      const blueInside = [...ring.querySelectorAll<HTMLElement>("*")].filter((el) =>
        /(^|\s)border-blue-500(\s|$)/.test(el.className.toString())
      );
      expect(blueInside).toHaveLength(0);
    });

    it("encloses it when selected too, as it always did", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} selected settingsExpanded settingsPanel={settingsPanel} />
        </TestWrapper>
      );

      const ring = enclosingRing(container);
      expect(ring).toBeDefined();
      expect(ring).toHaveClass("ring-2", "ring-blue-500/40");
    });

    it("draws one ring, not two, when a running node is also selected", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            selected
            isExecuting
            settingsExpanded
            settingsPanel={settingsPanel}
          />
        </TestWrapper>
      );

      const ringed = [...container.querySelectorAll<HTMLElement>("*")].filter((el) =>
        /(^|\s)ring-\d/.test(el.className.toString())
      );
      expect(ringed).toHaveLength(1);
    });
  });
});
