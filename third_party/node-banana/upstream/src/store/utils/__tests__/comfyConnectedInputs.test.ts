import { describe, it, expect } from "vitest";

import { getSourceOutput } from "../connectedInputs";
import type { ComfyAppDefinition } from "@/lib/comfy/types";
import type { WorkflowNode } from "@/types";

const app = (): ComfyAppDefinition => ({
  id: "app-1",
  name: "Test",
  description: "",
  source: "upload",
  graph: {},
  inputs: [],
  params: [],
  outputs: [
    { id: "9", label: "Picture", type: "image", nodeId: "9", classType: "SaveImage" },
    { id: "30", label: "Clip", type: "video", nodeId: "30", classType: "SaveVideo" },
    { id: "40", label: "Caption", type: "text", nodeId: "40", classType: "PreviewAny" },
  ],
  classTypes: [],
  nodeCount: 3,
  createdAt: 0,
});

const node = (outputs: Record<string, string>): WorkflowNode =>
  ({
    id: "comfy-1",
    type: "comfyApp",
    position: { x: 0, y: 0 },
    data: { app: app(), outputs, outputImage: outputs["9"] ?? null },
  }) as unknown as WorkflowNode;

describe("getSourceOutput for a Comfy app", () => {
  const produced = { "9": "data:image/png;base64,AAA", "30": "data:video/mp4;base64,BBB", "40": "a caption" };

  it("reads the value and type from the handle the edge leaves", () => {
    expect(getSourceOutput(node(produced), "9")).toEqual({
      type: "image",
      value: "data:image/png;base64,AAA",
    });
    expect(getSourceOutput(node(produced), "30")).toEqual({
      type: "video",
      value: "data:video/mp4;base64,BBB",
    });
    expect(getSourceOutput(node(produced), "40")).toEqual({ type: "text", value: "a caption" });
  });

  it("carries nothing for a handle the attached workflow no longer declares", () => {
    // An edge left over from a replaced workflow. Substituting a different
    // output would silently feed the wrong image downstream.
    expect(getSourceOutput(node(produced), "999")).toEqual({ type: "image", value: null });
    expect(getSourceOutput(node(produced), null)).toEqual({ type: "image", value: null });
  });

  it("reports a declared handle that produced nothing as empty, not missing", () => {
    expect(getSourceOutput(node({ "9": "only-image" }), "30")).toEqual({
      type: "video",
      value: null,
    });
  });

  it("carries nothing when no workflow is attached", () => {
    const bare = {
      id: "comfy-2",
      type: "comfyApp",
      position: { x: 0, y: 0 },
      data: { app: null, outputs: {}, outputImage: null },
    } as unknown as WorkflowNode;
    expect(getSourceOutput(bare, "9")).toEqual({ type: "image", value: null });
  });
});
