/**
 * Integration tests for undo/redo through the Zustand store.
 *
 * Tests that undo/redo correctly captures and restores workflow state
 * for all undoable actions (add/remove nodes, connect edges, etc.).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { useWorkflowStore } from "../workflowStore";

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

function resetStore() {
  const store = useWorkflowStore.getState();
  store.clearWorkflow();
}

describe("Undo/Redo integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with canUndo and canRedo both false", () => {
    const { canUndo, canRedo } = useWorkflowStore.getState();
    expect(canUndo).toBe(false);
    expect(canRedo).toBe(false);
  });

  describe("addNode + undo", () => {
    it("undoes adding a node", () => {
      let store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(0);

      act(() => {
        store.addNode("prompt", { x: 100, y: 100 });
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);
      expect(store.canUndo).toBe(true);

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(0);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);
    });

    it("redoes after undoing addNode", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 100, y: 100 });
      });
      store = useWorkflowStore.getState();
      const nodeId = store.nodes[0].id;

      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(0);

      act(() => {
        store.redo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);
      expect(store.nodes[0].id).toBe(nodeId);
      expect(store.canRedo).toBe(false);
    });
  });

  describe("removeNode + undo", () => {
    it("undoes removing a node", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });
      store = useWorkflowStore.getState();
      const nodeId = store.nodes[0].id;

      act(() => {
        store.removeNode(nodeId);
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(0);

      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);
      expect(store.nodes[0].id).toBe(nodeId);
    });
  });

  describe("onConnect + undo", () => {
    it("undoes connecting an edge", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
        store.addNode("nanoBanana", { x: 300, y: 0 });
      });

      store = useWorkflowStore.getState();
      const promptId = store.nodes[0].id;
      const genId = store.nodes[1].id;
      const edgesBefore = store.edges.length;

      act(() => {
        store.onConnect({
          source: promptId,
          target: genId,
          sourceHandle: "text",
          targetHandle: "text",
        });
      });

      store = useWorkflowStore.getState();
      expect(store.edges.length).toBe(edgesBefore + 1);

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.edges.length).toBe(edgesBefore);
    });
  });

  describe("removeEdge + undo", () => {
    it("undoes removing an edge", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
        store.addNode("nanoBanana", { x: 300, y: 0 });
      });
      store = useWorkflowStore.getState();
      const promptId = store.nodes[0].id;
      const genId = store.nodes[1].id;

      act(() => {
        store.onConnect({
          source: promptId,
          target: genId,
          sourceHandle: "text",
          targetHandle: "text",
        });
      });

      store = useWorkflowStore.getState();
      const edgeId = store.edges[store.edges.length - 1].id;

      act(() => {
        store.removeEdge(edgeId);
      });

      store = useWorkflowStore.getState();
      expect(store.edges.find((e) => e.id === edgeId)).toBeUndefined();

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.edges.find((e) => e.id === edgeId)).toBeDefined();
    });
  });

  describe("delete node via onNodesChange + onEdgesChange restores connections", () => {
    it("single undo restores both node and its connected edges", () => {
      let store = useWorkflowStore.getState();

      // Create two nodes and connect them
      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });
      store = useWorkflowStore.getState();
      act(() => {
        store.addNode("nanoBanana", { x: 300, y: 0 });
      });
      store = useWorkflowStore.getState();
      const promptId = store.nodes[0].id;
      const genId = store.nodes[1].id;

      act(() => {
        store.onConnect({
          source: promptId,
          target: genId,
          sourceHandle: "text",
          targetHandle: "text",
        });
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(2);
      expect(store.edges.length).toBe(1);

      // Simulate pressing Delete: React Flow v12 fires onEdgesChange(remove)
      // BEFORE onNodesChange(remove) — both synchronously in the same cycle.
      const edgeId = store.edges[0].id;
      act(() => {
        store.onEdgesChange([{ type: "remove", id: edgeId }]);
        store.onNodesChange([{ type: "remove", id: promptId }]);
      });

      // Advance past the setTimeout(0) that clears deleteCheckpointActive
      act(() => {
        vi.advanceTimersByTime(0);
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);
      expect(store.edges.length).toBe(0);

      // Single undo should restore both the node AND the edge
      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(2);
      expect(store.edges.length).toBe(1);
      expect(store.nodes.find((n) => n.id === promptId)).toBeDefined();

      // The delete should have been exactly one undo entry — undoing again
      // should go back to before the edge was connected, not to some
      // intermediate state caused by clearStaleInputImages side effects
      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      // Previous checkpoint was onConnect, so edges should be gone
      expect(store.edges.length).toBe(0);
      expect(store.nodes.length).toBe(2);
    });

    it("single undo restores image-source node and does not create extra entries from clearStaleInputImages", () => {
      let store = useWorkflowStore.getState();

      // Create imageInput -> nanoBanana (image connection triggers clearStaleInputImages on delete)
      act(() => {
        store.addNode("imageInput", { x: 0, y: 0 });
      });
      store = useWorkflowStore.getState();
      act(() => {
        store.addNode("nanoBanana", { x: 300, y: 0 });
      });
      store = useWorkflowStore.getState();
      const imageInputId = store.nodes[0].id;
      const genId = store.nodes[1].id;

      act(() => {
        store.onConnect({
          source: imageInputId,
          target: genId,
          sourceHandle: "image",
          targetHandle: "image",
        });
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(2);
      expect(store.edges.length).toBe(1);

      // Delete the imageInput node — React Flow v12 fires edges first, then nodes.
      // This triggers clearStaleInputImages which calls updateNodeData on the
      // nanoBanana target as a side effect.
      const edgeId = store.edges[0].id;
      act(() => {
        store.onEdgesChange([{ type: "remove", id: edgeId }]);
        store.onNodesChange([{ type: "remove", id: imageInputId }]);
      });

      // Advance past the setTimeout(0) that clears deleteCheckpointActive
      // and any debounced data-change timer (500ms)
      act(() => {
        vi.advanceTimersByTime(600);
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);
      expect(store.edges.length).toBe(0);

      // Single undo should restore the node and edge
      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(2);
      expect(store.edges.length).toBe(1);
      expect(store.nodes.find((n) => n.id === imageInputId)).toBeDefined();

      // Verify no extra undo entries from clearStaleInputImages:
      // Next undo should go back to before onConnect (2 nodes, 0 edges)
      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.edges.length).toBe(0);
      expect(store.nodes.length).toBe(2);
    });

    it("standalone edge removal via onEdgesChange still creates undo entry", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });
      store = useWorkflowStore.getState();
      act(() => {
        store.addNode("nanoBanana", { x: 300, y: 0 });
      });
      store = useWorkflowStore.getState();
      const promptId = store.nodes[0].id;
      const genId = store.nodes[1].id;

      act(() => {
        store.onConnect({
          source: promptId,
          target: genId,
          sourceHandle: "text",
          targetHandle: "text",
        });
      });

      store = useWorkflowStore.getState();
      expect(store.edges.length).toBe(1);
      const edgeId = store.edges[0].id;

      // Only remove the edge (no node removal) — should still be undoable
      act(() => {
        store.onEdgesChange([{ type: "remove", id: edgeId }]);
      });

      act(() => {
        vi.advanceTimersByTime(0);
      });

      store = useWorkflowStore.getState();
      expect(store.edges.length).toBe(0);

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.edges.length).toBe(1);
      expect(store.edges[0].id).toBe(edgeId);
    });
  });

  describe("new action clears redo stack", () => {
    it("clears redo stack when a new undoable action is performed", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });

      act(() => {
        store = useWorkflowStore.getState();
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.canRedo).toBe(true);

      // Perform a new action — should clear redo stack
      act(() => {
        store.addNode("imageInput", { x: 100, y: 100 });
      });

      store = useWorkflowStore.getState();
      expect(store.canRedo).toBe(false);
    });
  });

  describe("multiple undo/redo", () => {
    it("supports multiple undo/redo in sequence", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });
      act(() => {
        store = useWorkflowStore.getState();
        store.addNode("imageInput", { x: 100, y: 0 });
      });
      act(() => {
        store = useWorkflowStore.getState();
        store.addNode("nanoBanana", { x: 200, y: 0 });
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(3);

      // Undo 3 times
      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(2);

      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);

      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(0);
      expect(store.canUndo).toBe(false);

      // Redo 3 times
      act(() => {
        store.redo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(1);

      act(() => {
        store.redo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(2);

      act(() => {
        store.redo();
      });
      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(3);
      expect(store.canRedo).toBe(false);
    });
  });

  describe("undo on empty stack is no-op", () => {
    it("does nothing when undo stack is empty", () => {
      let store = useWorkflowStore.getState();
      const before = store.nodes.length;

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(before);
      expect(store.canUndo).toBe(false);
    });
  });

  describe("redo on empty stack is no-op", () => {
    it("does nothing when redo stack is empty", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });
      store = useWorkflowStore.getState();
      const nodeCount = store.nodes.length;

      act(() => {
        store.redo();
      });

      store = useWorkflowStore.getState();
      expect(store.nodes.length).toBe(nodeCount);
    });
  });

  describe("clearWorkflow resets undo history", () => {
    it("clears undo and redo stacks on clearWorkflow", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
        store.addNode("imageInput", { x: 100, y: 0 });
      });

      store = useWorkflowStore.getState();
      expect(store.canUndo).toBe(true);

      act(() => {
        store.undo();
      });
      store = useWorkflowStore.getState();
      expect(store.canRedo).toBe(true);

      act(() => {
        store.clearWorkflow();
      });

      store = useWorkflowStore.getState();
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });
  });

  describe("setEdgeStyle + undo", () => {
    it("undoes edge style change", () => {
      let store = useWorkflowStore.getState();
      const originalStyle = store.edgeStyle;

      act(() => {
        store.setEdgeStyle("angular");
      });

      store = useWorkflowStore.getState();
      expect(store.edgeStyle).toBe("angular");

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.edgeStyle).toBe(originalStyle);
    });
  });

  describe("group operations + undo", () => {
    it("undoes creating a group", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
        store.addNode("imageInput", { x: 100, y: 0 });
      });

      store = useWorkflowStore.getState();
      const nodeIds = store.nodes.map((n) => n.id);

      act(() => {
        store.createGroup(nodeIds);
      });

      store = useWorkflowStore.getState();
      expect(Object.keys(store.groups).length).toBe(1);

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(Object.keys(store.groups).length).toBe(0);
    });

    it("undoes deleting a group", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });
      store = useWorkflowStore.getState();
      const nodeIds = store.nodes.map((n) => n.id);

      let groupId: string;
      act(() => {
        groupId = store.createGroup(nodeIds);
      });

      store = useWorkflowStore.getState();
      expect(Object.keys(store.groups).length).toBe(1);

      act(() => {
        store.deleteGroup(groupId!);
      });

      store = useWorkflowStore.getState();
      expect(Object.keys(store.groups).length).toBe(0);

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(Object.keys(store.groups).length).toBe(1);
    });
  });

  describe("hasUnsavedChanges is set on undo/redo", () => {
    it("marks as unsaved after undo", () => {
      let store = useWorkflowStore.getState();

      act(() => {
        store.addNode("prompt", { x: 0, y: 0 });
      });

      // Simulate that the workflow was "saved"
      act(() => {
        useWorkflowStore.setState({ hasUnsavedChanges: false });
      });

      store = useWorkflowStore.getState();
      expect(store.hasUnsavedChanges).toBe(false);

      act(() => {
        store.undo();
      });

      store = useWorkflowStore.getState();
      expect(store.hasUnsavedChanges).toBe(true);
    });
  });
});
