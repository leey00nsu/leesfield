/**
 * Assembling the final app contract from what the user confirmed.
 *
 * The import dialog starts from the proposal that inspection produced and lets
 * the user change it: rename a handle, demote an input to a setting, drop an
 * output. This turns that edited selection back into the definition stored on
 * the node.
 */

import { graphClassTypes } from "./graph";
import { normalizeInputs, paramFromCandidate } from "./inspect";
import type {
  ComfyAppDefinition,
  ComfyAppInput,
  ComfyAppOutput,
  ComfyAppParam,
  ComfyAppSource,
  ComfyGraph,
} from "./types";

export interface BuildAppOptions {
  name: string;
  description?: string;
  source: ComfyAppSource;
  graph: ComfyGraph;
  inputs: ComfyAppInput[];
  params: ComfyAppParam[];
  outputs: ComfyAppOutput[];
  /** Supplied by callers that need a deterministic id (tests, fixtures). */
  id?: string;
  createdAt?: number;
}

export function buildComfyApp(options: BuildAppOptions): ComfyAppDefinition {
  // Names are recomputed rather than trusted: the dialog lets labels be edited,
  // and two inputs sharing a `dynamicInputs` key would silently collide.
  const inputs = normalizeInputs(options.inputs);
  return {
    id: options.id ?? `comfy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: options.name.trim() || "ComfyUI App",
    description: options.description?.trim() ?? "",
    source: options.source,
    graph: options.graph,
    inputs,
    params: options.params,
    outputs: options.outputs,
    classTypes: graphClassTypes(options.graph),
    nodeCount: Object.keys(options.graph).length,
    createdAt: options.createdAt ?? Date.now(),
  };
}

export { paramFromCandidate };
