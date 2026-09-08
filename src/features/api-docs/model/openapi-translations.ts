import type { OpenApiTranslations } from "./openapi";
export type OpenApiMessages = Record<string, unknown>;
export function getOpenApiTranslations(
  messages: OpenApiMessages,
): OpenApiTranslations {
  const docs = messages.apiDocs as
    { openapi?: OpenApiTranslations } | undefined;
  return docs?.openapi ?? {};
}
