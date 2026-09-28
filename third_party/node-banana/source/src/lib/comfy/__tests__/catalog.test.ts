/**
 * The recorded-Blueprint corpus.
 *
 * Every published ComfyUI Blueprint in here once broke Node Banana in a
 * different way, and each break shared a property: the import succeeded, the
 * node looked fine, and the damage only showed up in a render — sometimes not
 * even then, because the run returned a plausible picture made from the wrong
 * inputs. Unit tests over hand-written fixtures never caught any of them, so
 * this runs the real conversion over real workflows and asserts the invariants
 * they each violated.
 *
 * It is hermetic: the workflows and the node catalog are recorded on disk, so
 * there is no network, no GPU and no cost. Refresh them with
 *
 *   node scripts/comfy-smoke.mjs record
 *
 * and drive real renders with `node scripts/comfy-smoke.mjs run`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  blueprintAppMode,
  blueprintToWorkflowFile,
  convertEditorGraph,
  editorNodeTypes,
  extractBlueprints,
  type EditorWorkflowFile,
} from "../editor";
import { isPlaceholderMedia, loaderWidgetKey } from "../graph";
import { inspectWorkflow } from "../inspect";
import type { ComfyGraph, ComfyObjectInfo, ComfyWorkflowInspection } from "../types";

const FIXTURES = join(__dirname, "fixtures/catalog");
const objectInfo = JSON.parse(
  readFileSync(join(FIXTURES, "object-info.json"), "utf8")
) as ComfyObjectInfo;

interface Recorded {
  id: string;
  name: string;
  why: string;
  workflow: EditorWorkflowFile;
}

const corpus: Recorded[] = readdirSync(join(FIXTURES, "blueprints"))
  .filter((f) => f.endsWith(".json"))
  .map((file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, "blueprints", file), "utf8"));
    return { id: file.replace(/\.json$/, ""), ...raw } as Recorded;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

/** The blueprint inside a recorded file — each records exactly one. */
function blueprintIdOf(file: EditorWorkflowFile): string {
  const [first] = extractBlueprints(file);
  if (!first) throw new Error("recorded file declares no blueprint");
  return first.id;
}

/** Run the real import pipeline, exactly as `prepareWorkflow` does. */
function importBlueprint(entry: Recorded): {
  graph: ComfyGraph;
  inspection: ComfyWorkflowInspection;
} {
  const blueprintId = blueprintIdOf(entry.workflow);
  const { workflow, instanceNodeId } = blueprintToWorkflowFile(entry.workflow, blueprintId);
  const graph = convertEditorGraph(workflow, objectInfo);
  const appMode = blueprintAppMode(entry.workflow, blueprintId, instanceNodeId);
  const inspection = inspectWorkflow(graph, {
    objectInfo,
    appMode,
    defaultName: entry.name,
  });
  return { graph, inspection };
}

/**
 * Inputs the engine demands but which carry no widget value.
 *
 * `COMFY_AUTOGROW_*` and `COMFY_MATCHTYPE_*` declare dynamic *socket* groups:
 * they are filled by links and the engine has no positional argument for them,
 * so their absence from a graph is correct rather than a defect.
 */
function isSocketGroup(spec: unknown): boolean {
  const type = Array.isArray(spec) ? spec[0] : null;
  return (
    typeof type === "string" &&
    (type.startsWith("COMFY_AUTOGROW_") || type.startsWith("COMFY_MATCHTYPE_"))
  );
}

/**
 * Whether the catalog lets this input go unfed.
 *
 * A dynamic group's members (`values.b`, `resize_type.width`) are addressed
 * through the group, so the group's own declaration is what decides.
 */
function isOptionalInput(classType: string, inputKey: string): boolean {
  const entry = objectInfo[classType]?.input;
  const group = inputKey.split(".")[0];
  const optional = entry?.optional ?? {};
  return inputKey in optional || group in optional;
}

/**
 * Bindings the run fills in: connected handles, settings, and the extra targets
 * a single setting carries with it.
 *
 * These are why a saved graph may legitimately arrive without a required input.
 */
