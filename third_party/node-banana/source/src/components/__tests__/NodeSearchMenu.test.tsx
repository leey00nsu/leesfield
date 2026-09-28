import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeSearchMenu } from "@/components/NodeSearchMenu";
import { ALL_NODE_OPTIONS } from "@/components/ConnectionDropMenu";
import { invalidateSavedComfyNodes } from "@/hooks/useSavedComfyNodes";
import { saveComfyNode } from "@/lib/comfy/library";
import type { ComfyAppDefinition } from "@/lib/comfy/types";

const position = { x: 100, y: 100 };

// The library is part of this list now, so every count below depends on it
// starting empty.
beforeEach(() => {
  window.localStorage.clear();
  invalidateSavedComfyNodes();
});

// The highlighted option carries the literal `bg-neutral-700` class (hover uses
// the distinct `hover:bg-neutral-700` token, so this identifies only the
// keyboard/pointer-selected item).
const selectedIndexOf = () =>
  screen
    .getAllByRole("button")
    .findIndex((b) => b.classList.contains("bg-neutral-700"));

describe("NodeSearchMenu", () => {
  it("lists every addable node type and excludes actions", () => {
    render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    // One button per node option.
    expect(screen.getAllByRole("button")).toHaveLength(ALL_NODE_OPTIONS.length);
    // Spot-check a couple of known nodes are present.
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Generate Video")).toBeInTheDocument();
    // Catalog contains only real, addable node types (no connection actions).
    expect(ALL_NODE_OPTIONS.every((o) => !o.isAction)).toBe(true);
  });

  it("filters the list by the search query", () => {
    render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Search nodes"), {
      target: { value: "video" },
    });
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => /video|frame grab/i.test(l))).toBe(true);
    expect(screen.getByText("Generate Video")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("Search nodes"), {
      target: { value: "zzzznope" },
    });
    expect(screen.getByText("No matching nodes")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("calls onSelect with the node type when an option is clicked", () => {
    const onSelect = vi.fn();
    render(
      <NodeSearchMenu position={position} onSelect={onSelect} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Prompt"));
    // The second argument names a saved Comfy node; a built-in has none.
    expect(onSelect).toHaveBeenCalledWith("prompt", undefined);
  });

  describe("saved Comfy nodes", () => {
    const savedApp = (): ComfyAppDefinition => ({
      id: "comfy_1",
      name: "Upscale 2x",
      description: "",
      source: "upload",
      graph: {},
      inputs: [],
      params: [],
      outputs: [{ id: "9", label: "Result", type: "image", nodeId: "9", classType: "SaveImage" }],
      classTypes: [],
      nodeCount: 2,
      createdAt: 1,
    });

    it("lists them after the built-ins, under their own heading", () => {
      saveComfyNode({ name: "Upscale 2x", app: savedApp() });
      render(
        <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
      );

      expect(screen.getByText("Saved nodes")).toBeInTheDocument();
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(ALL_NODE_OPTIONS.length + 1);
      expect(buttons[buttons.length - 1]).toHaveTextContent("Upscale 2x");
    });

    it("finds them by name", () => {
      saveComfyNode({ name: "Upscale 2x", app: savedApp() });
      render(
        <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
      );
      fireEvent.change(screen.getByLabelText("Search nodes"), {
        target: { value: "upscale" },
      });

      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(screen.getByText("Upscale 2x")).toBeInTheDocument();
    });

    it("says which saved node was picked", () => {
      const entry = saveComfyNode({ name: "Upscale 2x", app: savedApp() });
      const onSelect = vi.fn();
      render(
        <NodeSearchMenu position={position} onSelect={onSelect} onClose={vi.fn()} />
      );

      fireEvent.click(screen.getByText("Upscale 2x"));
      expect(onSelect).toHaveBeenCalledWith("comfyApp", entry.id);
    });

    it("shows no heading when nothing is saved", () => {
      render(
        <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
      );
      expect(screen.queryByText("Saved nodes")).not.toBeInTheDocument();
    });
  });

  it("selects the highlighted option on Enter", () => {
    const onSelect = vi.fn();
    render(
      <NodeSearchMenu position={position} onSelect={onSelect} onClose={vi.fn()} />
    );
    const input = screen.getByLabelText("Search nodes");
    fireEvent.change(input, { target: { value: "llm" } }); // narrows to one result
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={onClose} />
    );
    fireEvent.keyDown(screen.getByLabelText("Search nodes"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("marks the list as independently scrollable (nowheel)", () => {
    const { container } = render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    // Without the `nowheel` class React Flow's wheel handler preventDefaults over
    // the menu, blocking the list's own scroll.
    expect(container.querySelector(".overflow-y-auto")).toHaveClass("nowheel");
  });

  it("highlights the option the cursor moves over", () => {
    render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.mouseMove(buttons[3], { clientX: 10, clientY: 10 });
    expect(selectedIndexOf()).toBe(3);
  });

  it("does not let a scroll-induced hover override keyboard selection", () => {
    render(
      <NodeSearchMenu position={position} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const input = screen.getByLabelText("Search nodes");
    const buttons = screen.getAllByRole("button");

    // Cursor moves over option 2.
    fireEvent.mouseMove(buttons[2], { clientX: 10, clientY: 10 });
    expect(selectedIndexOf()).toBe(2);

    // Arrow-down advances the keyboard selection.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selectedIndexOf()).toBe(3);

    // The list scrolling under a stationary cursor fires a hover on a different
    // option but with UNCHANGED coordinates — this must be ignored.
    fireEvent.mouseMove(buttons[0], { clientX: 10, clientY: 10 });
    expect(selectedIndexOf()).toBe(3);

    // A genuine cursor move (new coordinates) does re-select.
    fireEvent.mouseMove(buttons[0], { clientX: 20, clientY: 40 });
    expect(selectedIndexOf()).toBe(0);
  });
});
