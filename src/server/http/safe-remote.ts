import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { measureProvider } from "@/server/observability/request-observability";

/**
 * Outbound requests to caller-controlled or provider-supplied URLs.
 *
 * The validated address is pinned for the actual socket connection, so a DNS
 * answer cannot change between the policy check and the connect (rebinding).
 * Every redirect hop is validated again, deadlines cover the body read, and the
 * response size is capped while it streams.
 */

export type RemoteErrorCode =
  | "REMOTE_URL_INVALID"
  | "REMOTE_PROTOCOL_BLOCKED"
  | "REMOTE_CREDENTIALS_BLOCKED"
  | "REMOTE_PORT_BLOCKED"
  | "REMOTE_ADDRESS_BLOCKED"
  | "REMOTE_REDIRECT_LIMIT"
  | "REMOTE_TIMEOUT"
  | "REMOTE_TOO_LARGE"
  | "REMOTE_ABORTED"
  | "REMOTE_NETWORK_ERROR";

export class RemoteAccessError extends Error {
  readonly code: RemoteErrorCode;

  constructor(code: RemoteErrorCode, message?: string) {
    super(message ? code + ": " + message : code);
    this.name = "RemoteAccessError";
    this.code = code;
  }
}

export type RemoteRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowInsecureHttp?: boolean;
  allowedPorts?: number[];
  signal?: AbortSignal;
  resolveAddresses?: (hostname: string) => Promise<string[]>;
  isAllowedAddress?: (address: string) => boolean;
};

export type RemoteResponse = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  location: string | null;
  url: string;
};

export type RemoteStreamResponse = Omit<RemoteResponse, "body"> & {
  body: ReadableStream<Uint8Array>;
};

function limitRemoteBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          return;
        }
        if (!result.value) return;
        total += result.value.byteLength;
        if (total > maxBytes) {
          const error = new RemoteAccessError("REMOTE_TOO_LARGE");
          await reader.cancel(error).catch(() => undefined);
          controller.error(error);
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const REMOTE_MAX_SOCKETS = 16;
const SENSITIVE_HEADERS = ["authorization", "cookie", "proxy-authorization"];

// Keep-alive avoids creating a new socket for every provider/file hop while
// the per-host socket cap keeps a burst from consuming the whole process.
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: REMOTE_MAX_SOCKETS,
  maxFreeSockets: 4,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: REMOTE_MAX_SOCKETS,
  maxFreeSockets: 4,
});

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
    return isForbiddenRemoteAddress(normalized.slice("::ffff:".length));
  }
  const firstHextet = Number.parseInt(normalized.split(":", 1)[0] ?? "", 16);
  const isLinkLocal = Number.isInteger(firstHextet) &&
    (firstHextet & 0xffc0) === 0xfe80;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    isLinkLocal ||
    normalized.startsWith("ff")
  );
}

