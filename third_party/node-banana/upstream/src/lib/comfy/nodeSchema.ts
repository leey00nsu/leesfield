/**
 * Bridging a Comfy app contract to Node Banana's dynamic-handle machinery.
 *
 * Generation nodes already declare variable handles through `inputSchema`
 * (`ModelInputDef[]`), and `getConnectedInputs` uses that list to map an
 * indexed handle id (`image-0`, `text-1`) onto a named slot in `dynamicInputs`.
 * A Comfy app's inputs are the same idea with a different source, so they reuse
 * the same representation rather than inventing a parallel one.
 */

import type { ModelInputDef } from "@/types/nodes";
import type { ComfyAppDefinition, ComfyAppInput } from "./types";

/**
 * The `inputSchema` a Comfy app node should carry.
 *
 * Order matters: `getConnectedInputs` assigns `image-0`, `image-1`, … by the
 * order of same-typed entries in this list, so it must match the order the node
 * renders its handles in.
 */
export function appToInputSchema(app: ComfyAppDefinition): ModelInputDef[] {
  return app.inputs.map((input) => ({
    name: input.name,
    type: input.type,
    required: input.required,
    label: input.label,
    ...(input.description ? { description: input.description } : {}),
  }));
}

/**
 * Each input paired with the handle id it is rendered as.
 *
 * Ids are indexed per type — `image-0`, `image-1`, `text-0` — which the store
 * relies on to map a handle back to its slot. Anything that needs to name one
 * of these handles has to count the same way, so they all count here.
 */
export function appInputHandles(
  app: ComfyAppDefinition
): Array<ComfyAppInput & { handleId: string }> {
  const counters: Record<string, number> = {};
  return app.inputs.map((input) => {
    const index = counters[input.type] ?? 0;
    counters[input.type] = index + 1;
    return { ...input, handleId: `${input.type}-${index}` };
  });
}
