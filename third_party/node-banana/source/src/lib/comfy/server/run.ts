/**
 * Running one Comfy app: bind the node's live inputs into its stored graph,
 * hand it to the engine, and turn what comes back into data URLs the canvas
 * can render.
 *
 * Submission and collection are deliberately split. A diffusion run routinely
 * outlives a serverless invocation, so the client submits once and then polls a
 * separate short-lived route — the same shape the Kie provider already uses for
 * long video jobs.
 */

import { patchGraph, pruneToOutputs } from "../graph";
import type {
  ComfyAppDefinition,
  ComfyGraph,
  ComfyResolvedOutput,
} from "../types";
import type { ComfyEngine, ComfyOutputAsset } from "./engine";
import { ComfyEngineError } from "./engine";

/**
 * A deterministic seed derived from a run key.
 *
 * Seeds must stay inside the range JSON round-trips without precision loss, and
 * the `| 0` does that on its own: the accumulator never leaves signed 32-bit,
 * which is far below `Number.MAX_SAFE_INTEGER`. Non-negative too, because
 * ComfyUI rejects a negative seed.
 */
export function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A short, filename-safe token unique to one run.
 *
 * Kept free of `-` and `/` so appending it to a `filename_prefix` can neither
 * create a directory nor confuse ComfyUI's own `_00001_` counter suffix.
 */