function writtenAtRunTime(inspection: ComfyWorkflowInspection): Set<string> {
  const { inputs, params } = inspection.suggested;
  return new Set([
    ...inputs.map((i) => `${i.nodeId}:${i.inputKey}`),
    ...params.flatMap((p) => [
      `${p.nodeId}:${p.inputKey}`,
      ...(p.alsoBind ?? []).map((b) => `${b.nodeId}:${b.inputKey}`),
    ]),
  ]);
}

/** Every inner input a Blueprint's boundary slots feed, as converted graph ids. */
function boundaryFedInputs(
  file: EditorWorkflowFile,
  blueprintId: string,
  instanceNodeId: string
): Array<{ nodeId: string; inputKey: string }> {
  const def = (file.definitions?.subgraphs ?? []).find((d) => String(d.id) === blueprintId);
  const nodes = new Map((def?.nodes ?? []).map((n) => [String(n.id), n]));
  const targets = new Map<number, { id: string; slot: number }>();
  for (const link of def?.links ?? []) {
    if (Array.isArray(link)) targets.set(link[0], { id: String(link[3]), slot: link[4] });
    else targets.set(link.id, { id: String(link.target_id), slot: link.target_slot });
  }

  const fed: Array<{ nodeId: string; inputKey: string }> = [];
  for (const slot of def?.inputs ?? []) {
    for (const linkId of slot.linkIds ?? []) {
      const target = targets.get(linkId);
      if (!target) continue;
      const inputKey = nodes.get(target.id)?.inputs?.[target.slot]?.name;
      if (inputKey) fed.push({ nodeId: `${instanceNodeId}:${target.id}`, inputKey });
    }
  }
  return fed;
}

