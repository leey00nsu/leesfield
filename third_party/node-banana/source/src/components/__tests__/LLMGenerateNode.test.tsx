import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LLMGenerateNode } from "@/components/nodes/LLMGenerateNode";
import { ReactFlowProvider } from "@xyflow/react";
import { LLMGenerateNodeData } from "@/types";

// Mock the workflow store
const mockUpdateNodeData = vi.fn();
const mockRegenerateNode = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector?: (state: unknown) => unknown) => {
    if (selector) {
      return mockUseWorkflowStore(selector);
    }
    return mockUseWorkflowStore((s: unknown) => s);
  },
}));

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe("LLMGenerateNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation
    mockUseWorkflowStore.mockImplementation((selector) => {
      const state = {
        updateNodeData: mockUpdateNodeData,
        regenerateNode: mockRegenerateNode,
        isRunning: false,
        currentNodeIds: [],
        groups: {},
        nodes: [],
        getNodesWithComments: vi.fn(() => []),
        markCommentViewed: vi.fn(),
        setNavigationTarget: vi.fn(),
      };
      return selector(state);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createNodeData = (overrides: Partial<LLMGenerateNodeData> = {}): LLMGenerateNodeData => ({
    inputPrompt: null,
    inputImages: [],
    outputText: null,
    provider: "google",
    model: "gemini-3-flash-preview",
    temperature: 1.0,
    maxTokens: 2048,
    status: "idle",
    error: null,
    ...overrides,
  });

  const createNodeProps = (data: Partial<LLMGenerateNodeData> = {}) => ({
    id: "test-llm-1",
    type: "llmGenerate" as const,
    data: createNodeData(data),
    selected: false,
  });

  describe("Basic Rendering", () => {
    it("should render text input handle on left", () => {
      const { container } = render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps()} />
        </TestWrapper>
      );

      const textHandle = container.querySelector('[data-handletype="text"][class*="target"]');
      expect(textHandle).toBeInTheDocument();
    });

    it("should render image input handle on left", () => {
      const { container } = render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps()} />
        </TestWrapper>
      );

      const imageHandle = container.querySelector('[data-handletype="image"][class*="target"]');
      expect(imageHandle).toBeInTheDocument();
    });

    it("should render text output handle on right", () => {
      const { container } = render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps()} />
        </TestWrapper>
      );

      const outputHandle = container.querySelector('[data-handletype="text"][class*="source"]');
      expect(outputHandle).toBeInTheDocument();
    });
  });

  describe("Idle State", () => {
    it("should show 'Run to generate' message when idle and no output", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ status: "idle", outputText: null })} />
        </TestWrapper>
      );

      expect(screen.getByText("Run to generate")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("should show loading spinner when status is loading", () => {
      const { container } = render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ status: "loading" })} />
        </TestWrapper>
      );

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should show error message when status is error", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ status: "error", error: "API rate limit exceeded" })} />
        </TestWrapper>
      );

      expect(screen.getByText("API rate limit exceeded")).toBeInTheDocument();
    });

    it("should show 'Generation failed' when error message is null", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ status: "error", error: null })} />
        </TestWrapper>
      );

      expect(screen.getByText("Generation failed")).toBeInTheDocument();
    });
  });

  describe("Output Text Display", () => {
    it("should display output text when data.outputText exists", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ outputText: "Generated response text" })} />
        </TestWrapper>
      );

      expect(screen.getByText("Generated response text")).toBeInTheDocument();
    });

    it("should render regenerate button when output exists", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ outputText: "Some output" })} />
        </TestWrapper>
      );

      const regenerateButton = screen.getByTitle("Regenerate");
      expect(regenerateButton).toBeInTheDocument();
    });

    it("should call regenerateNode when regenerate button is clicked", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ outputText: "Some output" })} />
        </TestWrapper>
      );

      const regenerateButton = screen.getByTitle("Regenerate");
      fireEvent.click(regenerateButton);

      expect(mockRegenerateNode).toHaveBeenCalledWith("test-llm-1");
    });

    it("should disable regenerate button when workflow is running", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          regenerateNode: mockRegenerateNode,
          isRunning: true,
          currentNodeIds: [],
          groups: {},
          nodes: [],
          getNodesWithComments: vi.fn(() => []),
          markCommentViewed: vi.fn(),
          setNavigationTarget: vi.fn(),
        };
        return selector(state);
      });

      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ outputText: "Some output" })} />
        </TestWrapper>
      );

      const regenerateButton = screen.getByTitle("Regenerate");
      expect(regenerateButton).toBeDisabled();
    });
  });

  describe("Clear Output Button", () => {
    it("should render clear output button when output exists", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ outputText: "Some output" })} />
        </TestWrapper>
      );

      const clearButton = screen.getByTitle("Clear output");
      expect(clearButton).toBeInTheDocument();
    });

    it("should call updateNodeData to clear output when clear button is clicked", () => {
      render(
        <TestWrapper>
          <LLMGenerateNode {...createNodeProps({ outputText: "Some output" })} />
        </TestWrapper>
      );

      const clearButton = screen.getByTitle("Clear output");
      fireEvent.click(clearButton);

      expect(mockUpdateNodeData).toHaveBeenCalledWith("test-llm-1", {
        outputText: null,
        status: "idle",
        error: null,
      });
    });
  });

});
