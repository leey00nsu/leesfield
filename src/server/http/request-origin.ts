import { apiKeyHeader } from "@/shared/api/external-contract";
import { buildErrorResponse } from "@/server/http/response";
import { getServerEnv } from "@/server/runtime/env";

/**
 * Origin guard for cookie-authenticated mutations.
 *
 * Session cookies are sent automatically by the browser, so a state-changing
 * request must prove it came from this application. API-key callers are not
 * cookie-authenticated and keep working unchanged.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE_NAME = "leesfield_session";

export function isStateChangingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .some((part) => part.trim().startsWith(SESSION_COOKIE_NAME + "="));
}

function usesApiKey(request: Request): boolean {
  return Boolean(request.headers.get(apiKeyHeader)?.trim());
}

export function isAllowedRequestOrigin(
  request: Request,
  configuredOrigin: string | null,
): boolean {
  const origin = (request.headers.get("origin") ?? "").trim();
  if (!origin || origin === "null") return false;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;

  if (configuredOrigin && parsed.origin === configuredOrigin) return true;

  // A browser cannot forge the Host header of the request it sends, so an
  // origin that matches it is the same application behind this proxy.
  const host = request.headers.get("host");
  return Boolean(host) && parsed.host === host;
}

/**
 * Returns a response when a cookie-authenticated mutation must be rejected.
 * Requests without a session cookie and API-key callers are not affected.
 */
export function assertSessionMutationOrigin(request: Request): Response | null {
  if (!isStateChangingMethod(request.method)) return null;
  if (usesApiKey(request)) return null;
  if (!hasSessionCookie(request)) return null;

  const configuredOrigin = getServerEnv().appOrigin;
  if (isAllowedRequestOrigin(request, configuredOrigin)) return null;

  return buildErrorResponse("CSRF_ORIGIN_REQUIRED", 403);
}