describe("recorded Blueprint corpus", () => {
  it("records a corpus to check", () => {
    // A silently empty fixture directory would make every test below vacuous.
    expect(corpus.length).toBeGreaterThanOrEqual(15);
  });

  it.each(corpus.map((c) => [c.id, c] as const))("%s imports", (_id, entry) => {
    expect(() => importBlueprint(entry)).not.toThrow();
  });

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: every node it emits exists in the catalog",
    (_id, entry) => {
      // A frontend-virtual node (PrimitiveNode, Reroute) must be resolved away
      // during conversion, never emitted — the engine has no such node and
      // rejects the whole prompt.
      const { graph } = importBlueprint(entry);
      const unknown = [...new Set(Object.values(graph).map((n) => n.class_type))].filter(
        (type) => !objectInfo[type]
      );
      expect(unknown).toEqual([]);
      // And nothing it needs may be missing from the catalog either.
      expect(editorNodeTypes(entry.workflow).filter((t) => !objectInfo[t])).toEqual([]);
    }
  );

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: required inputs are present",
    (_id, entry) => {
      // The general form of the bug that killed every video Blueprint: the
      // engine binds required inputs positionally, so one omitted is not a
      // validation error but a TypeError raised *after* the model has run and
      // been paid for. `SaveVideo.codec` was the first instance found.
      const { graph, inspection } = importBlueprint(entry);
      const written = writtenAtRunTime(inspection);
      const missing: string[] = [];
      for (const [nodeId, node] of Object.entries(graph)) {
        const required = objectInfo[node.class_type]?.input?.required ?? {};
        for (const [key, spec] of Object.entries(required)) {
          if (isSocketGroup(spec)) continue;
          if (key in node.inputs) continue;
          // A handle or a setting fills its own binding on every run, so the
          // saved graph is allowed to arrive without it.
          if (written.has(`${nodeId}:${key}`)) continue;
          missing.push(`${node.class_type}#${nodeId}.${key}`);
        }
      }
      expect(missing).toEqual([]);
    }
  );

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: has somewhere to put its results",
    (_id, entry) => {
      // A node with no outputs cannot be wired to anything, and `collectRun`
      // fails the run outright. Three Blueprints imported this way because
      // their boundary output type had no sink.
      const { inspection } = importBlueprint(entry);
      expect(inspection.suggested.outputs.length).toBeGreaterThan(0);
    }
  );

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: no two controls share a label",
    (_id, entry) => {
      // Two identical "CLIPLoader · Clip Name" dropdowns, or three identical
      // prompt handles, let a user drive the wrong one and get a result that
      // looks right.
      const { inspection } = importBlueprint(entry);
      const { inputs, params, outputs } = inspection.suggested;
      for (const [kind, list] of Object.entries({ inputs, params, outputs })) {
        const labels = list.map((x) => x.label);
        expect(`${kind}: ${labels.join(" | ")}`).toBe(
          `${kind}: ${[...new Set(labels)].join(" | ")}`
        );
      }
    }
  );

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: a made-up input is not treated as a default",
    (_id, entry) => {
      // A materialised loader holds a stand-in filename nobody chose. Both
      // stock ComfyUI and Comfy Cloud really do have an `example.png`, so
      // leaving such an input optional meant an unwired node ran, billed, and
      // returned a picture of ComfyUI's own sample image.
      const { graph, inspection } = importBlueprint(entry);
      for (const input of inspection.suggested.inputs) {
        if (input.type === "text") continue;
        const node = graph[input.nodeId];
        if (!node) continue;
        const saved = node.inputs[loaderWidgetKey(node.class_type, node)];
        if (isPlaceholderMedia(saved)) {
          expect(`${input.label} required=${input.required}`).toBe(`${input.label} required=true`);
        }
      }
    }
  );

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: nothing a boundary slot feeds is left unwritten",
    (_id, entry) => {
      // A boundary slot is one thing the user sets, but the author may have
      // wired it to several inner inputs at once — and not every one of those
      // is a widget. A widget left unwritten merely keeps the author's own
      // value; a plain *socket* left unwritten is a missing argument. Two
      // Blueprints had their prompt rejected outright for it, and two more got
      // through validation and failed mid-render with "'b' is not defined for
      // expression '(b - c) * (a - 1)'" — after the model had run and billed.
      const blueprintId = blueprintIdOf(entry.workflow);
      const { workflow, instanceNodeId } = blueprintToWorkflowFile(entry.workflow, blueprintId);
      const graph = convertEditorGraph(workflow, objectInfo);
      const appMode = blueprintAppMode(entry.workflow, blueprintId, instanceNodeId);
      const written = writtenAtRunTime(
        inspectWorkflow(graph, { objectInfo, appMode, defaultName: entry.name })
      );

      const unwritten = boundaryFedInputs(entry.workflow, blueprintId, instanceNodeId).filter(
        ({ nodeId, inputKey }) => {
          const node = graph[nodeId];
          if (!node) return false; // pruned, muted, or resolved away
          if (inputKey in node.inputs) return false;
          if (written.has(`${nodeId}:${inputKey}`)) return false;
          // An input the schema marks optional may legitimately go unfed — a
          // SAM3 detection takes bounding boxes only when you have some.
          return !isOptionalInput(node.class_type, inputKey);
        }
      );
      expect(unwritten.map((u) => `${u.nodeId}.${u.inputKey}`)).toEqual([]);
    }
  );

  it.each(corpus.map((c) => [c.id, c] as const))(
    "%s: every control the author exposed survives import",
    (_id, entry) => {
      // App Mode is the author naming what a user should be able to change.
      // Dropping one silently is how a text-to-video node arrived with no
      // prompt, no resolution and no length, then rendered from an empty
      // prompt without complaint.
      const blueprintId = blueprintIdOf(entry.workflow);
      const { workflow, instanceNodeId } = blueprintToWorkflowFile(entry.workflow, blueprintId);
      const appMode = blueprintAppMode(entry.workflow, blueprintId, instanceNodeId);
      if (!appMode) return;

      const graph = convertEditorGraph(workflow, objectInfo);
      const { suggested } = inspectWorkflow(graph, { objectInfo, appMode, defaultName: entry.name });
      const bound = new Set([
        ...suggested.inputs.map((i) => `${i.nodeId}:${i.inputKey}`),
        ...suggested.params.map((p) => `${p.nodeId}:${p.inputKey}`),
      ]);
      const dropped = appMode.inputs
        .map((e) => `${e.nodeId}:${e.widget}`)
        .filter((binding) => !bound.has(binding));
      expect(dropped).toEqual([]);
    }
  );
});
