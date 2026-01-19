import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { defaultLocale, isLocale, localeCookie } from "@/shared/i18n/config";

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
  const cookieLocale = request.cookies.get(localeCookie)?.value;
  if (isLocale(cookieLocale)) {
    return NextResponse.next();
  }

  const locale = detectLocale(request);
  const response = NextResponse.next();
  response.cookies.set(localeCookie, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
