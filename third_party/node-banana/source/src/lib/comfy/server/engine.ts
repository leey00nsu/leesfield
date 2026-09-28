/**
 * The engine interface.
 *
 * Node Banana drives ComfyUI over two different wire protocols and hides the
 * difference behind this one interface:
 *
 * - {@link import("./legacyEngine").LegacyComfyEngine} speaks the classic
 *   `/api/prompt` + `/api/history` surface that every ComfyUI has served for
 *   years. It is the only option for a stock local install, and Comfy Cloud
 *   serves it too.
 * - {@link import("./sdkEngine").SdkComfyEngine} speaks the Comfy API v2
 *   (`/api/v2/jobs`) through `@comfyorg/sdk`, which adds content-addressed
 *   asset dedup, idempotent submits and typed errors. Available on Comfy Cloud
 *   and on a self-hosted install fronted by `comfy-api-proxy`.
 *
 * Engines are **stateless**: every method reconstructs what it needs from the
 * connection, so a job submitted by one request can be polled by the next —
 * which is what lets a 15-minute render outlive a single serverless
 * invocation.
 */

import type {
  ComfyConnection,
  ComfyGraph,
  ComfyObjectInfo,
  ComfyOutputType,
} from "../types";

/** Media uploaded to an engine before a run. */
export interface ComfyUploadInput {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

/**
 * What to write into the graph so a node reads the uploaded media.
 *
 * The legacy surface returns the filename the engine stored it under; the v2
 * surface returns a `core/ASSET` reference object. Both are patched into the
 * loader node's widget verbatim.
 */
export type ComfyUploadRef = string | Record<string, unknown>;

/** A job's state at one point in time. */
export interface ComfyJobState {
  /** Engine-reported status string, passed through for display. */
  status: string;
  /** True once the job will not change again. */
  terminal: boolean;
  /** Set when the job ended in anything other than success. */
  error: string | null;
  /**
   * Graph node the engine blamed, when it named one.
   *
   * Kept apart from {@link error} because the caller can say more about it than
   * the engine can: a node this importer invented has an id the user has never
   * seen anywhere.
   */
  errorNodeId?: string;
  /** 0–1 when the engine reports progress. */
  progress?: number;
  /** Opaque payload the same engine consumes in {@link ComfyEngine.collect}. */
  raw: unknown;
}

/**
 * A partial image an engine emitted mid-run — the latent as it forms.
 *
 * Throttled and lossy by design: it is a glimpse of work in progress, never a
 * result, and is deliberately kept out of anything that persists.
 */
export interface ComfyPreviewFrame {
  /** Graph node that produced it. */
  nodeId: string;
  /** Data URL, ready to put in an `<img>`. */
  dataUrl: string;
}

/** One finished output, already downloaded. */
export interface ComfyOutputAsset {
  /** Graph node that produced it. */
  nodeId: string;
  type: ComfyOutputType;
  /** Media payload — absent for text outputs. */
  bytes?: Uint8Array;
  contentType?: string;
  filename?: string;
  /** Text payload — present only for text outputs. */
  text?: string;
}

export interface ComfySubmitOptions {
  /**
   * comfy.org key authenticating partner/API nodes *inside* the graph. Sent as
   * `extra_data.api_key_comfy_org`; without it those nodes fail with "Please
   * login first to use this node" even on an authorized job.
   */
  orgApiKey?: string | null;
  signal?: AbortSignal;
}

export interface ComfyEngine {
  readonly connection: ComfyConnection;
  /** Human-readable name for error messages. */
  readonly label: string;

  /** Reachability + auth probe. Never throws. */
  ping(signal?: AbortSignal): Promise<{ ok: boolean; detail: string }>;

  /** The engine's node catalog — needed to interpret editor-format saves. */
  objectInfo(signal?: AbortSignal): Promise<ComfyObjectInfo>;

  /** Upload one media input, returning the value to patch into the graph. */
  upload(input: ComfyUploadInput, signal?: AbortSignal): Promise<ComfyUploadRef>;

  /** Enqueue a graph. Returns the id used to poll it. */
  submit(graph: ComfyGraph, options?: ComfySubmitOptions): Promise<string>;

  /** Read a job's current state. */
  poll(jobId: string, signal?: AbortSignal): Promise<ComfyJobState>;

  /** Download everything a finished job produced. */
  collect(state: ComfyJobState, signal?: AbortSignal): Promise<ComfyOutputAsset[]>;

  /** Best-effort stop. Must never throw. */
  cancel(jobId: string, signal?: AbortSignal): Promise<void>;

  /**
   * Partial images while the job runs, if this engine can produce them.
   *
   * Optional because only the v2 surface has an event stream: a stock ComfyUI
   * says nothing at all until `/history` fills in, so there is no honest
   * implementation to give it. Callers must treat its absence as normal.
   */
  previews?(jobId: string, signal?: AbortSignal): AsyncGenerator<ComfyPreviewFrame, void, void>;
}

/** An engine-reported failure that should be shown to the user verbatim. */
export class ComfyEngineError extends Error {
  readonly status: number;
  /**
   * True when the engine never answered — a dropped socket, a DNS blip.
   *
   * Nothing has been decided about the job in that case, so a caller waiting on
   * a render can try again. An engine *verdict* is not transient, however bad.
   */
  readonly transient: boolean;
  constructor(message: string, status = 502, options: { transient?: boolean } = {}) {
    super(message);
    this.name = "ComfyEngineError";
    this.status = status;
    this.transient = options.transient ?? false;
  }
}

/**
 * Whether a thrown error means the engine never gave an answer, as opposed to
 * giving one we did not like.
 *
 * Three shapes mean the same thing. Node reports a failed connection as a bare
 * `TypeError: fetch failed`, hiding the real reason — ECONNRESET, EAI_AGAIN, a
 * dual-stack connect timeout — in `cause`. A request we stopped waiting for
 * surfaces either as a `TimeoutError` (from `AbortSignal.timeout`, which the
 * Comfy SDK arms on every call) or as the plain Error {@link
 * import("./fetch").resilientFetch} raises. None of them settles anything about
 * the job that was asked about.
 */
export function engineNeverAnswered(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError") return true;
  if (/timed out after \d+ms/i.test(error.message)) return true;
  if (error.name === "TypeError" && /fetch failed|network|load failed/i.test(error.message)) {
    return true;
  }
  const code = errorCode(error);
  return code !== null && /^(ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|UND_ERR)/.test(code);
}

/**
 * The OS-level code behind a failed `fetch`, wherever it is buried.
 *
 * undici puts a single failure in `cause.code`, but a dual-stack host that
 * could not be reached on any address yields an `AggregateError` whose own
 * `code` is set and whose `errors` hold one entry per address tried.
 */
export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const self = (error as { code?: unknown }).code;
  if (typeof self === "string") return self;
  const cause = (error as { cause?: unknown }).cause;
  if (cause) {
    // A cause that carries no code is not an answer — an AggregateError can
    // hold both a bare cause and one coded entry per address tried, and
    // stopping here would report no code at all for it.
    const fromCause = errorCode(cause);
    if (fromCause) return fromCause;
  }
  const nested = (error as { errors?: unknown }).errors;
  if (Array.isArray(nested)) {
    for (const inner of nested) {
      const code = errorCode(inner);
      if (code) return code;
    }
  }
  return null;
}
