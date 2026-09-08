import "server-only";

import { cache } from "react";
import { getMessages } from "next-intl/server";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import {
  getOpenApiTranslations,
  type OpenApiMessages,
} from "@/features/api-docs/model/openapi-translations";

const documents = new Map<string, ReturnType<typeof getOpenApiDocument>>();

export const getOpenApiDocumentForApiDocs = cache(async () => {
  const messages = (await getMessages()) as OpenApiMessages;
  const translations = getOpenApiTranslations(messages);
  const key = JSON.stringify(translations);
  const existing = documents.get(key);
  if (existing) return existing;
  const document = getOpenApiDocument(translations);
  if (documents.size >= 4) documents.clear();
  documents.set(key, document);
  return document;
});
