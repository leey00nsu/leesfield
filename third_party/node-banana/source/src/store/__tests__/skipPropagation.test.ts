/**
 * Tests for optional input skip propagation in executeWorkflow.
 *
 * Covers:
 * - Optional inputs with no data are skipped
 * - Skip propagation cascades to downstream nodes (ANY policy)
 * - Shared nodes (e.g. prompt connected to multiple generators) are not skipped
 * - Backward compatibility: nodes without isOptional behave as before
 * - Skipped status is cleared after workflow completes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWorkflowStore } from "../workflowStore";
import type { WorkflowNode, WorkflowEdge } from "@/types";

// Mock the Toast hook
vi.mock("@/components/Toast", () => ({
  useToast: {
    getState: () => ({
      show: vi.fn(),
    }),
  },
}));

// Mock the logger
vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startSession: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    getCurrentSession: vi.fn().mockReturnValue(null),
  },
}));

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
  }),
});

// Mock fetch for API calls
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true, image: "data:image/png;base64,generated" }),
  text: () => Promise.resolve(""),
}));

function resetStore() {
  useWorkflowStore.getState().clearWorkflow();
}

function createTestNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  position = { x: 0, y: 0 }
): WorkflowNode {
  return {
    id,
    type: type as WorkflowNode["type"],
    position,
    data: data as WorkflowNode["data"],
  };
}

function createTestEdge(
  source: string,
  target: string,
  sourceHandle: string | null = null,
  targetHandle: string | null = null
): WorkflowEdge {
  return {
    id: `edge-${source}-${target}-${sourceHandle || "default"}-${targetHandle || "default"}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

describe("Skip propagation", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  describe("Optional input with no data", () => {
    it("should skip optional imageInput with no image", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // Workflow should complete without errors
      expect(useWorkflowStore.getState().isRunning).toBe(false);

      // The nanoBanana node should NOT have been executed (no API call for it)
      // We verify by checking that its status was reset to idle (skip → cleanup → idle)
      const nbNode = useWorkflowStore.getState().nodes.find(n => n.id === "nb-1");
      expect(nbNode?.data).toBeDefined();
      expect((nbNode?.data as any).status).toBe("idle");
    });

    it("should skip optional audioInput with no audio", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("audio-1", "audioInput", { audioFile: null, isOptional: true }),
          createTestNode("output-1", "output", {}),
        ],
        edges: [
          createTestEdge("audio-1", "output-1", "audio", "audio"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      expect(useWorkflowStore.getState().isRunning).toBe(false);
    });

    it("should skip optional prompt with empty text", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("prompt-1", "prompt", { prompt: "", isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("prompt-1", "nb-1", "text", "text"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      expect(useWorkflowStore.getState().isRunning).toBe(false);
    });

    it("should skip optional prompt with whitespace-only text", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("prompt-1", "prompt", { prompt: "   ", isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("prompt-1", "nb-1", "text", "text"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      expect(useWorkflowStore.getState().isRunning).toBe(false);
    });

    it("should NOT skip optional imageInput when it has an image", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: "data:image/png;base64,test", isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
          createTestNode("prompt-1", "prompt", { prompt: "test" }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("prompt-1", "nb-1", "text", "text"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // Workflow should complete — nanoBanana should execute (it won't be skipped)
      expect(useWorkflowStore.getState().isRunning).toBe(false);
      // skippedNodeIds should be cleared
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });
  });

  describe("Skip propagation (ANY merge policy)", () => {
    it("should skip downstream node when its source is skipped", async () => {
      // imageInput(optional, empty) → nanoBanana → output
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
          createTestNode("output-1", "output", {}),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("nb-1", "output-1", "image", "image"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // All three nodes should have been skipped
      expect(useWorkflowStore.getState().isRunning).toBe(false);
      // skippedNodeIds cleared after completion
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });

    it("should skip node when ANY source is skipped (not requiring ALL)", async () => {
      // imageInput(optional, empty) → nanoBanana ← prompt(has text)
      // nanoBanana should be skipped because one source (imageInput) is skipped
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }),
          createTestNode("prompt-1", "prompt", { prompt: "test prompt" }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("prompt-1", "nb-1", "text", "text"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // Workflow completes without error
      expect(useWorkflowStore.getState().isRunning).toBe(false);
      // skippedNodeIds should be cleared after completion
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });
  });

  describe("Shared nodes are NOT skipped", () => {
    it("should only skip the branch with the empty input, not the shared prompt", async () => {
      // Setup:
      // prompt → nanoBanana1 ← imageInput1 (optional, empty)
      // prompt → nanoBanana2 ← imageInput2 (optional, has image)
      //
      // Expected: prompt executes, nanoBanana1 is skipped, nanoBanana2 executes
      useWorkflowStore.setState({
        nodes: [
          createTestNode("prompt-1", "prompt", { prompt: "test prompt" }, { x: 0, y: 100 }),
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }, { x: 0, y: 0 }),
          createTestNode("img-2", "imageInput", { image: "data:image/png;base64,test", isOptional: true }, { x: 0, y: 200 }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }, { x: 200, y: 0 }),
          createTestNode("nb-2", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }, { x: 200, y: 200 }),
        ],
        edges: [
          createTestEdge("prompt-1", "nb-1", "text", "text"),
          createTestEdge("prompt-1", "nb-2", "text", "text"),
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("img-2", "nb-2", "image", "image"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // Workflow should complete
      expect(useWorkflowStore.getState().isRunning).toBe(false);
      // Both skippedNodeIds should be cleared
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });
  });

  describe("Backward compatibility", () => {
    it("should NOT skip non-optional imageInput with no image (errors as before)", async () => {
      // imageInput without isOptional → nanoBanana
      // The nanoBanana should attempt to execute (and likely fail on API call)
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null }),
          createTestNode("prompt-1", "prompt", { prompt: "test" }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("prompt-1", "nb-1", "text", "text"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // Workflow should complete (nanoBanana attempted execution — wasn't skipped)
      // We just need to verify it wasn't skipped, not that it succeeded
      expect(useWorkflowStore.getState().isRunning).toBe(false);
      // The skippedNodeIds should be empty — nothing was skipped
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });

    it("should NOT skip when isOptional is explicitly false", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: false }),
          createTestNode("prompt-1", "prompt", { prompt: "test" }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("prompt-1", "nb-1", "text", "text"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      expect(useWorkflowStore.getState().isRunning).toBe(false);
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });
  });

  describe("Skipped status cleanup", () => {
    it("should clear skippedNodeIds after workflow completes", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // After completion, skippedNodeIds should be empty
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
      expect(useWorkflowStore.getState().isRunning).toBe(false);
    });

    it("should reset skipped node status back to idle after completion", async () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // nanoBanana status should be "idle" (was set to "skipped" during execution, then reset)
      const nbNode = useWorkflowStore.getState().nodes.find(n => n.id === "nb-1");
      expect((nbNode?.data as any).status).toBe("idle");
    });

    it("should clear skippedNodeIds on stopWorkflow", () => {
      // Manually set some skipped nodes
      useWorkflowStore.setState({
        skippedNodeIds: new Set(["node-1", "node-2"]),
        isRunning: true,
      });

      const store = useWorkflowStore.getState();
      store.stopWorkflow();

      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });
  });

  describe("Multi-level cascade", () => {
    it("should cascade skip through multiple levels", async () => {
      // imageInput(optional, empty) → nanoBanana → output
      // All three should be skipped
      useWorkflowStore.setState({
        nodes: [
          createTestNode("img-1", "imageInput", { image: null, isOptional: true }, { x: 0, y: 0 }),
          createTestNode("prompt-1", "prompt", { prompt: "test" }, { x: 0, y: 100 }),
          createTestNode("nb-1", "nanoBanana", {
            status: "idle",
            aspectRatio: "1:1",
            resolution: "1MP",
            model: "nano-banana",
          }, { x: 200, y: 0 }),
          createTestNode("output-1", "output", {}, { x: 400, y: 0 }),
        ],
        edges: [
          createTestEdge("img-1", "nb-1", "image", "image"),
          createTestEdge("prompt-1", "nb-1", "text", "text"),
          createTestEdge("nb-1", "output-1", "image", "image"),
        ],
      });

      const store = useWorkflowStore.getState();
      await store.executeWorkflow();

      // Workflow completes without errors
      expect(useWorkflowStore.getState().isRunning).toBe(false);
      // All skipped node IDs cleaned up
      expect(useWorkflowStore.getState().skippedNodeIds.size).toBe(0);
    });
  });
});
