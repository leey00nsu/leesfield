import { lookup } from "node:dns/promises";
import net from "node:net";

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

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

function isForbiddenIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isForbiddenIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isForbiddenIp(normalized.slice("::ffff:".length));
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  );
}

function isForbiddenIp(ip: string): boolean {
  const normalized = normalizeHostname(ip);
  const version = net.isIP(normalized);
  if (version === 4) return isForbiddenIpv4(normalized);
  if (version === 6) return isForbiddenIpv6(normalized);
  return true;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

async function assertSafeHttpUrl(
  url: URL,
  invalidErrorCode: string,
): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(invalidErrorCode);
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isLocalHostname(hostname)) {
    fail(invalidErrorCode);
  }

  if (net.isIP(hostname)) {
    if (isForbiddenIp(hostname)) fail(invalidErrorCode);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    fail(invalidErrorCode);
  }

  if (
    addresses.length === 0 ||
    addresses.some((entry) => isForbiddenIp(entry.address))
  ) {
    fail(invalidErrorCode);
  }
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function assertResponseSize(
  response: Response,
  maxBytes: number,
  errorCode: string,
): void {
  const contentLength = response.headers.get("content-length");
  if (!contentLength) return;
  const parsed = Number(contentLength);
  if (Number.isFinite(parsed) && parsed > maxBytes) {
    fail(errorCode);
  }
}

async function readLimitedResponseBuffer(
  response: Response,
  maxBytes: number,
  errorCode: string,
): Promise<Buffer> {
  assertResponseSize(response, maxBytes, errorCode);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    fail(errorCode);
  }
  return buffer;
}

function normalizeContentType(response: Response): string {
  return (
    response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ??
    "application/octet-stream"
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

export async function fetchHttpInputImageBuffer(
  url: string,
  options: ResolveInputImageOptions,
): Promise<ResolvedInputImageBuffer> {
  const fetchErrorCode = options.fetchErrorCode ?? options.invalidErrorCode;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_INPUT_IMAGE_BYTES;
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    fail(options.invalidErrorCode);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      await assertSafeHttpUrl(current, options.invalidErrorCode);
      const response = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
      });

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) fail(fetchErrorCode);
        current = new URL(location, current);
        continue;
      }

      if (!response.ok) {
        fail(fetchErrorCode);
      }

      return {
        buffer: await readLimitedResponseBuffer(
          response,
          maxBytes,
          options.invalidErrorCode,
        ),
        mime: normalizeContentType(response),
      };
    }
    fail(fetchErrorCode);
  } catch (error) {
    if (isKnownInputError(error, options)) {
      throw error;
    }
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
