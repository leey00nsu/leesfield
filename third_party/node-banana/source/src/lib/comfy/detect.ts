/**
 * Tell a ComfyUI workflow apart from one of ours, from the JSON alone.
 *
 * A dropped `.json` could be either, and they are only distinguishable by
 * shape: nothing in the file names its own origin. Used on the canvas, where
 * the wrong guess either replaces the user's whole canvas with a stranger's
 * graph or refuses a perfectly good workflow — so both checks below look for
 * structure the other format never has.
 */

/** Our own save: nodes and edges, stamped with a format version. */
export function isNodeBananaWorkflow(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const file = raw as Record<string, unknown>;
  return (
    file.version !== undefined && Array.isArray(file.nodes) && Array.isArray(file.edges)
  );
}

/**
 * A ComfyUI workflow, in either format ComfyUI writes.
 *
 * An **editor save** carries the canvas bookkeeping the editor needs to
 * redraw itself — link tables and id counters — which our own saves never
 * have, even though both keep their nodes under `nodes`. An **API export** is
 * a flat map of node id to `{class_type, inputs}`, sometimes wrapped in the
 * `{prompt: …}` envelope other tools emit.
 *
 * This only decides where the file should go; the import route does the real
 * parsing and reports anything malformed with a message the user can act on.
 */
export function isComfyWorkflow(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (isNodeBananaWorkflow(raw)) return false;
  const file = raw as Record<string, unknown>;

  if (Array.isArray(file.nodes)) {
    return "links" in file || "last_node_id" in file || "last_link_id" in file;
  }

  const graph = (
    file.prompt !== null && typeof file.prompt === "object" ? file.prompt : file
  ) as Record<string, unknown>;
  return Object.values(graph).some(
    (node) => node !== null && typeof node === "object" && "class_type" in node
  );
}
