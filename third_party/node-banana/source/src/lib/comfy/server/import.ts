/**
 * The import pipeline: a raw uploaded JSON blob → a proposed node contract.
 *
 * Two upload shapes arrive here and they behave very differently:
 *
 * - **API format** (`Export (API)`) is executable as-is but carries no App Mode
 *   configuration, so the contract has to be inferred.
 * - **Editor format** (the normal `Save`) carries the author's App Mode
 *   selections — the whole point of this feature — but is *not* executable: it
 *   stores widget values positionally, so converting it needs a node catalog
 *   from a reachable engine.
 *
 * Node Banana therefore accepts the file users already have, and reaches out to
 * the configured engine to interpret it — no "export it a different way" step.
 */

import {
  blueprintAppMode,
  blueprintToWorkflowFile,
  ComfyConversionError,
  convertEditorGraph,
  editorNodeTypes,
  extractAppMode,
  extractBlueprints,
  isEditorFormat,
  type AppModeData,
  type EditorWorkflowFile,
} from "../editor";
import { graphClassTypes, parseApiGraph } from "../graph";
import { inspectWorkflow } from "../inspect";
import type {
  ComfyBlueprintSummary,
  ComfyGraph,
  ComfyObjectInfo,
  ComfyWorkflowInspection,
} from "../types";
import type { ComfyEngine } from "./engine";
import { getObjectInfo } from "./index";

export class ComfyImportError extends Error {
  readonly status: number;
  /** Node types no reachable engine declares, when that is the cause. */
  readonly missingNodes: string[];
  constructor(message: string, status = 422, missingNodes: string[] = []) {
    super(message);
    this.name = "ComfyImportError";
    this.status = status;
    this.missingNodes = missingNodes;
  }
}

export interface PreparedWorkflow {
  graph: ComfyGraph;
  appMode: AppModeData | null;
  objectInfo: ComfyObjectInfo | undefined;
  blueprints: ComfyBlueprintSummary[];
  warnings: string[];
}

/**
 * Coerce an upload into an executable graph, resolving App Mode along the way.
 *
 * The catalog is fetched only when it is actually required (an editor save), so
 * importing an API export still works with no engine reachable at all.
 */
export async function prepareWorkflow(
  raw: unknown,
  engine: ComfyEngine | null,
  options: { blueprintId?: string; signal?: AbortSignal } = {}
): Promise<PreparedWorkflow> {
  const warnings: string[] = [];

  if (!isEditorFormat(raw)) {
    if (options.blueprintId) {
      throw new ComfyImportError(
        "Blueprints live in editor-format workflows; this file is an API export."
      );
    }
    const graph = parseApiGraph(raw);
    // The catalog is optional here — it only enriches dropdowns and tooltips —
    // so an unreachable engine degrades rather than blocking the import.
    let objectInfo: ComfyObjectInfo | undefined;
    if (engine) {
      objectInfo = await getObjectInfo(engine).catch(() => undefined);
      if (!objectInfo) {
        warnings.push(
          "Could not reach the ComfyUI engine, so dropdown options and value limits are unavailable."
        );
      }
    }
    return { graph, appMode: null, objectInfo, blueprints: [], warnings };
  }

  const file = raw as EditorWorkflowFile;
  const blueprints = extractBlueprints(file);

  if (!engine) {
    throw new ComfyImportError(
      "Interpreting a saved ComfyUI workflow needs a reachable engine. Connect Comfy Cloud or a local ComfyUI in Settings → ComfyUI, then import again."
    );
  }

  let objectInfo: ComfyObjectInfo;
  try {
    objectInfo = await getObjectInfo(engine);
  } catch (error) {
    throw new ComfyImportError(
      `Could not read the node catalog from ${engine.label}, which is needed to interpret a saved workflow. ${
        error instanceof Error ? error.message : ""
      }`.trim()
    );
  }

  // Report *everything* missing up front. Converting node-by-node would fail on
  // the first unknown type and hide the rest, so the user would install one
  // pack, retry, and hit the next one.
  let missing = editorNodeTypes(file).filter((type) => !objectInfo[type]);
  if (missing.length > 0) {
    // The catalog is cached for minutes, so a user who installs the missing
    // node pack and retries would keep hitting the same stale answer. Re-read
    // once before reporting a failure they cannot clear.
    objectInfo = await getObjectInfo(engine, { force: true }).catch(
      () => objectInfo
    );
    missing = editorNodeTypes(file).filter((type) => !objectInfo[type]);
  }

  if (options.blueprintId) {
    const { workflow, instanceNodeId, skippedOutputs, unsupportedInputs } =
      blueprintToWorkflowFile(file, options.blueprintId);
    // Only the chosen blueprint is converted, so only its own node types are
    // its problem — a file carrying several would otherwise tell the user to
    // install a pack for a blueprint they did not pick.
    const blueprintMissing = editorNodeTypes(workflow).filter((type) => !objectInfo[type]);
    const graph = convert(workflow, objectInfo, blueprintMissing, engine.label);
    for (const skipped of skippedOutputs) {
      warnings.push(`Output "${skipped}" has no displayable type and was left unbound.`);
    }
    if (unsupportedInputs.length > 0) {
      warnings.push(
        `This Blueprint expects ${unsupportedInputs.join(", ")} to be wired inside ComfyUI. Node Banana cannot supply those, so it will not run as-is.`
      );
    }
    return {
      graph,
      appMode: blueprintAppMode(file, options.blueprintId, instanceNodeId),
      objectInfo,
      blueprints,
      warnings,
    };
  }

  const graph = convert(file, objectInfo, missing, engine.label);
  const appMode = extractAppMode(file, Object.keys(graph));
  if (!appMode && blueprints.length === 0) {
    warnings.push(
      "This workflow has no App Mode setup, so inputs and outputs were detected automatically — check them below."
    );
  }
  return { graph, appMode, objectInfo, blueprints, warnings };
}

function convert(
  file: EditorWorkflowFile,
  objectInfo: ComfyObjectInfo,
  missing: string[],
  engineLabel: string
): ComfyGraph {
  try {
    return convertEditorGraph(file, objectInfo);
  } catch (error) {
    if (error instanceof ComfyConversionError) {
      if (missing.length > 0) {
        throw new ComfyImportError(
          `${engineLabel} does not have ${
            missing.length === 1 ? "the node" : "the nodes"
          } ${missing.map((n) => `"${n}"`).join(", ")}. Install the node pack there, or switch engines in Settings → ComfyUI.`,
          422,
          missing
        );
      }
      throw new ComfyImportError(error.message);
    }
    throw error;
  }
}

/** Prepare an upload and propose a contract for it, in one step. */
export async function inspectUpload(
  raw: unknown,
  engine: ComfyEngine | null,
  options: { blueprintId?: string; defaultName?: string; signal?: AbortSignal } = {}
): Promise<ComfyWorkflowInspection & { graph: ComfyGraph }> {
  const prepared = await prepareWorkflow(raw, engine, options);
  const inspection = inspectWorkflow(prepared.graph, {
    ...(prepared.objectInfo ? { objectInfo: prepared.objectInfo } : {}),
    appMode: prepared.appMode,
    blueprints: prepared.blueprints,
    ...(options.defaultName ? { defaultName: options.defaultName } : {}),
    warnings: prepared.warnings,
  });
  return { ...inspection, graph: prepared.graph, classTypes: graphClassTypes(prepared.graph) };
}
