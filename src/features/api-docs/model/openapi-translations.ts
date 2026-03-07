import type { OpenApiTranslations } from "@/features/api-docs/model/openapi";

export type OpenApiMessages = Record<string, unknown>;

const getMessage = (messages: OpenApiMessages, path: string) => {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return null;
  }, messages);
};

export function getOpenApiTranslations(
  messages: OpenApiMessages,
): OpenApiTranslations {
  return {
    infoDescription:
      (getMessage(messages, "apiDocs.openapi.infoDescription") as string | null) ??
      undefined,
    tags: {
      images:
        (getMessage(messages, "apiDocs.openapi.tags.images") as string | null) ??
        undefined,
      videos:
        (getMessage(messages, "apiDocs.openapi.tags.videos") as string | null) ??
        undefined,
      audio:
        (getMessage(messages, "apiDocs.openapi.tags.audio") as string | null) ??
        undefined,
      models:
        (getMessage(messages, "apiDocs.openapi.tags.models") as string | null) ??
        undefined,
    },
    paths: {
      imageGeneration:
        (getMessage(
          messages,
          "apiDocs.openapi.paths.imageGeneration",
        ) as string | null) ?? undefined,
      videoGeneration:
        (getMessage(
          messages,
          "apiDocs.openapi.paths.videoGeneration",
        ) as string | null) ?? undefined,
      audioGeneration:
        (getMessage(
          messages,
          "apiDocs.openapi.paths.audioGeneration",
        ) as string | null) ?? undefined,
      imageStatus:
        (getMessage(
          messages,
          "apiDocs.openapi.paths.imageStatus",
        ) as string | null) ?? undefined,
      videoStatus:
        (getMessage(
          messages,
          "apiDocs.openapi.paths.videoStatus",
        ) as string | null) ?? undefined,
      audioStatus:
        (getMessage(
          messages,
          "apiDocs.openapi.paths.audioStatus",
        ) as string | null) ?? undefined,
      models:
        (getMessage(messages, "apiDocs.openapi.paths.models") as string | null) ??
        undefined,
    },
  };
}
