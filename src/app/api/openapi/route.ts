import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getOpenApiDocument,
  type OpenApiTranslations,
} from "@/features/api-docs/model/openapi";
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

  const getMessage = (path: string) => {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, unknown>)[key];
      }
      return null;
    }, messages);
  };

  const apiDocsTranslations: OpenApiTranslations = {
    infoDescription:
      (getMessage("apiDocs.openapi.infoDescription") as string | null) ??
      undefined,
    tags: {
      images: (getMessage("apiDocs.openapi.tags.images") as string | null) ?? undefined,
      videos: (getMessage("apiDocs.openapi.tags.videos") as string | null) ?? undefined,
      models: (getMessage("apiDocs.openapi.tags.models") as string | null) ?? undefined,
    },
    paths: {
      imageGeneration:
        (getMessage("apiDocs.openapi.paths.imageGeneration") as string | null) ??
        undefined,
      videoGeneration:
        (getMessage("apiDocs.openapi.paths.videoGeneration") as string | null) ??
        undefined,
      imageStatus:
        (getMessage("apiDocs.openapi.paths.imageStatus") as string | null) ??
        undefined,
      videoStatus:
        (getMessage("apiDocs.openapi.paths.videoStatus") as string | null) ??
        undefined,
      models:
        (getMessage("apiDocs.openapi.paths.models") as string | null) ?? undefined,
    },
  };

  const document = getOpenApiDocument(apiDocsTranslations);

  return NextResponse.json(document, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
