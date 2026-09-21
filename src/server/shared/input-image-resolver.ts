import {
  RemoteAccessError,
  requestRemote,
} from "@/server/http/safe-remote";

export type ResolvedInputImageBuffer = {
  buffer: Buffer;
  mime: string;
};

type ResolveInputImageOptions = {
  invalidErrorCode: string;
  timeoutMs: number;
  fetchErrorCode?: string;
  notBase64ErrorCode?: string;
  maxBytes?: number;
};

const DEFAULT_MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function fail(code: string): never {
  throw new Error(code);
}

function normalizeContentType(value: string | undefined): string {
  return (
    value?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream"
  );
}

function isKnownInputError(
  error: unknown,
  options: ResolveInputImageOptions,
): boolean {
  return (
    error instanceof Error &&
    [
      options.invalidErrorCode,
      options.fetchErrorCode,
      options.notBase64ErrorCode,
    ].includes(error.message)
  );
}

export function decodeDataUrlToInputImageBuffer(
  dataUrl: string,
  options: ResolveInputImageOptions,
): ResolvedInputImageBuffer {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    fail(options.notBase64ErrorCode ?? options.invalidErrorCode);
  }
  const buffer = Buffer.from(match[2], "base64");
  if (
    buffer.byteLength === 0 ||
    buffer.byteLength > (options.maxBytes ?? DEFAULT_MAX_INPUT_IMAGE_BYTES)
  ) {
    fail(options.invalidErrorCode);
  }
  return { buffer, mime: match[1].toLowerCase() };
}

/**
 * Fetches a caller-supplied image URL.
 *
 * Address policy, redirects, deadlines and the size cap come from the shared
 * remote reader, so the address that was validated is the address that gets
 * connected instead of relying on a separate DNS check.
 */
export async function fetchHttpInputImageBuffer(
  url: string,
  options: ResolveInputImageOptions,
): Promise<ResolvedInputImageBuffer> {
  const fetchErrorCode = options.fetchErrorCode ?? options.invalidErrorCode;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_INPUT_IMAGE_BYTES;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    // Shared http(s) input images keep working; private ranges, unexpected
    // ports and unsafe redirects are still rejected per hop.
    const response = await requestRemote(url, {
      timeoutMs: options.timeoutMs,
      maxBytes,
      maxRedirects: MAX_REDIRECTS,
      allowInsecureHttp: true,
      signal: controller.signal,
    });

    if (response.status < 200 || response.status >= 300) fail(fetchErrorCode);
    if (response.body.byteLength === 0 || response.body.byteLength > maxBytes) {
      fail(options.invalidErrorCode);
    }

    return {
      buffer: response.body,
      mime: normalizeContentType(response.headers["content-type"]),
    };
  } catch (error) {
    if (error instanceof RemoteAccessError) {
      // Validation failures keep the invalid-input code; transport failures
      // stay a fetch error, matching the previous contract.
      const validationFailure =
        error.code === "REMOTE_TOO_LARGE" ||
        error.code === "REMOTE_URL_INVALID" ||
        error.code === "REMOTE_PROTOCOL_BLOCKED" ||
        error.code === "REMOTE_CREDENTIALS_BLOCKED" ||
        error.code === "REMOTE_PORT_BLOCKED" ||
        error.code === "REMOTE_ADDRESS_BLOCKED";
      fail(
        validationFailure ? options.invalidErrorCode : fetchErrorCode,
      );
    }
    if (isKnownInputError(error, options)) throw error;
    fail(fetchErrorCode);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveInputImageBuffer(
  source: string,
  options: ResolveInputImageOptions,
): Promise<ResolvedInputImageBuffer> {
  if (source.startsWith("data:")) {
    return decodeDataUrlToInputImageBuffer(source, options);
  }
  return fetchHttpInputImageBuffer(source, options);
}
