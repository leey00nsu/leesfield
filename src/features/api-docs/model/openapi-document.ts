import "server-only";

import { cache } from "react";
import { getMessages } from "next-intl/server";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import {
  getOpenApiTranslations,
  type OpenApiMessages,
} from "@/features/api-docs/model/openapi-translations";

export const getOpenApiDocumentForApiDocs = cache(async () => {
  const messages = (await getMessages()) as OpenApiMessages;
  const translations = getOpenApiTranslations(messages);
  return getOpenApiDocument(translations);
});
