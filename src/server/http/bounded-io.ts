import { RemoteAccessError, requestRemote } from "@/server/http/safe-remote";

export const OUTBOUND_UPLOAD_TIMEOUT_MS = 120_000;
export const OUTBOUND_FILE_TIMEOUT_MS = 60_000;
export const OUTBOUND_CONCURRENCY = 2;
export const GENERATION_OUTPUT_MAX_COUNT = 8;
export const GENERATION_OUTPUT_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

export const GENERATION_OUTPUT_LIMITS = {
  image: 25 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024,
} as const;

export type GenerationMediaType = keyof typeof GENERATION_OUTPUT_LIMITS;

export class BoundedIoError extends Error {
  readonly code: "IO_RESPONSE_TOO_LARGE" | "IO_STREAM_ABORTED";

  constructor(code: "IO_RESPONSE_TOO_LARGE" | "IO_STREAM_ABORTED") {
    super(code);
    this.name = "BoundedIoError";
    this.code = code;
  }
}

function contentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Reads a fetch response without allowing an unbounded arrayBuffer/json call. */
export async function readFetchResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declared = contentLength(response.headers);
  if (declared !== null && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new BoundedIoError("IO_RESPONSE_TOO_LARGE");
  }

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new BoundedIoError("IO_RESPONSE_TOO_LARGE");
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let done = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        done = true;
        break;
      }
      if (!result.value) continue;
      total += result.value.byteLength;
      if (total > maxBytes) {
        throw new BoundedIoError("IO_RESPONSE_TOO_LARGE");
      }
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/** Reads only the first bytes needed for type inspection and cancels the rest. */
export async function readFetchResponsePrefix(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.subarray(0, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      const remaining = maxBytes - total;
      const chunk = result.value.byteLength > remaining
        ? result.value.subarray(0, remaining)
        : result.value;
      chunks.push(Buffer.from(chunk));
      total += chunk.byteLength;
      if (chunk.byteLength < result.value.byteLength || total === maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function readFetchResponseJson(
  response: Response,
  maxBytes = 1024 * 1024,
): Promise<unknown> {
  if (!response.body && typeof response.arrayBuffer !== "function") {
    return response.json();
  }
  const bytes = await readFetchResponseBytes(response, maxBytes);
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

export type LimitedReadableStreamOptions = {
  maxBytes: number;
  signal?: AbortSignal;
  onBytes?: (total: number) => void;
  onComplete?: (total: number) => void;
  onError?: (error: unknown) => void;
};

/** Forwards a body while enforcing a byte budget on streamed responses/requests. */
export function limitReadableStream(
  input: ReadableStream<Uint8Array>,
  options: LimitedReadableStreamOptions,
): ReadableStream<Uint8Array> {
  const reader = input.getReader();
  let total = 0;
  let settled = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const detachAbortListener = () => {
    options.signal?.removeEventListener("abort", onAbort);
  };

  const complete = (value: number) => {
    if (settled) return;
    settled = true;
    detachAbortListener();
    options.onComplete?.(value);
  };
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    detachAbortListener();
    options.onError?.(error);
  };
  const onAbort = () => {
    const error = new BoundedIoError("IO_STREAM_ABORTED");
    fail(error);
    void reader.cancel(error).catch(() => undefined);
    streamController?.error(error);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      if (options.signal) {
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener("abort", onAbort, { once: true });
      }
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          complete(total);
          controller.close();
          return;
        }
        if (!result.value) return;
        total += result.value.byteLength;
        options.onBytes?.(total);
        if (total > options.maxBytes) {
          const error = new BoundedIoError("IO_RESPONSE_TOO_LARGE");
          await reader.cancel(error).catch(() => undefined);
          fail(error);
          controller.error(error);
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        fail(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      fail(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) onAbort();
    else parent.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeoutId);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

/** Bounds a client operation whose library API does not accept AbortSignal. */
export async function awaitWithTimeout<T>(
  work: PromiseLike<T>,
  timeoutMs: number,
  timeoutCode: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type ParsedDataUrl = {
  contentType: string;
  buffer: Buffer;
};

export function decodeBase64DataUrl(
  value: string,
  options: {
    maxBytes: number;
    invalidCode: string;
    tooLargeCode?: string;
  },
): ParsedDataUrl {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || !match[1] || !match[2] || match[2].length % 4 === 1) {
    throw new Error(options.invalidCode);
  }
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  const estimatedBytes = Math.floor((match[2].length * 3) / 4) - padding;
  if (estimatedBytes > options.maxBytes) {
    throw new Error(options.tooLargeCode ?? "IO_RESPONSE_TOO_LARGE");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > options.maxBytes) {
    throw new Error(options.tooLargeCode ?? "IO_RESPONSE_TOO_LARGE");
  }
  return { contentType: match[1].toLowerCase(), buffer };
}

export async function fetchBoundedRemoteBytes(
  url: string,
  options: {
    timeoutMs: number;
    maxBytes: number;
    fetchErrorCode: string;
    timeoutErrorCode: string;
    tooLargeErrorCode?: string;
    signal?: AbortSignal;
  },
): Promise<{ buffer: Buffer; contentType: string | null }> {
  try {
    const response = await requestRemote(url, {
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      maxRedirects: 3,
      signal: options.signal,
    });
    if (response.status === 429) {
      throw new Error(`${options.fetchErrorCode}:429`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(options.fetchErrorCode);
    }
    return {
      buffer: response.body,
      contentType: response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? null,
    };
  } catch (error) {
    if (error instanceof Error && error.message === `${options.fetchErrorCode}:429`) {
      throw error;
    }
    if (error instanceof RemoteAccessError) {
      if (error.code === "REMOTE_TIMEOUT" || error.code === "REMOTE_ABORTED") {
        throw new Error(options.timeoutErrorCode);
      }
      if (error.code === "REMOTE_TOO_LARGE") {
        throw new Error(options.tooLargeErrorCode ?? "IO_RESPONSE_TOO_LARGE");
      }
    }
    throw new Error(options.fetchErrorCode);
  }
}

export function assertOutputCount(
  media: GenerationMediaType,
  count: number,
) {
  if (!Number.isSafeInteger(count) || count <= 0 || count > GENERATION_OUTPUT_MAX_COUNT) {
    throw new Error(`GENERATION_${media.toUpperCase()}_OUTPUT_COUNT_LIMIT`);
  }
}

export async function mapBoundedMediaOutputs<T>(
  refs: T[],
  media: GenerationMediaType,
  mapper: (ref: T, index: number, maxBytes: number) => Promise<string>,
) {
  assertOutputCount(media, refs.length);
  let totalBytes = 0;
  const results: string[] = [];
  for (const [index, ref] of refs.entries()) {
    const remaining = GENERATION_OUTPUT_MAX_TOTAL_BYTES - totalBytes;
    const maxBytes = Math.min(GENERATION_OUTPUT_LIMITS[media], remaining);
    if (maxBytes <= 0) throw new Error("GENERATION_OUTPUT_TOTAL_LIMIT");
    const dataUrl = await mapper(ref, index, maxBytes);
    const parsed = decodeBase64DataUrl(dataUrl, {
      maxBytes,
      invalidCode: `GENERATION_${media.toUpperCase()}_OUTPUT_INVALID`,
      tooLargeCode: `GENERATION_${media.toUpperCase()}_OUTPUT_TOO_LARGE`,
    });
    totalBytes += parsed.buffer.byteLength;
    if (totalBytes > GENERATION_OUTPUT_MAX_TOTAL_BYTES) {
      throw new Error("GENERATION_OUTPUT_TOTAL_LIMIT");
    }
    results.push(dataUrl);
  }
  return results;
}
