import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  getSavedComfyNode,
  instantiateSavedComfyNode,
  listSavedComfyNodes,
  removeSavedComfyNode,
  renameSavedComfyNode,
  saveComfyNode,
  seedFromSavedComfyNode,
  withDialledValues,
} from "@/lib/comfy/library";
import { COMFY_APPS_KEY } from "@/lib/comfy/settings";
import type { ComfyAppDefinition } from "@/lib/comfy/types";

const app = (over: Partial<ComfyAppDefinition> = {}): ComfyAppDefinition => ({
  id: "comfy_1",
  name: "Upscale 2x",
  description: "",
  source: "upload",
  graph: { "1": { class_type: "LoadImage", inputs: {} } },
  inputs: [
    {
      id: "1:image",
      name: "image",
      label: "Photo",
      type: "image",
      nodeId: "1",
      inputKey: "image",
      required: true,
    },
  ],
  params: [
    { id: "3:steps", label: "Steps", nodeId: "3", inputKey: "steps", type: "integer", default: 20 },
    { id: "3:seed", label: "Seed", nodeId: "3", inputKey: "seed", type: "integer", default: 0, isSeed: true },
  ],
  outputs: [
    { id: "9", label: "Result", type: "image", nodeId: "9", classType: "SaveImage" },
  ],
  classTypes: ["LoadImage", "SaveImage"],
  nodeCount: 2,
  createdAt: 1,
  ...over,
});

describe("the saved-node library", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps a saved node and gives it back", () => {
    const entry = saveComfyNode({ name: "Upscale 2x", app: app() });

    expect(listSavedComfyNodes()).toHaveLength(1);
    expect(getSavedComfyNode(entry.id)?.name).toBe("Upscale 2x");
    expect(getSavedComfyNode(entry.id)?.app.outputs).toHaveLength(1);
  });

  it("overwrites the entry it was given, rather than adding another", () => {
    // Otherwise "update" leaves a pile of near-identical entries, which is the
    // failure this whole id exists to prevent.
    const first = saveComfyNode({ name: "Upscale", app: app() });
    saveComfyNode({ id: first.id, name: "Upscale (better)", app: app() });

    const all = listSavedComfyNodes();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Upscale (better)");
  });

  it("does not hand out the library's own objects", () => {
    // A node editing its picks must not rewrite the saved entry as it goes.
    const entry = saveComfyNode({ name: "Upscale", app: app() });
    const taken = instantiateSavedComfyNode(entry);
    taken.app.outputs.pop();
    taken.app.name = "mangled";

    expect(getSavedComfyNode(entry.id)?.app.outputs).toHaveLength(1);
    expect(getSavedComfyNode(entry.id)?.app.name).toBe("Upscale 2x");
  });

  it("skips an entry it cannot use instead of losing the whole library", () => {
    window.localStorage.setItem(
      COMFY_APPS_KEY,
      JSON.stringify([{ id: "broken", name: "Broken" }, null, "nonsense"])
    );
    expect(listSavedComfyNodes()).toEqual([]);
  });

  it("skips an app missing any of the three arrays a node reads", () => {
    // Not just the outputs. The connection menu calls `app.inputs.some(...)` on
    // every entry as it renders and the picker reads `app.params.length`, so an
    // entry from an older build would pass a check that only looked at outputs
    // and then throw in the middle of a render.
    window.localStorage.setItem(
      COMFY_APPS_KEY,
      JSON.stringify([
        { id: "a", name: "No inputs", savedAt: 1, app: { ...app(), inputs: undefined } },
        { id: "b", name: "No params", savedAt: 2, app: { ...app(), params: undefined } },
        { id: "c", name: "No outputs", savedAt: 3, app: { ...app(), outputs: undefined } },
        { id: "d", name: "Whole", savedAt: 4, app: app() },
      ])
    );

    expect(listSavedComfyNodes().map((entry) => entry.id)).toEqual(["d"]);
  });

  it("survives storage holding something that is not a list", () => {
    window.localStorage.setItem(COMFY_APPS_KEY, "{oh dear");
    expect(listSavedComfyNodes()).toEqual([]);
  });

  it("removes and renames", () => {
    const entry = saveComfyNode({ name: "Upscale", app: app() });
    renameSavedComfyNode(entry.id, "Enhance");
    expect(getSavedComfyNode(entry.id)?.name).toBe("Enhance");

    removeSavedComfyNode(entry.id);
    expect(listSavedComfyNodes()).toEqual([]);
  });

  it("reports a full library rather than dropping the save", () => {
    // A save that silently did nothing is worse than one that refuses.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => saveComfyNode({ name: "Upscale", app: app() })).toThrow(/no room/i);
    setItem.mockRestore();
  });
});

describe("withDialledValues", () => {
  it("folds the values the node is running into the defaults", () => {
    // This is what makes it a saved *node*: it comes back set up.
    const folded = withDialledValues(app(), { "3:steps": 40 });
    expect(folded.params.find((p) => p.id === "3:steps")?.default).toBe(40);
  });

  it("leaves seeds where they were", () => {
    // Pinning a seed would make every copy of the node produce one picture.
    const folded = withDialledValues(app(), { "3:seed": 12345 });
    expect(folded.params.find((p) => p.id === "3:seed")?.default).toBe(0);
  });

  it("does not touch the app it was given", () => {
    const original = app();
    withDialledValues(original, { "3:steps": 40 });
    expect(original.params.find((p) => p.id === "3:steps")?.default).toBe(20);
  });
});

describe("seedFromSavedComfyNode", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("produces a node that already has its workflow, handles and settings", () => {
    const entry = saveComfyNode({
      name: "Upscale",
      app: withDialledValues(app(), { "3:steps": 40 }),
    });

    const seed = seedFromSavedComfyNode(entry);

    expect((seed.app as ComfyAppDefinition).name).toBe("Upscale 2x");
    expect(seed.savedNodeId).toBe(entry.id);
    // The handle map has to be there on arrival — it is what a dropped wire
    // lands on, and nothing else builds it for a node created from a menu.
    expect(seed.inputSchema).toEqual([
      { name: "image", type: "image", required: true, label: "Photo" },
    ]);
    expect(seed.paramValues).toEqual({ "3:steps": 40 });
  });

  it("leaves the seed unset so repeat runs still vary", () => {
    const entry = saveComfyNode({ name: "Upscale", app: app() });
    expect(seedFromSavedComfyNode(entry).paramValues).not.toHaveProperty("3:seed");
  });
});
