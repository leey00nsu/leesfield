/**
 * Tests that deleting a group's nodes also removes the group.
 *
 * Deletion paths covered: onNodesChange remove (Delete/Backspace on a
 * selection) and removeNode. Groups keep living while they still have
 * members, and groups that were already empty before the deletion are
 * only removed via the explicit deleteGroup action.
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

/** Adds two prompt nodes wrapped in a group; returns their ids and the group id. */
function seedGroupedNodes(): { nodeIds: string[]; groupId: string } {
  const store = useWorkflowStore.getState();
  let nodeIds: string[] = [];
  let groupId = "";
  act(() => {
    const a = store.addNode("prompt", { x: 0, y: 0 });
    const b = store.addNode("prompt", { x: 400, y: 0 });
    nodeIds = [a, b];
    groupId = useWorkflowStore.getState().createGroup(nodeIds);
  });
  return { nodeIds, groupId };
}

function removeViaChanges(nodeIds: string[]) {
  act(() => {
    useWorkflowStore
      .getState()
      .onNodesChange(nodeIds.map((id) => ({ type: "remove" as const, id })));
    // Let the delete-cycle checkpoint flag reset (setTimeout(0) in the store)
    vi.advanceTimersByTime(0);
  });
}

describe("group pruning on node deletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkflowStore.getState().clearWorkflow();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("onNodesChange remove", () => {
    it("removes the group when all its members are deleted", () => {
      const { nodeIds, groupId } = seedGroupedNodes();
      expect(useWorkflowStore.getState().groups[groupId]).toBeDefined();

      removeViaChanges(nodeIds);

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.groups[groupId]).toBeUndefined();
    });

    it("keeps the group while it still has members", () => {
      const { nodeIds, groupId } = seedGroupedNodes();

      removeViaChanges([nodeIds[0]]);

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.groups[groupId]).toBeDefined();
    });

    it("removes the group when its last member is deleted after partial pruning", () => {
      const { nodeIds, groupId } = seedGroupedNodes();

      removeViaChanges([nodeIds[0]]);
      removeViaChanges([nodeIds[1]]);

      expect(useWorkflowStore.getState().groups[groupId]).toBeUndefined();
    });

    it("only removes groups whose members were deleted", () => {
      const { groupId: groupA } = seedGroupedNodes();
      const { nodeIds: nodesB, groupId: groupB } = seedGroupedNodes();

      removeViaChanges(nodesB);

      const state = useWorkflowStore.getState();
      expect(state.groups[groupA]).toBeDefined();
      expect(state.groups[groupB]).toBeUndefined();
    });

    it("leaves already-empty groups alone when unrelated nodes are deleted", () => {
      const { nodeIds, groupId } = seedGroupedNodes();
      // Empty the group without deleting it
      act(() => {
        useWorkflowStore.getState().removeNodesFromGroup(nodeIds);
      });
      expect(useWorkflowStore.getState().groups[groupId]).toBeDefined();

      removeViaChanges([nodeIds[0]]);

      expect(useWorkflowStore.getState().groups[groupId]).toBeDefined();
    });

    it("undo restores both the nodes and the group", () => {
      const { nodeIds, groupId } = seedGroupedNodes();

      removeViaChanges(nodeIds);
      expect(useWorkflowStore.getState().groups[groupId]).toBeUndefined();

      act(() => {
        useWorkflowStore.getState().undo();
      });

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.groups[groupId]).toBeDefined();
      expect(
        state.nodes.every((node) => node.groupId === groupId)
      ).toBe(true);
    });
  });

  describe("removeNode", () => {
    it("removes the group when its last member is deleted", () => {
      const { nodeIds, groupId } = seedGroupedNodes();

      act(() => {
        useWorkflowStore.getState().removeNode(nodeIds[0]);
        useWorkflowStore.getState().removeNode(nodeIds[1]);
      });

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.groups[groupId]).toBeUndefined();
    });

    it("keeps the group while it still has members", () => {
      const { nodeIds, groupId } = seedGroupedNodes();

      act(() => {
        useWorkflowStore.getState().removeNode(nodeIds[0]);
      });

      expect(useWorkflowStore.getState().groups[groupId]).toBeDefined();
    });
  });
});
