import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
export function mappedModel(
  type: "image" | "video" | "audio" = "image",
): ModelCatalogItem {
  const binding = (
    name: string,
    kind: string,
    order: number,
    schema: unknown,
    extra: unknown = {},
  ) => ({
    source: "hf_space",
    parameterName: name,
    kind,
    valueType:
      kind === "file"
        ? kind
        : ["string", "number", "boolean"].includes(kind)
          ? kind
          : "string",
    order,
    schema,
    ...(extra as object),
  });
  return {
    id: type + "-private-id",
    key: type + "-private-key",
    label: "Private " + type,
    type,
    vendor: "Private vendor",
    provider: "hf_space",
    providerConfig: {
      space_id: "private/secret-space",
      api_name: "/generate",
      output: { media: type, path: [0], multiple: false },
      secret: "do-not-expose",
    },
    parameters: {
      prompt: {
        label: "Prompt",
        required: true,
        binding: binding(
          "text",
          "string",
          0,
          { type: "string", minLength: 1 },
          { canonicalKey: "prompt" },
        ),
      },
      seed: {
        label: "Seed",
        required: false,
        default: 0,
        min: 0,
        binding: binding("seed", "number", 1, { type: "integer" }),
      },
      enabled: {
        label: "Enabled",
        required: false,
        default: false,
        binding: binding("enabled", "boolean", 2, { type: "boolean" }),
      },
      frame: {
        label: "Frame",
        required: false,
        binding: binding("frame", "file", 3, {}),
      },
      frames: {
        label: "Frames",
        required: false,
        binding: binding("frames", "files", 4, {}),
      },
      options: {
        label: "Options",
        required: false,
        binding: binding("options", "json", 5, {
          type: "object",
          properties: { count: { type: "integer", minimum: 1 } },
          required: ["count"],
          additionalProperties: false,
        }),
      },
    },
    meta: { private_internal: "hidden" },
    isActive: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ModelCatalogItem;
}