export function newRunTag(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** One connected input, already resolved to bytes by the caller. */
export interface ResolvedInputMedia {
  /** `ComfyAppInput.name` this satisfies. */
  name: string;
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

export interface BuildRunGraphOptions {
  app: ComfyAppDefinition;
  /** Text values for text-typed inputs, keyed by `ComfyAppInput.name`. */
  text: Record<string, string>;
  /** Media already uploaded to the engine, keyed by `ComfyAppInput.name`. */
  uploads: Record<string, unknown>;
  /** Inline parameter values, keyed by `ComfyAppParam.id`. */
  params: Record<string, unknown>;
  /** When set, every unpinned seed widget is replaced with this value. */
  seed?: number;
  /**
   * Token making this run's output filenames unique, so the engine's node cache
   * cannot swallow a repeat run. See {@link import("../graph").PatchGraphParams.runTag}.
   */
  runTag?: string;
}

/**
 * The graph to submit for one run.
 *
 * Inputs the user left unconnected keep whatever the workflow was saved with,
 * so a partially-wired app still runs — the author's own values are a sensible
 * default, and refusing to run would be worse than producing their example.
 */
export function buildRunGraph(options: BuildRunGraphOptions): ComfyGraph {
  const { app, text, uploads, params } = options;

  const media: Array<{ nodeId: string; inputKey: string; value: unknown }> = [];
  const assignments: Array<{ nodeId: string; inputKey: string; value: unknown }> = [];

  for (const input of app.inputs) {
    if (input.type === "text") {
      const value = text[input.name];
      if (value !== undefined) {
        assignments.push({ nodeId: input.nodeId, inputKey: input.inputKey, value });
        // A boundary slot wired to two text encoders is one connection point;
        // writing only the first would leave the second on the author's text.
        for (const extra of input.alsoBind ?? []) {
          assignments.push({ nodeId: extra.nodeId, inputKey: extra.inputKey, value });
        }
      }
      continue;
    }
    const uploaded = uploads[input.name];
    if (uploaded !== undefined) {
      media.push({ nodeId: input.nodeId, inputKey: input.inputKey, value: uploaded });
    }
  }

  const pinnedSeeds: Array<{ nodeId: string; inputKey: string }> = [];
  for (const param of app.params) {
    const value = params[param.id];
    if (value === undefined || value === null || value === "") continue;
    assignments.push({ nodeId: param.nodeId, inputKey: param.inputKey, value });
    // One control, every binding the author tied to it. A blueprint boundary
    // slot feeding a checkpoint loader, a VAE loader and a text encoder is one
    // choice; writing only the first would leave a model beside the wrong VAE.
    for (const extra of param.alsoBind ?? []) {
      assignments.push({ nodeId: extra.nodeId, inputKey: extra.inputKey, value });
    }
    // A seed the user typed is a deliberate choice — never overwrite it.
    if (param.isSeed) pinnedSeeds.push({ nodeId: param.nodeId, inputKey: param.inputKey });
  }

  // Only the bound outputs are kept, so the engine does not execute (and bill
  // for) branches whose results the node would discard.
  //
  // Bound input and parameter nodes are kept as roots too. Pruning purely from
  // the outputs would drop a loader whose branch happens not to reach a bound
  // sink — and then patching its upload would fail on a node that is no longer
  // there. An unreferenced node is validated but never executed, so keeping it
  // costs nothing.
  const outputNodeIds = app.outputs.map((o) => o.nodeId);
  const keepRoots = [
    ...outputNodeIds,
    ...app.inputs.map((i) => i.nodeId),
    ...app.inputs.flatMap((i) => (i.alsoBind ?? []).map((b) => b.nodeId)),
    ...app.params.map((p) => p.nodeId),
    ...app.params.flatMap((p) => (p.alsoBind ?? []).map((b) => b.nodeId)),
  ];
  const pruned = outputNodeIds.length > 0 ? pruneToOutputs(app.graph, keepRoots) : app.graph;

  return patchGraph(pruned, {
    media,
    assignments,
    outputNodeIds,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.runTag ? { runTag: options.runTag } : {}),
    pinnedSeeds,
  });
}

/** Upload every connected media input, returning values ready for the graph. */
export async function uploadInputs(
  engine: ComfyEngine,
  inputs: ResolvedInputMedia[],
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const uploads: Record<string, unknown> = {};
  for (const input of inputs) {
    uploads[input.name] = await engine.upload(
      { bytes: input.bytes, filename: input.filename, contentType: input.contentType },
      signal
    );
  }
  return uploads;
}

/**
 * Match what the engine produced back onto the app's output handles.
 *
 * Node ids are the join key, which holds because the run graph keeps the app's
 * own ids. When a bound output produced nothing (a muted branch, an engine that
 * routed the file through a different node) the remaining assets are assigned
 * to the remaining handles of the same type, in order — better a result on a
 * slightly different handle than a silent empty run.
 *
 * A sink fed a *batch* writes one file per image, but a handle carries a single
 * value, so only the first can be shown. The rest are not thrown away: they
 * stay unclaimed and fill any same-typed handle that its own node did not
 * produce — which is how a workflow that saves a batch and its members
 * separately still lights up every handle. Where nothing is left to fill, the
 * extra images are dropped, and a node offering both a batch and its members
 * will show the batch handle carrying the batch's first image.
 */
export function resolveOutputs(
  app: ComfyAppDefinition,
  assets: ComfyOutputAsset[]
): ComfyResolvedOutput[] {
  const resolved: ComfyResolvedOutput[] = [];
  const unclaimed = [...assets];

  for (const output of app.outputs) {
    const index = unclaimed.findIndex((a) => a.nodeId === output.nodeId);
    if (index === -1) continue;
    const [asset] = unclaimed.splice(index, 1);
    if (!asset) continue;
    const value = assetValue(asset);
    if (value !== null) resolved.push({ handleId: output.id, type: output.type, value });
  }

  for (const output of app.outputs) {
    if (resolved.some((r) => r.handleId === output.id)) continue;
    const index = unclaimed.findIndex((a) => a.type === output.type);
    if (index === -1) continue;
    const [asset] = unclaimed.splice(index, 1);
    if (!asset) continue;
    const value = assetValue(asset);
    if (value !== null) resolved.push({ handleId: output.id, type: output.type, value });
  }

  return resolved;
}

/** A data URL for media, or the text itself. */
function assetValue(asset: ComfyOutputAsset): string | null {
  if (asset.type === "text") return asset.text ?? null;
  if (!asset.bytes) return null;
  const base64 = Buffer.from(asset.bytes).toString("base64");
  // `||`, not `??`: an empty content type is as useless as a missing one, and
  // `data:;base64,…` is a text data URL that neither renders nor re-uploads.
  return `data:${asset.contentType || "application/octet-stream"};base64,${base64}`;
}

/**
 * Say which output a failed node belongs to, and that it can be dropped.
 *
 * ComfyUI fails the whole prompt when any output node raises, so one unusable
 * result costs the entire render. Three published Blueprints hand a video's
 * audio back alongside the picture, and a clip with no audio track takes the
 * picture down with it — `SaveAudio: input audio is None (node 1000002)`, an id
 * that appears nowhere the user has ever been, because this importer invented
 * the node. Naming the handle turns a dead end into one unchecked box.
 *
 * Said only when there is another output to keep: dropping the sole output
 * leaves nothing to run for.
 */
export function nameFailedOutput(
  state: { error: string | null; errorNodeId?: string },
  app: ComfyAppDefinition | undefined
): string {
  const error = state.error ?? "The run failed";
  const outputs = app?.outputs ?? [];
  const failed = outputs.find((output) => output.nodeId === state.errorNodeId);
  if (!failed || outputs.length < 2) return error;
  return `${error} That is the "${failed.label}" output — turn it off under "Inputs, settings and outputs" to run without it.`;
}

/**
 * Collect a finished job and map it onto the app's handles.
 *
 * A job that reports success but surfaces nothing is treated as a failure: it
 * almost always means the workflow's bound output was pruned, muted, or never
 * reached, and silently returning an empty node hides that.
 */
export async function collectRun(
  engine: ComfyEngine,
  app: ComfyAppDefinition,
  state: Parameters<ComfyEngine["collect"]>[0],
  signal?: AbortSignal
): Promise<ComfyResolvedOutput[]> {
  const assets = await engine.collect(state, signal);
  const outputs = resolveOutputs(app, assets);
  if (outputs.length === 0) {
    throw new ComfyEngineError(
      `${engine.label} finished the run but produced no output. Check that the workflow's output node is connected and not muted. A preview-only output (text or 3D) can also come back empty on a repeat run, because it names no file to vary and the engine serves it from its cache.`
    );
  }
  return outputs;
}
