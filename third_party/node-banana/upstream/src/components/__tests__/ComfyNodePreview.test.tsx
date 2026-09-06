import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ComfyNodePreview } from "@/components/modals/ComfyNodePreview";
import type { ComfyAppInput, ComfyAppOutput, ComfyAppParam } from "@/lib/comfy/types";

const input = (over: Partial<ComfyAppInput> = {}): ComfyAppInput => ({
  id: "24:text",
  name: "prompt",
  label: "Prompt",
  type: "text",
  nodeId: "24",
  inputKey: "text",
  required: false,
  ...over,
});

const output = (over: Partial<ComfyAppOutput> = {}): ComfyAppOutput => ({
  id: "9",
  label: "Result",
  type: "image",
  nodeId: "9",
  classType: "SaveImage",
  ...over,
});

const base = {
  name: "My Workflow",
  source: "upload" as const,
  nodeCount: 12,
  inputs: [],
  params: [],
  outputs: [],
};

/** The coloured circles standing in for React Flow's handles. */
const dots = (container: HTMLElement) =>
  [...container.querySelectorAll("span")].filter((el) =>
    el.className.includes("rounded-full")
  );

describe("ComfyNodePreview", () => {
  it("carries one handle per exposed input and output", () => {
    // This is the question the dialog is really asking — how many things can
    // be plugged into this node — and it is the one a list of bindings answers
    // worst.
    const { container } = render(
      <ComfyNodePreview
        {...base}
        inputs={[input(), input({ id: "16:image", label: "Product", type: "image" })]}
        outputs={[output()]}
      />
    );

    expect(dots(container)).toHaveLength(3);
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows the settings with the values the node will start from", () => {
    // Not the defaults' placeholder: a node is seeded on attach, so a preview
    // showing "Default (…)" would be of a node that never exists.
    const params: ComfyAppParam[] = [
      { id: "31:steps", label: "Steps", nodeId: "31", inputKey: "steps", type: "integer", default: 20 },
    ];
    render(<ComfyNodePreview {...base} params={params} outputs={[output()]} />);

    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
  });

  it("says so plainly when the workflow exposes nothing to adjust", () => {
    render(<ComfyNodePreview {...base} outputs={[output()]} />);
    expect(screen.getByText(/exposes no settings/i)).toBeInTheDocument();
  });

  it("names the node, and says where it came from", () => {
    render(<ComfyNodePreview {...base} source="blueprint" outputs={[output()]} />);
    expect(screen.getByText("My Workflow")).toBeInTheDocument();
    expect(screen.getByText("Blueprint")).toBeInTheDocument();
    expect(screen.getByText("12 nodes")).toBeInTheDocument();
  });
});
