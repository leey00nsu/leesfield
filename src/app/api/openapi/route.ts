import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import { getOpenApiTranslations } from "@/features/api-docs/model/openapi-translations";
import { defaultLocale, isLocale, localeCookie } from "@/shared/i18n/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookie)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const messages = (await import(`@/shared/i18n/messages/${locale}.json`)).default as Record<
    string,
    unknown
  >;

  const document = getOpenApiDocument(getOpenApiTranslations(messages));

  return NextResponse.json(document, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
