/**
 * Resilient HTTP for ComfyUI engines.
 *
 * Two failure modes plague long-running engine calls and neither is handled by
 * a bare `fetch`: a request that hangs forever stalls the whole run, and a
 * momentary blip or 5xx throws away progress. This adds a per-request timeout
 * (combined with the caller's cancellation signal) plus bounded retries.
 *
 * The body is buffered inside the armed timeout window: `fetch` resolves at
 * headers, so a stalled or trickling body would otherwise escape both the
 * timeout and the caller's cancel.
 */

import { engineNeverAnswered, errorCode } from "./engine";

/**
 * A backoff the caller can cut short.
 *
 * Cancelling during a wait must land as soon as the user asks, not once the
 * backoff runs out — otherwise Stop appears to do nothing for a second or two,
 * and the loop then opens another attempt with a signal that is already
 * aborted. Resolves rather than rejects: the caller checks `aborted` itself and
 * has a more useful error to throw than this one would be.
 */
function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Transient statuses worth retrying (rate limit, gateway, overloaded). */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Statuses whose Response must be constructed with a null body. */
const NO_BODY_STATUS = new Set([204, 205, 304]);

export interface ResilientFetchOptions extends Omit<RequestInit, "signal"> {
  /** Abort after this many ms — bounds headers AND body. */
  timeoutMs?: number;
  /** Extra attempts on transient failures (0 = none). */
  retries?: number;
  /** Base backoff between attempts, in ms (grows exponentially). */
  retryBaseMs?: number;
  /** Caller's cancellation signal. */
  signal?: AbortSignal | undefined;
}

/**
 * `fetch` with a timeout, caller-cancellation, and bounded retries. Resolves
 * with a fully-buffered Response. A timeout surfaces as a plain (retryable)
 * Error — never an `AbortError` — so callers don't mistake it for a user
 * cancellation.
 */
