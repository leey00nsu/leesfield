import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ComfyWorkflowImportModal } from "@/components/modals/ComfyWorkflowImportModal";
import { invalidateSavedComfyNodes } from "@/hooks/useSavedComfyNodes";
import { listSavedComfyNodes, saveComfyNode } from "@/lib/comfy/library";
import type { ComfyAppDefinition, ComfyWorkflowInspection } from "@/lib/comfy/types";

/**
 * The dialog reached through a node's gear — where a node is kept, and where a
 * kept one is picked up again.
 *
 * Driven in `reconfigure` mode throughout: that path fills the confirm step
 * from what it was handed, with no engine round-trip, so these exercise the
 * real component rather than a mocked shell of it.
 */

const app = (over: Partial<ComfyAppDefinition> = {}): ComfyAppDefinition => ({
  id: "app-1",
  name: "Upscale Pass",
  description: "",
  source: "upload",
  graph: { "1": { class_type: "LoadImage", inputs: { image: "x.png" } } },
  inputs: [],
  params: [
    { id: "3:steps", label: "Steps", nodeId: "3", inputKey: "steps", type: "integer", default: 20 },
  ],
  outputs: [{ id: "9", label: "Result", type: "image", nodeId: "9", classType: "SaveImage" }],
  classTypes: ["LoadImage", "SaveImage"],
  nodeCount: 2,
  createdAt: 0,
  ...over,
});

const inspection = (): ComfyWorkflowInspection => ({
  nodeCount: 2,
  classTypes: ["LoadImage", "SaveImage"],
  imageInputCandidates: [],
  mediaInputCandidates: [],
  outputCandidates: [{ nodeId: "9", classType: "SaveImage", label: "Result" }],
  widgetCandidates: [
    {
      nodeId: "3",
      inputKey: "steps",
      classType: "KSampler",
      label: "Steps",
      valueType: "integer",
      currentValue: 20,
      connectableAs: null,
      fromAppMode: true,
    },
  ],
  hasAppMode: true,
  appModeOutputNodeIds: ["9"],
  suggested: { name: "Upscale Pass", inputs: [], params: [], outputs: [] },
  blueprints: [],
  warnings: [],
});

const open = (props: Partial<React.ComponentProps<typeof ComfyWorkflowImportModal>> = {}) =>
  render(
    <ComfyWorkflowImportModal
      isOpen
      onClose={vi.fn()}
      onAttach={vi.fn()}
      reconfigure={{ app: app(), inspection: inspection() }}
      paramValues={{ "3:steps": 40 }}
      {...props}
    />
  );

describe("saving a Comfy node from the edit dialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateSavedComfyNodes();
  });

  it("keeps the node in the library", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as node" }));

    const saved = listSavedComfyNodes();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe("Upscale Pass");
  });

  it("keeps the values the node is running, not the workflow's own", () => {
    // A saved node that came back at the workflow's defaults would be a saved
    // workflow — the settings are the reason for saving it.
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as node" }));

    const param = listSavedComfyNodes()[0]!.app.params.find((p) => p.id === "3:steps");
    expect(param?.default).toBe(40);
  });

  it("says that it saved", () => {
    // Nothing else about the dialog changes, so without this there is no way
    // to tell the button did anything.
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as node" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("offers to update the entry a node came from", () => {
    const entry = saveComfyNode({ name: "Upscale Pass", app: app() });
    open({ savedNodeId: entry.id });

    fireEvent.click(screen.getByRole("button", { name: "Update saved node" }));

    // Updated in place: a second near-identical entry is the thing this avoids.
    expect(listSavedComfyNodes()).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Updated");
  });

  it("does not offer to update an entry that has been deleted", () => {
    open({ savedNodeId: "gone" });

    expect(screen.queryByRole("button", { name: "Update saved node" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as node" })).toBeInTheDocument();
  });

  it("reports a failed save rather than losing it", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    // Restored in a `finally`: a failed assertion here would otherwise leave
    // every later test in this file writing through a throwing `setItem`, and
    // they would fail for a reason that has nothing to do with them.
    try {
      open();
      fireEvent.click(screen.getByRole("button", { name: "Save as node" }));
      expect(screen.getByRole("status")).toHaveTextContent(/no room/i);
    } finally {
      setItem.mockRestore();
    }
  });
});

describe("the saved-node tab", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateSavedComfyNodes();
  });

  const openFresh = (props = {}) =>
    render(
      <ComfyWorkflowImportModal isOpen onClose={vi.fn()} onAttach={vi.fn()} {...props} />
    );

  it("is absent until something has been saved", () => {
    openFresh();
    expect(screen.queryByRole("button", { name: "Saved nodes" })).not.toBeInTheDocument();
  });

  it("lists what is in the library", () => {
    saveComfyNode({ name: "Upscale 2x", app: app() });
    openFresh();

    fireEvent.click(screen.getByRole("button", { name: "Saved nodes" }));
    expect(screen.getByText("Upscale 2x")).toBeInTheDocument();
    expect(screen.getByText(/0 inputs · 1 setting · 1 output/)).toBeInTheDocument();
  });

  it("attaches the picked entry, and says which one it was", () => {
    const entry = saveComfyNode({ name: "Upscale 2x", app: app() });
    const onAttach = vi.fn();
    openFresh({ onAttach });

    fireEvent.click(screen.getByRole("button", { name: "Saved nodes" }));
    fireEvent.click(screen.getByText("Upscale 2x"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAttach).toHaveBeenCalledTimes(1);
    const [attached, , meta] = onAttach.mock.calls[0]!;
    expect(attached.name).toBe("Upscale Pass");
    expect(meta).toEqual({ savedNodeId: entry.id });
  });

  it("asks before deleting one", () => {
    // localStorage keeps no history, so this is the only chance to change
    // your mind.
    saveComfyNode({ name: "Upscale 2x", app: app() });
    openFresh();
    fireEvent.click(screen.getByRole("button", { name: "Saved nodes" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete Upscale 2x" }));
    expect(listSavedComfyNodes()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(listSavedComfyNodes()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete Upscale 2x" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(listSavedComfyNodes()).toHaveLength(0);
  });
});