function singleStreamRequest(
  target: URL,
  address: string,
  options: RemoteRequestOptions,
): Promise<RemoteStreamResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const transport = target.protocol === "https:" ? https : http;

  return new Promise<RemoteStreamResponse>((resolve, reject) => {
    let headersResolved = false;
    let activeResponse: http.IncomingMessage | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const failBeforeHeaders = (error: RemoteAccessError) => {
      if (!headersResolved) reject(error);
    };
    function onAbort() {
      const error = new RemoteAccessError("REMOTE_ABORTED");
      if (activeResponse) activeResponse.destroy(error);
      else request.destroy(error);
      failBeforeHeaders(error);
    }
    const pinnedLookup: PinnedLookup = (_hostname, lookupOptions, callback) => {
      const family = net.isIP(address) === 6 ? 6 : 4;
      callback(
        null,
        lookupOptions?.all ? [{ address, family }] : address,
        lookupOptions?.all ? undefined : family,
      );
    };
    const request = transport.request(
      {
        hostname: target.hostname,
        port: target.port ? Number(target.port) : undefined,
        path: target.pathname + target.search,
        method: options.method ?? "GET",
        headers: { ...(options.headers ?? {}) },
        lookup: pinnedLookup as unknown as http.RequestOptions["lookup"],
        agent: target.protocol === "https:" ? httpsAgent : httpAgent,
        ...(target.protocol === "https:" ? { servername: target.hostname } : {}),
      },
      (response) => {
        headersResolved = true;
        activeResponse = response;
        response.once("end", cleanup);
        response.once("close", cleanup);
        const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
        resolve({
          status: response.statusCode ?? 0,
          headers: toHeaderRecord(response.headers),
          body,
          location: response.headers.location ?? null,
          url: target.toString(),
        });
      },
    );
    deadlineTimer = setTimeout(() => {
      const error = new RemoteAccessError("REMOTE_TIMEOUT");
      if (activeResponse) activeResponse.destroy(error);
      else request.destroy(error);
      failBeforeHeaders(error);
    }, timeoutMs);
    request.once("error", (error: Error & { code?: string }) => {
      cleanup();
      failBeforeHeaders(
        error.name === "AbortError"
          ? new RemoteAccessError("REMOTE_ABORTED")
          : new RemoteAccessError("REMOTE_NETWORK_ERROR", error.code ?? error.message),
      );
    });
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

/** Loopback, link-local, private, CGNAT and multicast ranges stay blocked. */
export function isForbiddenRemoteAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const version = net.isIP(normalized);
  if (version === 4) return isForbiddenIpv4(normalized);
  if (version === 6) return isForbiddenIpv6(normalized);
  return true;
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function defaultAllowedPorts(protocol: string): number[] {
  return protocol === "https:" ? [443] : [80];
}

function validateTarget(rawUrl: string, options: RemoteRequestOptions): URL {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new RemoteAccessError("REMOTE_URL_INVALID");
  }

  const allowInsecureHttp = options.allowInsecureHttp === true;
  if (target.protocol !== "https:" && !(allowInsecureHttp && target.protocol === "http:")) {
    throw new RemoteAccessError("REMOTE_PROTOCOL_BLOCKED");
  }
  if (target.username || target.password) {
    throw new RemoteAccessError("REMOTE_CREDENTIALS_BLOCKED");
  }

  const allowedPorts =
    options.allowedPorts ?? defaultAllowedPorts(target.protocol);
  const effectivePort = target.port
    ? Number(target.port)
    : target.protocol === "https:"
      ? 443
      : 80;
  if (allowedPorts.length > 0 && !allowedPorts.includes(effectivePort)) {
    throw new RemoteAccessError("REMOTE_PORT_BLOCKED");
  }

  const hostname = normalizeHostname(target.hostname);
  if (!hostname || isLocalHostname(hostname)) {
    throw new RemoteAccessError("REMOTE_ADDRESS_BLOCKED");
  }

  return target;
}

export async function resolvePinnedAddress(
  hostname: string,
  options: RemoteRequestOptions = {},
): Promise<string> {
  const normalized = normalizeHostname(hostname);
  const isAllowed = options.isAllowedAddress ?? ((address: string) => !isForbiddenRemoteAddress(address));

  if (net.isIP(normalized)) {
    if (!isAllowed(normalized)) {
      throw new RemoteAccessError("REMOTE_ADDRESS_BLOCKED");
    }
    return normalized;
  }

  const resolveAddresses =
    options.resolveAddresses ??
    (async (host: string) => {
      const entries = await dnsLookup(host, { all: true, verbatim: true });
      return entries.map((entry) => entry.address);
    });

  let addresses: string[];
  try {
    addresses = await resolveAddresses(normalized);
  } catch {
    throw new RemoteAccessError("REMOTE_NETWORK_ERROR");
  }

  if (addresses.length === 0) {
    throw new RemoteAccessError("REMOTE_ADDRESS_BLOCKED");
  }
  for (const address of addresses) {
    if (!isAllowed(address)) {
      throw new RemoteAccessError("REMOTE_ADDRESS_BLOCKED");
    }
  }

  return addresses[0];
}

function toHeaderRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    record[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return record;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function resolvePinnedAddressWithinDeadline(
  hostname: string,
  options: RemoteRequestOptions,
  timeoutMs: number,
) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      reject(new RemoteAccessError("REMOTE_TIMEOUT"));
    }, timeoutMs);
    function onAbort() {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onAbort);
      reject(new RemoteAccessError("REMOTE_ABORTED"));
    }
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    resolvePinnedAddress(hostname, options).then(
      (address) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        options.signal?.removeEventListener("abort", onAbort);
        resolve(address);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

type PinnedLookupOptions = { all?: boolean } | undefined;
type PinnedLookupResult = string | Array<{ address: string; family: number }>;
type PinnedLookup = (
  hostname: string,
  lookupOptions: PinnedLookupOptions,
  callback: (error: Error | null, address: PinnedLookupResult, family?: number) => void,
) => void;

function singleRequest(
  target: URL,
  address: string,
  options: RemoteRequestOptions,
): Promise<RemoteResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const transport = target.protocol === "https:" ? https : http;

  return new Promise<RemoteResponse>((resolve, reject) => {
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: RemoteAccessError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (value: RemoteResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    function onAbort() {
      request.destroy();
      fail(new RemoteAccessError("REMOTE_ABORTED"));
    }

    const pinnedLookup: PinnedLookup = (_hostname, lookupOptions, callback) => {
      const family = net.isIP(address) === 6 ? 6 : 4;
      // net may request every answer; the pin always has exactly one.
      if (lookupOptions && lookupOptions.all) {
        callback(null, [{ address, family }]);
        return;
      }
      callback(null, address, family);
    };

    const request = transport.request(
      {
        hostname: target.hostname,
        port: target.port ? Number(target.port) : undefined,
        path: target.pathname + target.search,
        method: options.method ?? "GET",
        headers: { ...(options.headers ?? {}) },
        lookup: pinnedLookup as unknown as http.RequestOptions["lookup"],
        agent: target.protocol === "https:" ? httpsAgent : httpAgent,
        ...(target.protocol === "https:" ? { servername: target.hostname } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let finished = false;

        response.on("data", (chunk: Buffer) => {
          if (finished) return;
          total += chunk.length;
          if (total > maxBytes) {
            finished = true;
            response.destroy();
            request.destroy();
            fail(new RemoteAccessError("REMOTE_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (finished) return;
          finished = true;
          succeed({
            status: response.statusCode ?? 0,
            headers: toHeaderRecord(response.headers),
            body: Buffer.concat(chunks),
            location: response.headers.location ?? null,
            url: target.toString(),
          });
        });
        response.on("error", () => {
          if (finished) return;
          finished = true;
          fail(new RemoteAccessError("REMOTE_NETWORK_ERROR"));
        });
      },
    );

    deadlineTimer = setTimeout(() => {
      request.destroy();
      fail(new RemoteAccessError("REMOTE_TIMEOUT"));
    }, timeoutMs);

    request.on("error", (error: Error & { code?: string }) => {
      if (error.name === "AbortError") {
        fail(new RemoteAccessError("REMOTE_ABORTED"));
        return;
      }
      fail(new RemoteAccessError("REMOTE_NETWORK_ERROR", error.code ?? error.message));
    });

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

async function requestRemoteUnobserved(
  rawUrl: string,
  options: RemoteRequestOptions = {},
): Promise<RemoteResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let target = validateTarget(rawUrl, options);
  let headers: Record<string, string> = { ...(options.headers ?? {}) };

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new RemoteAccessError("REMOTE_TIMEOUT");
    }
    const address = await resolvePinnedAddressWithinDeadline(
      target.hostname,
      options,
      remaining,
    );
    const response = await singleRequest(target, address, {
      ...options,
      timeoutMs: remaining,
      headers,
    });

    if (!isRedirectStatus(response.status) || !response.location) {
      return response;
    }

    const next = new URL(response.location, target);
    if (next.origin !== target.origin) {
      headers = { ...headers };
      for (const header of SENSITIVE_HEADERS) delete headers[header];
    }
    target = validateTarget(next.toString(), options);
  }

  throw new RemoteAccessError("REMOTE_REDIRECT_LIMIT");
}

export async function requestRemote(
  rawUrl: string,
  options: RemoteRequestOptions = {},
): Promise<RemoteResponse> {
  return measureProvider("remote", () => requestRemoteUnobserved(rawUrl, options));
}

async function requestRemoteStreamUnobserved(
  rawUrl: string,
  options: RemoteRequestOptions = {},
): Promise<RemoteStreamResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let target = validateTarget(rawUrl, options);
  let headers: Record<string, string> = { ...(options.headers ?? {}) };

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new RemoteAccessError("REMOTE_TIMEOUT");
    const address = await resolvePinnedAddressWithinDeadline(
      target.hostname,
      options,
      remaining,
    );
    const response = await singleStreamRequest(target, address, {
      ...options,
      timeoutMs: remaining,
      headers,
    });
    if (!isRedirectStatus(response.status) || !response.location) {
      const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body.cancel().catch(() => undefined);
        throw new RemoteAccessError("REMOTE_TOO_LARGE");
      }
      return { ...response, body: limitRemoteBody(response.body, maxBytes) };
    }
    await response.body.cancel().catch(() => undefined);
    const next = new URL(response.location, target);
    if (next.origin !== target.origin) {
      headers = { ...headers };
      for (const header of SENSITIVE_HEADERS) delete headers[header];
    }
    target = validateTarget(next.toString(), options);
  }
  throw new RemoteAccessError("REMOTE_REDIRECT_LIMIT");
}

/** Streams a validated and DNS-pinned remote response without buffering it. */
export async function requestRemoteStream(
  rawUrl: string,
  options: RemoteRequestOptions = {},
): Promise<RemoteStreamResponse> {
  return measureProvider("remote", () =>
    requestRemoteStreamUnobserved(rawUrl, options),
  );
}
