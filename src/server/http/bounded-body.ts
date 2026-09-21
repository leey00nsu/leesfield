/**
 * Reads request bodies with a hard byte budget.
 *
 * Next.js route handlers hand the raw stream to the app, so a declared length
 * cannot be trusted and a chunked upload has no length at all. These readers
 * stop the stream themselves, which keeps multipart and JSON parsing inside a
 * known memory budget.
 */

export type BodyLimitCode =
  | "BODY_TOO_LARGE"
  | "BODY_INVALID"
  | "BODY_TIMEOUT"
  | "BODY_ABORTED"
  | "INGRESS_BUSY";

export class BodyLimitError extends Error {
  readonly code: BodyLimitCode;
  readonly status: number;

  constructor(code: BodyLimitCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "BodyLimitError";
    this.code = code;
    this.status = status;
  }
}

export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export const GENERATION_BODY_LIMIT_BYTES = 64 * 1024 * 1024;
export const GRAPH_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
export const BODY_READ_TIMEOUT_MS = 30_000;

/** How many heavy bodies may be buffered at the same time in this process. */
export const HEAVY_BODY_CONCURRENCY = 2;

let heavyBodyInFlight = 0;

export function resetHeavyBodyGaugeForTests(): void {
  heavyBodyInFlight = 0;
}

function acquireHeavyBodySlot(): void {
  if (heavyBodyInFlight >= HEAVY_BODY_CONCURRENCY) {
    throw new BodyLimitError(
      "INGRESS_BUSY",
      503,
      "Another large request is being processed. Retry shortly.",
    );
  }
  heavyBodyInFlight += 1;
}

function releaseHeavyBodySlot(): void {
  heavyBodyInFlight = Math.max(0, heavyBodyInFlight - 1);
}

export async function readBoundedBytes(
  request: Request,
  maxBytes: number,
  timeoutMs: number = BODY_READ_TIMEOUT_MS,
): Promise<Buffer> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const parsed = Number(declared);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new BodyLimitError("BODY_TOO_LARGE", 413);
    }
  }

  const stream = request.body;
  if (!stream) return Buffer.alloc(0);

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: ((error: BodyLimitError) => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new BodyLimitError("BODY_TIMEOUT", 408)),
      timeoutMs,
    );
  });
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () =>
    rejectAbort?.(new BodyLimitError("BODY_ABORTED", 499));
  if (request.signal.aborted) onAbort();
  else request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await Promise.race([
        reader.read(),
        timeout,
        aborted,
      ]);
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new BodyLimitError("BODY_TOO_LARGE", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

export async function readBoundedJsonBody(
  request: Request,
  maxBytes: number = JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  const bytes = await readBoundedBytes(request, maxBytes);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BodyLimitError("BODY_INVALID", 400, "INVALID_JSON");
  }
}

export type MultipartLimits = {
  maxBytes?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalFileBytes?: number;
};

export type MultipartFileInfo = {
  field: string;
  name: string;
  size: number;
};

export function inspectMultipartFiles(
  form: FormData,
  limits: MultipartLimits = {},
): MultipartFileInfo[] {
  const maxFiles = limits.maxFiles ?? 8;
  const maxFileBytes = limits.maxFileBytes ?? 10 * 1024 * 1024;
  const maxTotalFileBytes = limits.maxTotalFileBytes ?? 64 * 1024 * 1024;

  const files: MultipartFileInfo[] = [];
  let total = 0;
  for (const [field, value] of form.entries()) {
    if (typeof value === "string") continue;
    if (value.size === 0) {
      throw new BodyLimitError("BODY_INVALID", 400, "INVALID_FILE");
    }
    if (value.size > maxFileBytes) {
      throw new BodyLimitError("BODY_TOO_LARGE", 413, "FILE_TOO_LARGE");
    }
    total += value.size;
    if (total > maxTotalFileBytes) {
      throw new BodyLimitError("BODY_TOO_LARGE", 413, "FILES_TOO_LARGE");
    }
    files.push({ field, name: value.name, size: value.size });
    if (files.length > maxFiles) {
      throw new BodyLimitError("BODY_TOO_LARGE", 413, "TOO_MANY_FILES");
    }
  }
  return files;
}

export async function readBoundedFormDataBody(
  request: Request,
  limits: MultipartLimits = {},
): Promise<FormData> {
  const maxBytes = limits.maxBytes ?? GENERATION_BODY_LIMIT_BYTES;
  const contentType = request.headers.get("content-type") ?? "";
  const bytes = await readBoundedBytes(request, maxBytes);
  const payload = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  let form: FormData;
  try {
    form = await new Response(payload, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new BodyLimitError("BODY_INVALID", 400, "INVALID_FORM_DATA");
  }
  inspectMultipartFiles(form, limits);
  return form;
}

/**
 * Runs a heavy parse while holding a process-wide slot, so a burst of large
 * uploads cannot buffer every body at once.
 */
export async function withHeavyBodyPermit<T>(action: () => Promise<T>): Promise<T> {
  acquireHeavyBodySlot();
  try {
    return await action();
  } finally {
    releaseHeavyBodySlot();
  }
}

/** Maps buffers into Files with limited parallelism. */
export type BoundedRouteBody =
  | { ok: true; body: unknown }
  | { ok: false; code: string; status: number };

/**
 * Route-level JSON reader. A malformed body keeps the previous null-body
 * behaviour so validation still answers 400, while an oversized or busy
 * request fails with its own status instead of being parsed.
 */
export async function readRouteJsonBody(
  request: Request,
  maxBytes: number = JSON_BODY_LIMIT_BYTES,
  acquirePermit = true,
): Promise<BoundedRouteBody> {
  try {
    const read = () => readBoundedJsonBody(request, maxBytes);
    const body = acquirePermit ? await withHeavyBodyPermit(read) : await read();
    return { ok: true, body };
  } catch (error) {
    if (error instanceof BodyLimitError && error.code !== "BODY_INVALID") {
      return { ok: false, code: error.code, status: error.status };
    }
    return { ok: true, body: null };
  }
}

/**
 * JSON reader for routes that answer malformed JSON with their own message.
 * An oversized or busy request still fails with its own status.
 */
export async function readValidatedJsonBody(
  request: Request,
  maxBytes: number = JSON_BODY_LIMIT_BYTES,
  invalidJsonMessage = "Invalid JSON",
  acquirePermit = true,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; status: number; message: string }
> {
  try {
    const read = () => readBoundedJsonBody(request, maxBytes);
    const body = acquirePermit ? await withHeavyBodyPermit(read) : await read();
    return { ok: true, body };
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return {
        ok: false,
        status: error.status,
        message: error.code === "BODY_INVALID" ? invalidJsonMessage : error.code,
      };
    }
    return { ok: true, body: null };
  }
}

export async function readRouteFormDataBody(
  request: Request,
  limits: MultipartLimits = {},
  acquirePermit = true,
): Promise<FormData | null> {
  const read = () => readBoundedFormDataBody(request, limits);
  return acquirePermit ? await withHeavyBodyPermit(read) : await read();
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length)))
    .fill(null)
    .map(async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    });
  await Promise.all(workers);
  return results;
}