export async function resilientFetch(
  url: string | URL,
  {
    timeoutMs = 30_000,
    retries = 0,
    retryBaseMs = 400,
    signal,
    ...init
  }: ResilientFetchOptions = {}
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        // Nothing reads this response, and an unread body holds its socket
        // until the collector gets to it — several retries of a 429 would
        // otherwise leave one open connection each.
        await res.body?.cancel().catch(() => undefined);
        await sleepUnlessAborted(retryBaseMs * 2 ** attempt, signal);
        continue;
      }
      // Consume the body before the finally disarms the timer — the timeout
      // must bound the whole transfer, and cancel must be able to kill a body
      // read, not just time-to-headers.
      const bytes = await res.arrayBuffer();
      return new Response(NO_BODY_STATUS.has(res.status) ? null : bytes, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (err) {
      if (signal?.aborted) {
        throw err instanceof Error && err.name === "AbortError"
          ? err
          : new DOMException("Aborted", "AbortError");
      }
      lastErr = controller.signal.aborted
        ? new Error(`Request to ${String(url)} timed out after ${timeoutMs}ms`)
        : err;
      if (attempt < retries) {
        await sleepUnlessAborted(retryBaseMs * 2 ** attempt, signal);
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Codes that prove the request never reached the engine.
 *
 * These are raised while opening the socket, so nothing was sent and nothing
 * can have been acted on — which is what makes repeating the request safe even
 * when it is a POST that would otherwise be dangerous to send twice.
 *
 * `ETIMEDOUT` inside an `AggregateError` is the common one in practice: Node
 * tries every address a dual-stack host resolves to, and reports the whole
 * batch failing this way when none of them answers in time.
 */
const CONNECT_FAILURE = /^(ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)$/;

/**
 * How long one attempt may take, by what the request is for.
 *
 * These cannot be one number. Collecting a finished job downloads every output
 * it produced, and a minute of video is tens of megabytes — but a *poll* is a
 * few hundred bytes, and letting one wait as long as a download is what turns a
 * stalled connection into a dead render: the caller's own deadline is only
 * checked between polls, so a single request that hangs for minutes spends the
 * whole budget without the loop ever getting a turn.
 */
const DOWNLOAD_TIMEOUT_MS = 300_000;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * What one `/api/object_info` read may cost.
 *
 * The catalog is megabytes of JSON, and `getObjectInfo` caches one promise for
 * every concurrent caller — so its budget has to fit the *tightest* of them,
 * which is `/api/comfy/status` at 60 s. Five attempts of thirty seconds is
 * 150 s: the route is killed long before that, and the user gets a platform
 * timeout in place of "connected, node count unknown".
 *
 * Two attempts rather than five for the same reason a stalled read is bounded
 * at all — a catalog that does not answer in twenty seconds does not answer in
 * a hundred and fifty either. Comfy Cloud's, measured hanging, went past ninety
 * on every one of five tries.
 */
export const CATALOG_TIMEOUT_MS = 20_000;
export const CATALOG_RETRIES = 1;

/** Asset routes move the bytes; everything else is small and should fail fast. */
const isAssetRoute = (url: string): boolean => /\/assets(\/|$|\?)/.test(url);

/** The URL of a fetch argument, whatever shape it arrived in. */
function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export interface EngineFetchOptions {
  /** Extra attempts after a connection that never opened. */
  retries?: number;
  /** Base backoff between attempts, in ms (grows exponentially). */
  retryBaseMs?: number;
  /** Cap on one small request — a submit, a poll, a cancel. */
  requestTimeoutMs?: number;
  /** Cap on one asset transfer, which may be a whole video. */
  downloadTimeoutMs?: number;
}

/**
 * A `fetch` that survives a connection which never opened.
 *
 * `@comfyorg/sdk` performs its own HTTP and retries nothing below the API layer,
 * so a single failed connect ends an upload, a submit, or a poll — and with it
 * the whole render. It does accept a `fetch` implementation, which is the seam
 * this fills: the SDK keeps its protocol handling and gains the same
 * resilience {@link resilientFetch} already gives the legacy engine.
 *
 * Only connect-phase failures are repeated for a request that changes state.
 * A GET may also be repeated on any unanswered request, because asking twice
 * costs nothing. Anything the engine actually answered is passed straight back:
 * a 4xx or 5xx is the engine talking, and this layer does not second-guess it.
 *
 * Retries are bounded in *time*, not just in count. A connect failure costs
 * about half a second, so four of them are cheap and worth having; a timeout
 * costs the whole timeout, and repeating that four times would take longer than
 * any caller is prepared to wait.
 */
export function createEngineFetch(options: EngineFetchOptions = {}): typeof fetch {
  // Four, not one or two: the failure this exists for was measured at roughly
  // two attempts in five against Comfy Cloud, which still leaves about one run
  // in twenty dying after three tries. Each extra attempt costs a few hundred
  // milliseconds of backoff and only ever happens when no socket opened.
  const {
    retries = 4,
    retryBaseMs = 300,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    downloadTimeoutMs = DOWNLOAD_TIMEOUT_MS,
  } = options;

  return async function engineFetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const repeatable = method === "GET" || method === "HEAD";
    const timeoutMs = isAssetRoute(urlOf(input)) ? downloadTimeoutMs : requestTimeoutMs;
    // One stalled attempt may not cost more than one timeout; the whole call may
    // not cost more than two. Past that the caller is better served by an error
    // it can act on than by another wait.
    const deadline = Date.now() + timeoutMs * 2;

    for (let attempt = 0; ; attempt += 1) {
      const caller = init?.signal ?? undefined;
      // Never longer than the budget that is left. A first attempt gets the
      // whole timeout; a later one gets whatever the earlier attempts and their
      // backoff did not spend, so the last request cannot run past the deadline
      // it was allowed to start before.
      const attemptMs = Math.max(1, Math.min(timeoutMs, deadline - Date.now()));
      const signal = caller
        ? AbortSignal.any([caller, AbortSignal.timeout(attemptMs)])
        : AbortSignal.timeout(attemptMs);
      try {
        return await fetch(input, { ...init, signal });
      } catch (error) {
        // The caller cancelling is not a failure to retry past.
        if (caller?.aborted) throw error;
        const code = errorCode(error);
        const neverConnected = code !== null && CONNECT_FAILURE.test(code);
        const worthRetrying = neverConnected || (repeatable && engineNeverAnswered(error));
        // The count bounds the cheap case and the deadline bounds the expensive
        // one. A refused connect costs milliseconds, so four of them fit inside
        // the budget easily; `ETIMEDOUT` is also a connect failure and costs a
        // whole timeout, and repeating *that* four times is exactly the wait
        // the deadline above exists to forbid.
        const budgetLeft = Date.now() < deadline && (neverConnected ? attempt < retries : true);
        if (!worthRetrying || !budgetLeft) throw error;
        // The backoff spends the same budget the requests do. Left uncapped, a
        // caller-configured `retryBaseMs` could sleep past the deadline and
        // still start another attempt, because the check above already passed.
        const backoff = retryBaseMs * 2 ** Math.min(attempt, 4);
        await sleepUnlessAborted(Math.min(backoff, deadline - Date.now()), caller);
        if (caller?.aborted || Date.now() >= deadline) throw error;
      }
    }
  };
}
