/**
 * The saved-node library.
 *
 * A Comfy app node is a workflow plus a contract plus the values you dialled
 * into it. Saving one keeps all three, so it can be dropped onto the canvas
 * from the ordinary node menus and be ready — not merely attached, but set up
 * the way it was when you decided it was worth keeping.
 *
 * Entries live in localStorage beside the other Comfy settings. That caps the
 * library at the browser's ~5MB, shared with everything else Node Banana keeps
 * there, which is why a failed write is reported rather than swallowed: a save
 * that quietly did nothing is worse than no save at all.
 */

import { appToInputSchema } from "./nodeSchema";
import { COMFY_APPS_KEY } from "./settings";
import type { ComfyAppNodeData } from "@/types/nodes";
import type { ComfyAppDefinition, ComfyAppParam, ComfyWorkflowInspection } from "./types";

/** A workflow kept as a reusable node. */
export interface SavedComfyNode {
  /** Library id — distinct from `app.id`, which changes on every re-import. */
  id: string;
  /** The label shown in the node menus. */
  name: string;
  /** The contract, with the saved values folded into the parameter defaults. */
  app: ComfyAppDefinition;
  /**
   * The candidate list from the original import, so the picks stay editable
   * after the node is instantiated. Re-deriving it from the graph works but
   * loses the author's App Mode curation, which only exists in the upload.
   */
  inspection?: ComfyWorkflowInspection;
  savedAt: number;
}

/** Deep copy via JSON — the stored shapes are plain data, and this keeps a node
 *  editing its own app from reaching back into the library's copy. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isBrowser = (): boolean => typeof window !== "undefined" && !!window.localStorage;

/** Entries that survive a shape check — a half-written app would break a node. */
function parse(raw: string | null): SavedComfyNode[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SavedComfyNode => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<SavedComfyNode>;
      // All three arrays, not just the outputs. The connection menu calls
      // `app.inputs.some(...)` on every entry as it renders, and the picker
      // reads `app.params.length` — so an entry written by an older build, or
      // edited by hand in localStorage, would pass this check and then throw
      // inside a render, which is exactly what the check exists to prevent.
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        !!candidate.app &&
        Array.isArray(candidate.app.inputs) &&
        Array.isArray(candidate.app.params) &&
        Array.isArray(candidate.app.outputs)
      );
    });
  } catch {
    return [];
  }
}

/** Newest first — the one you just saved is the one you are looking for. */
export function listSavedComfyNodes(): SavedComfyNode[] {
  if (!isBrowser()) return [];
  return parse(window.localStorage.getItem(COMFY_APPS_KEY)).sort(
    (a, b) => b.savedAt - a.savedAt
  );
}

export function getSavedComfyNode(id: string): SavedComfyNode | null {
  return listSavedComfyNodes().find((entry) => entry.id === id) ?? null;
}

/**
 * Fold the values a node is currently running into its parameter defaults.
 *
 * This is what separates a saved *node* from a saved workflow: the model,
 * the prompt and the step count come back the way you left them. Seeds are
 * left alone — they are re-randomised per run, so pinning one would make every
 * copy of the node produce the same picture.
 */
export function withDialledValues(
  app: ComfyAppDefinition,
  values: Record<string, unknown>
): ComfyAppDefinition {
  const params: ComfyAppParam[] = app.params.map((param) => {
    const value = values[param.id];
    if (param.isSeed || value === undefined) return param;
    return { ...param, default: value as ComfyAppParam["default"] };
  });
  return { ...app, params };
}

function write(entries: SavedComfyNode[]): void {
  if (!isBrowser()) {
    // Loudly, not silently: a save that quietly did nothing is the one failure
    // this module exists to avoid.
    throw new Error("Saved nodes are only available in the browser.");
  }
  // Serialised outside the try, so a value that cannot be stringified is not
  // reported as a storage problem the user could fix by deleting something.
  const payload = JSON.stringify(entries);
  try {
    window.localStorage.setItem(COMFY_APPS_KEY, payload);
  } catch {
    // Almost always the storage quota. Nothing here can free space safely —
    // the other keys are the user's projects and costs — so it is reported.
    throw new Error(
      "There is no room left to save this node. Delete a saved node and try again."
    );
  }
  notify();
}

/** Save a new entry, or overwrite `id` when replacing an existing one. */
export function saveComfyNode(entry: {
  id?: string;
  name: string;
  app: ComfyAppDefinition;
  inspection?: ComfyWorkflowInspection;
}): SavedComfyNode {
  const saved: SavedComfyNode = {
    id: entry.id ?? `saved_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: entry.name.trim() || entry.app.name || "Comfy node",
    app: clone(entry.app),
    ...(entry.inspection ? { inspection: clone(entry.inspection) } : {}),
    savedAt: Date.now(),
  };
  const existing = listSavedComfyNodes();
  const index = existing.findIndex((e) => e.id === saved.id);
  if (index >= 0) existing[index] = saved;
  else existing.push(saved);
  write(existing);
  return saved;
}

export function removeSavedComfyNode(id: string): void {
  write(listSavedComfyNodes().filter((entry) => entry.id !== id));
}

export function renameSavedComfyNode(id: string, name: string): void {
  write(
    listSavedComfyNodes().map((entry) =>
      entry.id === id ? { ...entry, name: name.trim() || entry.name } : entry
    )
  );
}

/**
 * A private copy of a saved entry's contract, for a node about to use it.
 *
 * The library's own objects are handed out by reference — a node editing its
 * picks would otherwise rewrite the saved entry as a side effect.
 */
export function instantiateSavedComfyNode(saved: SavedComfyNode): {
  app: ComfyAppDefinition;
  inspection?: ComfyWorkflowInspection;
} {
  return {
    app: clone(saved.app),
    ...(saved.inspection ? { inspection: clone(saved.inspection) } : {}),
  };
}

/**
 * The node data a saved entry becomes when it is dropped onto the canvas.
 *
 * Mirrors what attaching a workflow produces, plus `savedNodeId` — which
 * records where it came from, so the dialog can offer to update that entry
 * rather than leaving another near-identical one as the only way back.
 */
export function seedFromSavedComfyNode(saved: SavedComfyNode): Partial<ComfyAppNodeData> {
  const { app, inspection } = instantiateSavedComfyNode(saved);
  return {
    app,
    ...(inspection ? { inspection } : {}),
    inputSchema: appToInputSchema(app),
    savedNodeId: saved.id,
    // Seeds are excluded exactly as they are on a fresh attach: leaving one
    // unset is what lets the executor randomise it per run.
    paramValues: Object.fromEntries(
      app.params
        .filter((param) => param.default !== undefined && !param.isSeed)
        .map((param) => [param.id, param.default])
    ),
  };
}

/* ── change notification ───────────────────────────────────────── */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Watch the library.
 *
 * Saving happens inside a dialog while the menus that list saved nodes are
 * mounted elsewhere, so a plain read of localStorage would go stale until a
 * reload. The `storage` event covers the same app open in a second tab, which
 * never fires for the tab that made the change — hence both.
 */
export function subscribeSavedComfyNodes(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === COMFY_APPS_KEY) listener();
  };
  if (isBrowser()) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (isBrowser()) window.removeEventListener("storage", onStorage);
  };
}
