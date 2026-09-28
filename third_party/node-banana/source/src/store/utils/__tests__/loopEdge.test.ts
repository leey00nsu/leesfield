/**
 * Loop Edge Utilities Tests
 *
 * Tests for cycle detection, loop subgraph identification, and loop data copying.
 */

import { describe, it, expect, vi } from "vitest";
import {
  wouldCreateCycle,
  findLoopSubgraph,
  copyLoopOutput,
} from "@/store/utils/executionUtils";
import { WorkflowEdge, WorkflowNode, WorkflowNodeData } from "@/types";

// Helper to create minimal edge objects
function makeEdge(source: string, target: string, data?: Record<string, unknown>): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    data: data || {},
  };
}

// Helper to create minimal node objects
function makeNode(id: string, type: string, data: Partial<WorkflowNodeData> = {}): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: data as WorkflowNodeData,
  };
}

describe("wouldCreateCycle", () => {
  it("detects cycle in linear chain A→B→C when connecting C→A", () => {
    const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
    expect(wouldCreateCycle("C", "A", edges)).toBe(true);
  });

  it("returns false when no cycle: A→B, connecting A→C", () => {
    const edges = [makeEdge("A", "B")];
    expect(wouldCreateCycle("A", "C", edges)).toBe(false);
  });

  it("detects cycle in diamond: A→B→D, A→C→D, connecting D→A", () => {
    const edges = [
      makeEdge("A", "B"),
      makeEdge("A", "C"),
      makeEdge("B", "D"),
      makeEdge("C", "D"),
    ];
    expect(wouldCreateCycle("D", "A", edges)).toBe(true);
  });

  it("detects self-loop: connecting A→A", () => {
    const edges: WorkflowEdge[] = [];
    expect(wouldCreateCycle("A", "A", edges)).toBe(true);
  });

  it("returns false for disconnected graph: A→B, C→D, connecting D→A", () => {
    const edges = [makeEdge("A", "B"), makeEdge("C", "D")];
    expect(wouldCreateCycle("D", "A", edges)).toBe(false);
  });
});

describe("findLoopSubgraph", () => {
  it("identifies simple loop A→B→C with loop edge C→A", () => {
    const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
    const result = findLoopSubgraph("C", "A", edges);
    expect(result.sort()).toEqual(["A", "B", "C"].sort());
  });

  it("excludes nodes outside loop: A→B→C→D with loop edge C→A", () => {
    const edges = [makeEdge("A", "B"), makeEdge("B", "C"), makeEdge("C", "D")];
    const result = findLoopSubgraph("C", "A", edges);
    expect(result.sort()).toEqual(["A", "B", "C"].sort());
    expect(result).not.toContain("D");
  });

  it("includes branch within loop: A→B→C, B→D→C with loop edge C→A", () => {
    const edges = [
      makeEdge("A", "B"),
      makeEdge("B", "C"),
      makeEdge("B", "D"),
      makeEdge("D", "C"),
    ];
    const result = findLoopSubgraph("C", "A", edges);
    expect(result.sort()).toEqual(["A", "B", "C", "D"].sort());
  });
});

describe("copyLoopOutput", () => {
  it("copies image from nanoBanana to imageInput", () => {
    const sourceNode = makeNode("source", "nanoBanana", {
      outputImage: "data:image/png;base64,abc123",
    });
    const targetNode = makeNode("target", "imageInput", {});
    const updateNodeData = vi.fn();

    copyLoopOutput(sourceNode, "image", targetNode, "image", updateNodeData);

    expect(updateNodeData).toHaveBeenCalledWith("target", {
      image: "data:image/png;base64,abc123",
    });
  });

  it("copies video from generateVideo to videoInput", () => {
    const sourceNode = makeNode("source", "generateVideo", {
      outputVideo: "data:video/mp4;base64,xyz789",
    });
    const targetNode = makeNode("target", "videoInput", {});
    const updateNodeData = vi.fn();

    copyLoopOutput(sourceNode, "video", targetNode, "video", updateNodeData);

    expect(updateNodeData).toHaveBeenCalledWith("target", {
      video: "data:video/mp4;base64,xyz789",
    });
  });

  it("copies text from llmGenerate to prompt", () => {
    const sourceNode = makeNode("source", "llmGenerate", {
      outputText: "Generated prompt text",
    });
    const targetNode = makeNode("target", "prompt", {});
    const updateNodeData = vi.fn();

    copyLoopOutput(sourceNode, "text", targetNode, "text", updateNodeData);

    expect(updateNodeData).toHaveBeenCalledWith("target", {
      prompt: "Generated prompt text",
    });
  });

  it("copies audio from generateAudio to audioInput", () => {
    const sourceNode = makeNode("source", "generateAudio", {
      outputAudio: "data:audio/mp3;base64,audio123",
    });
    const targetNode = makeNode("target", "audioInput", {});
    const updateNodeData = vi.fn();

    copyLoopOutput(sourceNode, "audio", targetNode, "audio", updateNodeData);

    expect(updateNodeData).toHaveBeenCalledWith("target", {
      audioFile: "data:audio/mp3;base64,audio123",
    });
  });

  it("does nothing when source value is null", () => {
    const sourceNode = makeNode("source", "nanoBanana", {
      outputImage: null,
    });
    const targetNode = makeNode("target", "imageInput", {});
    const updateNodeData = vi.fn();

    copyLoopOutput(sourceNode, "image", targetNode, "image", updateNodeData);

    expect(updateNodeData).not.toHaveBeenCalled();
  });
});
