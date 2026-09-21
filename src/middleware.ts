import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { defaultLocale, isLocale, localeCookie } from "@/shared/i18n/config";
import {
  REQUEST_ID_HEADER,
  requestIdFromValue,
} from "@/shared/http/request-id";

function detectLocale(request: NextRequest) {
  const header = request.headers.get("accept-language");
  if (!header) return defaultLocale;

  const candidates = header
    .split(",")
    .map((value) => value.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalized = candidate.split("-")[0];
    if (isLocale(candidate)) return candidate;
    if (isLocale(normalized)) return normalized;
  }

  return defaultLocale;
}

export function middleware(request: NextRequest) {
  const requestId = requestIdFromValue(request.headers.get(REQUEST_ID_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return response;
  }

  const cookieLocale = request.cookies.get(localeCookie)?.value;
  if (isLocale(cookieLocale)) {
    return response;
  }

  const locale = detectLocale(request);
  response.cookies.set(localeCookie, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
