/**
 * Revisiting an attached Comfy app's picks.
 *
 * The import dialog is also the edit dialog: reopening it on a node that
 * already has a workflow shows the same candidate list with that node's
 * selection applied. These are the pure parts of making that non-destructive.
 */

import type { ComfyAppDefinition, ComfyAppParam, ComfyWidgetCandidate } from "./types";

/**
 * The key both this module and the import dialog address a binding by.
 *
 * Exported because they must agree exactly: {@link withAppLabels} writes it and
 * the dialog's `roles` map reads it, so two copies that drift would silently
 * stop matching each other's entries.
 */
export const bindingKey = (nodeId: string, inputKey: string): string => `${nodeId}:${inputKey}`;

/**
 * Carry the node's own names onto a candidate list.
 *
 * Two things converge here. A label the user edited should not revert to the
 * class name when they come back to it. And a candidate list re-derived from the
 * runnable graph has no App Mode, so a workflow with two `PrimitiveFloat` values
 * would list both as "PrimitiveFloat · Value" — indistinguishable, though one is
 * brightness and the other contrast.
 */
export function withAppLabels<T extends { widgetCandidates: ComfyWidgetCandidate[] }>(
  result: T,
  app: Pick<ComfyAppDefinition, "inputs" | "params">
): T {
  const labels = new Map<string, string>();
  for (const param of app.params) labels.set(param.id, param.label);
  for (const input of app.inputs) labels.set(input.id, input.label);
  return {
    ...result,
    widgetCandidates: result.widgetCandidates.map((candidate) => {
      const label = labels.get(bindingKey(candidate.nodeId, candidate.inputKey));
      return label ? { ...candidate, label } : candidate;
    }),
  };
}

/**
 * The parameter values a re-picked contract should start from.
 *
 * A setting the user kept keeps its value — dialling in 32 steps and then being
 * shown the list again must not silently reset it to the workflow's 20. A newly
 * exposed setting starts at its default, and one that was dropped is gone, so no
 * value survives for a parameter the node no longer has.
 *
 * `undefined` is written deliberately for a default-less parameter: the run
 * route skips undefined values, so the graph keeps whatever the author saved.
 */
export function mergeParamValues(
  params: ComfyAppParam[],
  previous: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    params.map((param) => [param.id, param.id in previous ? previous[param.id] : param.default])
  );
}
